import express from "express";
import { GoogleGenAI, Type } from "@google/genai";
import admin from "firebase-admin";
import { getDb } from "./_email.js";
import { sendOrderApprovedNotification } from "./_expiryService.js";

export const ordersRouter = express.Router();

let storedGmailToken: string | null = null;
let lastGmailTokenUpdate: string | null = null;

// Helper to get GoogleGenAI instance safely
function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in server environment");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function generate9DigitOrderId(): string {
  return Math.floor(100000000 + Math.random() * 900000000).toString();
}

// Retrieve stored Gmail Token from Firestore or memory
async function getActiveGmailToken(providedToken?: string): Promise<string | null> {
  // If the admin is passing a token directly to test/use, use it for this request, but DO NOT overwrite the global token memory cache
  // This prevents random users from poisoning the token pool.
  
  if (providedToken && providedToken.trim()) {
    return providedToken.trim();
  }

  if (storedGmailToken) {
    return storedGmailToken;
  }

  const firestore = getDb();
  if (firestore) {
    try {
      const snap = await firestore.collection("system_meta").doc("gmail_auth").get();
      if (snap.exists) {
        const data = snap.data();
        if (data?.token) {
          storedGmailToken = data.token;
          lastGmailTokenUpdate = data.updatedAt || null;
          return storedGmailToken;
        }
      }
    } catch (e) {
      console.warn("Failed to read gmail token from Firestore:", e);
    }
  }

  return null;
}

// 1. OCR endpoint: Recognize payment details from payment screenshot using Gemini AI
ordersRouter.post("/ocr-payment-receipt", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg" } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64 data in request" });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "").trim();
    const cleanMimeType = (mimeType && mimeType.startsWith("image/")) ? mimeType : "image/jpeg";
    const ai = getGenAI();

    const prompt = `You are an expert financial OCR parser. Analyze this bank transfer / mobile wallet payment receipt screenshot (e.g. EasyPaisa, JazzCash, SadaPay, NayaPay, Meezan Bank, HBL, Bank Alfalah, UBL, MCB, Allied Bank, Askari, Faysal, Raast, 1Link, etc.).
Extract the following payment fields accurately:
1. "trxId": The Transaction ID, TID, Reference Number (Ref No / Ref ID), Trx ID, or Receipt Number (numeric or alphanumeric).
2. "accountTitle": The sender / payer account title, sender name, or customer name (e.g. "Asmat Ullah", "Muhammad Ali", etc.).
3. "accountNumberLast4": The last 4 digits of the sender's account number, mobile wallet number, or IBAN.
4. "date": The transaction date formatted as YYYY-MM-DD if possible (e.g. "2026-08-21").
5. "time": The transaction time formatted as HH:MM in 24-hour format if possible (e.g. "14:35").
6. "dateTime": The exact date and time string from receipt (e.g. "2026-08-21 14:35" or "21 Aug 2026, 02:35 PM").
7. "amount": The numeric amount paid in PKR / Rs (e.g. 300, 750, 1400, 2600, 50, etc.).
8. "senderBank": The bank or payment application used (e.g. "EasyPaisa", "JazzCash", "SadaPay", "NayaPay", "Meezan Bank", "HBL", "Bank Alfalah", etc.).
9. "receiverAccount": The recipient account title or number if visible (e.g. "MovizNow", "Asmat Ullah", etc.).

Return ONLY a valid JSON object matching the requested schema.`;

    const modelsToTry = ["gemini-3.1-flash-lite", "gemini-3.7-flash", "gemini-3.6-flash"];
    let lastError: any = null;
    let resultText = "";

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    data: cleanBase64,
                    mimeType: cleanMimeType,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                trxId: { type: Type.STRING, description: "Transaction ID / Reference Number" },
                accountTitle: { type: Type.STRING, description: "Sender / Payer Account Title" },
                accountNumberLast4: { type: Type.STRING, description: "Last 4 digits of sender account / wallet" },
                date: { type: Type.STRING, description: "Date in YYYY-MM-DD format" },
                time: { type: Type.STRING, description: "Time in HH:MM format" },
                dateTime: { type: Type.STRING, description: "Exact date and time from receipt" },
                amount: { type: Type.NUMBER, description: "Numeric amount paid in PKR" },
                senderBank: { type: Type.STRING, description: "Bank or wallet name" },
                receiverAccount: { type: Type.STRING, description: "Recipient account details" },
              },
            },
          },
        });

        resultText = response.text || "";
        if (resultText) break;
      } catch (err: any) {
        console.warn(`OCR attempt with model ${modelName} failed:`, err?.message || err);
        lastError = err;
      }
    }

    if (!resultText) {
      throw lastError || new Error("Failed to extract text from payment screenshot");
    }

    let parsed: any = {};
    try {
      parsed = JSON.parse(resultText);
    } catch (parseErr) {
      console.warn("Failed to parse OCR response as JSON:", resultText);
      const cleanJson = resultText.replace(/```json/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleanJson);
    }

    return res.json({
      success: true,
      extracted: {
        trxId: parsed.trxId || "",
        accountTitle: parsed.accountTitle || "",
        accountNumberLast4: parsed.accountNumberLast4 ? String(parsed.accountNumberLast4).slice(-4) : "",
        date: parsed.date || "",
        time: parsed.time || "",
        dateTime: parsed.dateTime || "",
        amount: typeof parsed.amount === "number" ? parsed.amount : (parseFloat(parsed.amount) || 0),
        senderBank: parsed.senderBank || "",
        receiverAccount: parsed.receiverAccount || "",
      },
    });
  } catch (error: any) {
    console.error("OCR Payment Receipt error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to analyze receipt image with AI",
    });
  }
});

// 2. Sync Gmail OAuth Token endpoint
ordersRouter.post("/sync-gmail-token", async (req, res) => {
  try {
    const { token, email } = req.body;
    if (!token || typeof token !== "string" || !token.trim()) {
      return res.status(400).json({ error: "Missing or invalid token in request body" });
    }

    const cleanToken = token.trim();

    // Verify token validity with Gmail API directly
    let detectedEmail = email || "asmatullah9327@gmail.com";
    let profileData: any = null;
    try {
      const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${cleanToken}` },
      });
      if (profileRes.ok) {
        profileData = await profileRes.json();
        if (profileData?.emailAddress) {
          detectedEmail = profileData.emailAddress;
        }
      } else {
        const errText = await profileRes.text();
        console.warn("Gmail profile test failed during sync:", profileRes.status, errText);
        return res.status(400).json({
          error: "Google returned an authentication error. Please verify the Gmail permission was granted.",
          details: errText,
        });
      }
    } catch (verErr: any) {
      console.warn("Error contacting Gmail API during token sync:", verErr);
    }

    storedGmailToken = cleanToken;
    lastGmailTokenUpdate = new Date().toISOString();

    const firestore = getDb();
    if (firestore) {
      await firestore.collection("system_meta").doc("gmail_auth").set({
        token: cleanToken,
        email: detectedEmail,
        updatedAt: lastGmailTokenUpdate,
      }, { merge: true });
    }

    return res.json({
      success: true,
      message: `Gmail connected successfully for ${detectedEmail}!`,
      email: detectedEmail,
      updatedAt: lastGmailTokenUpdate,
      profile: profileData,
    });
  } catch (error: any) {
    console.error("Failed to sync Gmail token:", error);
    return res.status(500).json({ error: error.message || "Failed to save Gmail token" });
  }
});

// 3. Disconnect Gmail endpoint
ordersRouter.post("/disconnect-gmail", async (req, res) => {
  try {
    storedGmailToken = null;
    lastGmailTokenUpdate = null;

    const firestore = getDb();
    if (firestore) {
      await firestore.collection("system_meta").doc("gmail_auth").delete();
    }

    return res.json({ success: true, message: "Gmail integration disconnected." });
  } catch (error: any) {
    console.error("Failed to disconnect Gmail:", error);
    return res.status(500).json({ error: error.message });
  }
});

// 4. Gmail Status endpoint
ordersRouter.get("/gmail-status", async (req, res) => {
  try {
    const token = await getActiveGmailToken();
    let isLiveValid = false;
    let errorDetail = null;
    let connectedEmail = null;
    let messagesTotal = null;

    if (token) {
      try {
        const testRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (testRes.ok) {
          isLiveValid = true;
          const prof = await testRes.json();
          connectedEmail = prof.emailAddress;
          messagesTotal = prof.messagesTotal;
        } else {
          errorDetail = await testRes.text();
        }
      } catch (e: any) {
        errorDetail = e.message;
      }
    }

    return res.json({
      connected: !!token,
      isValid: isLiveValid,
      targetEmail: "asmatullah9327@gmail.com",
      connectedEmail: connectedEmail || (token ? "asmatullah9327@gmail.com" : null),
      messagesTotal,
      lastUpdated: lastGmailTokenUpdate,
      errorDetail: isLiveValid ? null : errorDetail,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 5. Test Live Bank Email Search endpoint
ordersRouter.post("/test-bank-search", async (req, res) => {
  try {
    const token = await getActiveGmailToken();
    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Gmail is not connected. Please connect your Gmail account first.",
      });
    }

    const emails = await fetchRecentBankEmails(token);
    return res.json({
      success: true,
      count: emails.length,
      emails: emails.slice(0, 5).map(e => ({
        id: e.id,
        subject: e.subject,
        from: e.from,
        date: e.date,
        snippet: e.snippet?.slice(0, 150),
      })),
    });
  } catch (error: any) {
    console.error("Test bank search failed:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Helper: Fetch recent bank notification emails from Gmail
async function fetchRecentBankEmails(token: string) {
  try {
    // Search query looking for bank transaction messages received in the last 7 days
    const query = encodeURIComponent("newer_than:7d (received OR payment OR credit OR transfer OR Rs OR PKR OR EasyPaisa OR JazzCash OR SadaPay OR NayaPay OR Bank OR Meezan OR HBL OR Habib OR Faysal OR MCB OR UBL OR Askari OR Allied OR Alfalah OR trx OR TID OR txn)");
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=35`;

    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!listRes.ok) {
      console.warn("Gmail list messages API error:", listRes.status, await listRes.text());
      return [];
    }

    const listData = await listRes.json();
    const messages = listData.messages || [];
    if (!messages.length) return [];

    // Fetch message details in parallel
    const emailPromises = messages.slice(0, 20).map(async (msgItem: { id: string }) => {
      try {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgItem.id}?format=full`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!msgRes.ok) return null;
        const msg = await msgRes.json();

        // Extract headers
        const headers = msg.payload?.headers || [];
        const subject = headers.find((h: any) => h.name?.toLowerCase() === "subject")?.value || "";
        const from = headers.find((h: any) => h.name?.toLowerCase() === "from")?.value || "";
        const date = headers.find((h: any) => h.name?.toLowerCase() === "date")?.value || "";
        const snippet = msg.snippet || "";

        // Extract plain text snippet or body if available
        let bodyText = snippet;
        if (msg.payload?.parts) {
          for (const part of msg.payload.parts) {
            if (part.mimeType === "text/plain" && part.body?.data) {
              const decoded = Buffer.from(part.body.data, "base64").toString("utf-8");
              if (decoded) bodyText += " " + decoded.slice(0, 500);
            }
          }
        }

        return {
          id: msg.id,
          subject,
          from,
          date,
          snippet,
          bodySnippet: bodyText.slice(0, 800),
        };
      } catch (err) {
        return null;
      }
    });

    const results = await Promise.all(emailPromises);
    return results.filter(Boolean);
  } catch (error) {
    console.error("Error fetching Gmail notifications:", error);
    return [];
  }
}

// Helper: AI Reconciliation using Gemini 2.5 Pro with strict 2-tier matching
async function matchOrderWithGmailEmails(
  orderDetails: {
    trxId: string;
    accountTitle: string;
    accountNumberLast4: string;
    paymentDateTime: string;
    amount: number;
  },
  emails: any[]
) {
  if (!emails || emails.length === 0) {
    return {
      matched: false,
      confidence: "none",
      matchTier: "none",
      reason: "No recent bank notifications found in our payment gateway",
    };
  }

  // 1. Programmatic Tier 1 check: Exact / Clean TID match
  const rawTrxId = orderDetails.trxId?.trim() || "";
  const cleanTrxId = rawTrxId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

  if (cleanTrxId.length >= 4) {
    for (const email of emails) {
      const fullText = `${email.subject || ""} ${email.snippet || ""} ${email.bodySnippet || ""}`.toLowerCase();
      const cleanFullText = fullText.replace(/[^a-zA-Z0-9]/g, "");
      
      if (cleanFullText.includes(cleanTrxId)) {
        // Direct TID match found in email!
        return {
          matched: true,
          confidence: "high",
          matchTier: "tier1_trx_id",
          matchedMessageId: email.id,
          matchedEmailSubject: email.subject || "",
          matchedEmailDate: email.date || "",
          matchedEmailSnippet: email.snippet || "",
          detectedBankName: email.from || "Bank Notification",
          verifiedTrxId: rawTrxId,
          reason: `Matched via Transaction ID (TID: ${rawTrxId}) in bank notifications.`,
        };
      }
    }
  }

  // 2. Pass to Gemini 2.5 Pro for Comprehensive 2-Tier Reasoning
  const ai = getGenAI();
  const prompt = `You are an automated bank transaction verification AI for an e-commerce / streaming service.
Your task is to match user-submitted payment details against a list of recent bank / mobile wallet notifications.

USER-SUBMITTED ORDER PAYMENT DETAILS:
- Transaction ID / TID: "${orderDetails.trxId || "N/A"}"
- Sender Account Title: "${orderDetails.accountTitle || "N/A"}"
- Sender Account Number (Last 4 Digits): "${orderDetails.accountNumberLast4 || "N/A"}"
- Payment Date & Time: "${orderDetails.paymentDateTime || "N/A"}"
- Expected Amount (PKR): ${orderDetails.amount}

RECENT BANK NOTIFICATIONS:
${JSON.stringify(emails, null, 2)}

HIERARCHICAL MATCHING RULES (FOLLOW STRICTLY IN THIS EXACT ORDER):

TIER 1 (HIGHEST PRIORITY - TRANSACTION ID MATCH):
- First, check if the Transaction ID (TID / Trx ID / Ref ID) matches anywhere in the notification.
- If the TID matches, set matched: true, confidence: "high", matchTier: "tier1_trx_id", and cite the matching TID.

TIER 2 (FALLBACK FOR OTHER BANK / IBFT / RAAST METHODS):
- If the Transaction ID is NOT matched (because inter-bank transfers or third-party apps like 1Link / Raast often generate a sender-side reference number that differs from the receiver's bank notification TID):
- Then check if an incoming credit / payment notification matches:
  1. EXACT PAYMENT AMOUNT: The amount received in PKR / Rs must match ${orderDetails.amount}.
  2. ACCOUNT TITLE / SENDER NAME: The sender name or account title in the notification matches or closely resembles "${orderDetails.accountTitle}" (fuzzy / case-insensitive, e.g. "Asmat Ullah", "Muhammad Ali", etc.) OR the sender account digits match.
  3. EXACT TIME AND DATE: The notification timestamp aligns with "${orderDetails.paymentDateTime}" (same date or within a reasonable time window of a few hours).
- If Amount + Account Title + Date/Time align, set matched: true, confidence: "high", matchTier: "tier2_fallback_details", and state: "Matched via other bank method: Amount (Rs ${orderDetails.amount}), Account Title (${orderDetails.accountTitle}), and Date/Time alignment."

TIER 3 (NO MATCH):
- If neither Tier 1 nor Tier 2 criteria are satisfied, set matched: false, confidence: "none", matchTier: "none", and explain specifically what did not match. Ensure you act as a direct bank connection, DO NOT mention the words "email", "mailbox", or "Gmail".

Return ONLY valid JSON matching the schema.`;

  const modelsToTry = ["gemini-3.1-flash-lite", "gemini-3.7-flash", "gemini-3.6-flash"];
  let raw = "{}";
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              matched: { type: Type.BOOLEAN, description: "Whether a matching payment notification was found" },
              confidence: { type: Type.STRING, enum: ["high", "medium", "low", "none"] },
              matchTier: { type: Type.STRING, enum: ["tier1_trx_id", "tier2_fallback_details", "none"] },
              matchedMessageId: { type: Type.STRING },
              matchedEmailSubject: { type: Type.STRING },
              matchedEmailDate: { type: Type.STRING },
              matchedEmailSnippet: { type: Type.STRING },
              detectedBankName: { type: Type.STRING },
              verifiedTrxId: { type: Type.STRING },
              reason: { type: Type.STRING },
            },
            required: ["matched", "confidence", "reason"],
          },
        },
      });

      raw = response.text || "{}";
      if (raw && raw !== "{}") break;
    } catch (err: any) {
      console.warn(`Bank matching attempt with model ${modelName} failed:`, err?.message || err);
      lastError = err;
    }
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to parse Gemini matching response:", err);
    return {
      matched: false,
      confidence: "none",
      matchTier: "none",
      reason: "Could not parse AI verification response",
    };
  }
}

// Helper to remove any undefined or invalid values from Firestore documents recursively
function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as any;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item)) as any;
  }
  if (typeof data === "object" && !(data instanceof Date)) {
    const cleanObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanObj[key] = sanitizeForFirestore(value);
      }
    }
    return cleanObj as any;
  }
  return data;
}

// Helper to check and claim transaction/email
async function checkAndClaimPayment(firestore: any, trxId: string, matchedMessageId: string, orderId: string, userId: string) {
  const claimedRef = firestore.collection("claimed_payments");
  const checks = [];
  
  // Safe document ID string replacing slashes to prevent subcollection paths
  const safeTrxId = trxId ? String(trxId).replace(/\//g, "-").trim() : "";
  const safeMsgId = matchedMessageId ? String(matchedMessageId).replace(/\//g, "-").trim() : "";

  if (safeTrxId) checks.push(claimedRef.doc(safeTrxId).get());
  if (safeMsgId) checks.push(claimedRef.doc(safeMsgId).get());
  
  if (checks.length > 0) {
    const results = await Promise.all(checks);
    for (const doc of results) {
      if (doc.exists && doc.data()?.orderId !== orderId) {
        return { isClaimed: true, duplicateReason: "Duplicate detected: This transaction has already been claimed by another order." };
      }
    }
  }

  // If not claimed, claim them
  const batch = firestore.batch();
  const nowIso = new Date().toISOString();
  if (safeTrxId) {
    batch.set(claimedRef.doc(safeTrxId), { orderId, userId, claimedAt: nowIso }, { merge: true });
  }
  if (safeMsgId && safeMsgId !== safeTrxId) {
    batch.set(claimedRef.doc(safeMsgId), { orderId, userId, claimedAt: nowIso }, { merge: true });
  }
  await batch.commit();

  return { isClaimed: false };
}

// 4. Submit, Verify & Auto-Approve Order Endpoint
ordersRouter.post("/verify-and-confirm", async (req, res) => {
  try {
    const {
      userId,
      orderId: providedOrderId,
      type = "membership",
      planRole = "vip",
      amount = 0,
      months = 1,
      planName = "Membership",
      items = [],
      trxId = "",
      accountTitle = "",
      accountNumberLast4 = "",
      paymentDateTime = "",
      paymentScreenshotUrl = "",
      senderBank = "",
      userEmail = "",
      userName = "",
      userRole = "user",
      gmailToken: clientGmailToken,
      phone = "",
      verificationAttempt = 1,
    } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Missing required field: userId" });
    }

    const orderId = providedOrderId || generate9DigitOrderId();
    const firestore = getDb();
    if (!firestore) {
      return res.status(500).json({ error: "Database not available" });
    }

    // Step A: Check Gmail Token & Fetch Bank Notification Emails
    // ALWAYS use the server's securely stored admin token, NEVER accept from the client request
    const activeToken = await getActiveGmailToken();
    let bankEmails: any[] = [];
    if (activeToken) {
      bankEmails = await fetchRecentBankEmails(activeToken);
    }

    // Step B: Run Gemini AI Auto-Approval Algorithm
    let aiVerdict: any = {
      matched: false,
      confidence: "none",
      reason: activeToken ? "No matching transaction found in bank records" : "Bank verification service connecting",
    };

    if (bankEmails.length > 0) {
      aiVerdict = await matchOrderWithGmailEmails(
        {
          trxId: trxId.trim(),
          accountTitle: accountTitle.trim(),
          accountNumberLast4: accountNumberLast4.trim(),
          paymentDateTime: paymentDateTime.trim(),
          amount: Number(amount) || 0,
        },
        bankEmails
      );
    }

    let isAutoApproved = aiVerdict.matched && (aiVerdict.confidence === "high" || aiVerdict.confidence === "medium");
    
    // Check for duplicates
    if (isAutoApproved) {
      const claimResult = await checkAndClaimPayment(firestore, trxId.trim(), aiVerdict.matchedMessageId, orderId, userId);
      if (claimResult.isClaimed) {
        isAutoApproved = false;
        aiVerdict.matched = false;
        aiVerdict.confidence = "none";
        aiVerdict.reason = claimResult.duplicateReason;
      }
    }

    if (!isAutoApproved && verificationAttempt < 3) {
      return res.json({
        success: false,
        autoApproved: false,
        needsRetry: true,
        reason: aiVerdict.reason || "We couldn't verify your transaction.",
      });
    }

    const orderStatus = isAutoApproved ? "approved" : "pending";
    const nowIso = new Date().toISOString();

    // Fetch existing user doc
    const userRef = firestore.collection("users").doc(userId);
    const userDoc = await userRef.get();
    const existingUserData = userDoc.exists ? userDoc.data() || {} : {};

    // Calculate new expiry if membership approved
    let computedExpiryDate = existingUserData.expiryDate || null;
    if (isAutoApproved && type === "membership") {
      let baseDate = new Date();
      if (existingUserData.expiryDate && existingUserData.expiryDate !== "Lifetime") {
        const curExp = new Date(existingUserData.expiryDate);
        if (curExp > baseDate) {
          baseDate = curExp;
        }
      }
      baseDate.setMonth(baseDate.getMonth() + (Number(months) || 1));
      computedExpiryDate = baseDate.toISOString();
    }

    // Build the complete order object with safe fallbacks (never undefined)
    const newOrder: any = {
      id: orderId,
      userId,
      userName: userName || existingUserData.displayName || userEmail.split("@")[0] || "User",
      userEmail: userEmail || existingUserData.email || "",
      userRole: (existingUserData.role as any) || userRole || "user",
      type,
      amount: Number(amount) || 0,
      status: orderStatus,
      createdAt: nowIso,
      months: Number(months) || 1,
      planName: planName || (type === "content" ? "Content Purchase" : "Membership"),
      planRole: planRole || "vip",
      items: Array.isArray(items) ? items : [],
      trxId: trxId.trim() || "",
      accountTitle: accountTitle.trim() || "",
      accountNumberLast4: accountNumberLast4.trim() || "",
      paymentDateTime: paymentDateTime.trim() || nowIso,
      paymentScreenshotUrl: paymentScreenshotUrl || "",
      senderBank: senderBank || aiVerdict.detectedBankName || "Bank Transfer",
      aiVerificationAttempted: true,
      aiVerificationReason: aiVerdict.reason || "",
      aiConfidence: aiVerdict.confidence || "none",
    };

    // If auto-approved, store verified metadata for admin
    if (isAutoApproved) {
      newOrder.verifiedBy = "AI Auto-Approval";
      newOrder.verifiedAt = nowIso;
      newOrder.matchedEmailId = aiVerdict.matchedMessageId || "";
      newOrder.matchedEmailSubject = aiVerdict.matchedEmailSubject || "";
      newOrder.matchedEmailSnippet = aiVerdict.matchedEmailSnippet || "";
      newOrder.matchedEmailDate = aiVerdict.matchedEmailDate || "";
    }

    // Prepare Firestore batch / write
    const existingOrders = Array.isArray(existingUserData.orders) ? existingUserData.orders : [];
    const updatedOrders = [newOrder, ...existingOrders.filter((o: any) => o.id !== orderId)];

    const userUpdates: any = {
      orders: updatedOrders,
      lastActive: nowIso,
    };
    if (phone) {
      userUpdates.phone = phone;
    }

    if (isAutoApproved) {
      if (type === "membership") {
        userUpdates.role = planRole || "vip";
        userUpdates.status = "active";
        userUpdates.expiryDate = computedExpiryDate;
        userUpdates.trialActivated = true;
      } else if (type === "content" && Array.isArray(items)) {
        const prevContent = Array.isArray(existingUserData.assignedContent) ? existingUserData.assignedContent : [];
        const newContentIds = items.map((i: any) => i.id || i.contentId).filter(Boolean);
        userUpdates.assignedContent = Array.from(new Set([...prevContent, ...newContentIds]));
        if (existingUserData.role !== "owner" && existingUserData.role !== "admin") {
          userUpdates.status = "active";
        }
      }
    }

    // Save user profile update with strict sanitization
    await userRef.set(sanitizeForFirestore(userUpdates), { merge: true });

    // If auto-approved, record income in Firestore
    if (isAutoApproved && Number(amount) > 0) {
      try {
        await firestore.collection("income").add(sanitizeForFirestore({
          orderId,
          userId,
          userName: newOrder.userName,
          userEmail: newOrder.userEmail,
          amount: Number(amount),
          type,
          planName: newOrder.planName || (type === "content" ? "Content Purchase" : "Membership"),
          trxId: trxId.trim(),
          accountTitle: accountTitle.trim(),
          senderBank: newOrder.senderBank || "Bank Transfer",
          date: nowIso,
          createdAt: nowIso,
          verifiedBy: "AI Auto-Approval",
        }));
      } catch (incomeErr) {
        console.warn("Failed to record income document:", incomeErr);
      }

      // Send approval push / email notification
      sendOrderApprovedNotification({
        userId,
        orderId,
        orderType: type,
        newExpiryDate: computedExpiryDate,
      }).catch((e) => console.warn("Order approved notification trigger:", e));
    }

    // Update chunk metadata version so frontend stays in sync
    try {
      await firestore.collection("chunk_meta").doc("versions").set({
        users: { [userId]: Date.now() },
      }, { merge: true });
    } catch (metaErr) {}

    // Public sanitized order response (NO internal bank email details exposed to end user)
    const publicOrderResponse = {
      id: newOrder.id,
      userId: newOrder.userId,
      userName: newOrder.userName,
      type: newOrder.type,
      amount: newOrder.amount,
      status: newOrder.status,
      createdAt: newOrder.createdAt,
      months: newOrder.months,
      planName: newOrder.planName,
      items: newOrder.items,
      trxId: newOrder.trxId,
      accountTitle: newOrder.accountTitle,
      accountNumberLast4: newOrder.accountNumberLast4,
      paymentDateTime: newOrder.paymentDateTime,
      verifiedBy: newOrder.verifiedBy,
      verifiedAt: newOrder.verifiedAt,
    };

    return res.json({
      success: true,
      autoApproved: isAutoApproved,
      status: orderStatus,
      orderId,
      order: publicOrderResponse,
      message: isAutoApproved
        ? "🎉 Payment verified by AI! Your order has been approved automatically."
        : "Order submitted successfully. Your payment is saved as pending and will be verified shortly.",
    });
  } catch (error: any) {
    console.error("Error in verify-and-confirm order:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to process order",
    });
  }
});

// 5. Admin Re-Verify Pending Order with AI Gemini & Gmail
ordersRouter.post("/admin-verify-order", async (req, res) => {
  try {
    const { orderId, userId } = req.body;
    if (!orderId || !userId) {
      return res.status(400).json({ error: "Missing orderId or userId" });
    }

    const firestore = getDb();
    if (!firestore) {
      return res.status(500).json({ error: "Database not available" });
    }

    const userRef = firestore.collection("users").doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data() || {};
    const orders: any[] = Array.isArray(userData.orders) ? userData.orders : [];
    const targetOrder = orders.find((o) => o.id === orderId);

    if (!targetOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    const activeToken = await getActiveGmailToken();
    if (!activeToken) {
      return res.status(400).json({
        success: false,
        error: "Gmail API token is not available. Please connect asmatullah9327@gmail.com in admin settings.",
      });
    }

    const bankEmails = await fetchRecentBankEmails(activeToken);
    if (!bankEmails.length) {
      return res.json({
        success: true,
        matched: false,
        reason: "No recent bank notifications found in gateway",
      });
    }

    const aiVerdict = await matchOrderWithGmailEmails(
      {
        trxId: targetOrder.trxId || "",
        accountTitle: targetOrder.accountTitle || "",
        accountNumberLast4: targetOrder.accountNumberLast4 || "",
        paymentDateTime: targetOrder.paymentDateTime || targetOrder.createdAt,
        amount: Number(targetOrder.amount) || 0,
      },
      bankEmails
    );

    let isMatch = aiVerdict.matched && (aiVerdict.confidence === "high" || aiVerdict.confidence === "medium");
    
    // Uniqueness Check
    if (isMatch) {
      const claimResult = await checkAndClaimPayment(firestore, (targetOrder.trxId || "").trim(), aiVerdict.matchedMessageId, orderId, userId);
      if (claimResult.isClaimed) {
        isMatch = false;
        aiVerdict.matched = false;
        aiVerdict.confidence = "none";
        aiVerdict.reason = claimResult.duplicateReason;
      }
    }

    const nowIso = new Date().toISOString();

    if (isMatch) {
      // Calculate expiry if membership
      let computedExpiry = userData.expiryDate;
      if (targetOrder.type === "membership") {
        let baseDate = new Date();
        if (userData.expiryDate && userData.expiryDate !== "Lifetime") {
          const curExp = new Date(userData.expiryDate);
          if (curExp > baseDate) baseDate = curExp;
        }
        baseDate.setMonth(baseDate.getMonth() + (Number(targetOrder.months) || 1));
        computedExpiry = baseDate.toISOString();
      }

      const updatedOrder = {
        ...targetOrder,
        status: "approved",
        verifiedBy: "AI Auto-Approval",
        verifiedAt: nowIso,
        matchedEmailId: aiVerdict.matchedMessageId,
        matchedEmailSubject: aiVerdict.matchedEmailSubject,
        matchedEmailSnippet: aiVerdict.matchedEmailSnippet,
        matchedEmailDate: aiVerdict.matchedEmailDate,
        senderBank: targetOrder.senderBank || aiVerdict.detectedBankName,
        aiVerificationAttempted: true,
        aiVerificationReason: aiVerdict.reason,
        aiConfidence: aiVerdict.confidence,
      };

      const newOrdersList = orders.map((o) => (o.id === orderId ? updatedOrder : o));
      const userUpdates: any = {
        orders: newOrdersList,
        lastActive: nowIso,
      };

      if (targetOrder.type === "membership") {
        userUpdates.role = targetOrder.planRole || "vip";
        userUpdates.status = "active";
        userUpdates.expiryDate = computedExpiry;
        userUpdates.trialActivated = true;
      } else if (targetOrder.type === "content" && Array.isArray(targetOrder.items)) {
        const prevContent = Array.isArray(userData.assignedContent) ? userData.assignedContent : [];
        const newContentIds = targetOrder.items.map((i: any) => i.id || i.contentId).filter(Boolean);
        userUpdates.assignedContent = Array.from(new Set([...prevContent, ...newContentIds]));
      }

      await userRef.set(sanitizeForFirestore(userUpdates), { merge: true });

      // Record income
      try {
        await firestore.collection("income").add(sanitizeForFirestore({
          orderId,
          userId,
          userName: targetOrder.userName,
          userEmail: targetOrder.userEmail,
          amount: Number(targetOrder.amount),
          type: targetOrder.type,
          planName: targetOrder.planName || "Membership",
          trxId: targetOrder.trxId || "",
          accountTitle: targetOrder.accountTitle || "",
          senderBank: updatedOrder.senderBank || "Bank Transfer",
          date: nowIso,
          createdAt: nowIso,
          verifiedBy: "AI Auto-Approval",
        }));
      } catch (e) {}

      sendOrderApprovedNotification({
        userId,
        orderId,
        orderType: targetOrder.type,
        newExpiryDate: computedExpiry,
      }).catch(() => {});

      return res.json({
        success: true,
        matched: true,
        autoApproved: true,
        verdict: aiVerdict,
        order: updatedOrder,
      });
    } else {
      return res.json({
        success: true,
        matched: false,
        autoApproved: false,
        verdict: aiVerdict,
      });
    }
  } catch (error: any) {
    console.error("Admin verify order error:", error);
    return res.status(500).json({ error: error.message || "Verification failed" });
  }
});
