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

// Retrieve stored Gmail Token from Firestore or memory with Auto-Refresh capability
async function getActiveGmailToken(providedToken?: string): Promise<string | null> {
  if (providedToken && providedToken.trim()) {
    return providedToken.trim();
  }

  const firestore = getDb();
  if (!firestore) return storedGmailToken;

  try {
    const snap = await firestore.collection("system_meta").doc("gmail_auth").get();
    if (snap.exists) {
      const data = snap.data();
      if (data) {
        const now = new Date();
        const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
        
        // 1. If we have a valid, non-expired token, return it
        if (data.token && (!expiresAt || expiresAt > now)) {
          storedGmailToken = data.token;
          lastGmailTokenUpdate = data.updatedAt || null;
          return storedGmailToken;
        }

        // 2. Proactive refresh if token is expired (or about to expire) and we have a refreshToken
        if (data.refreshToken) {
          const clientId = data.clientId || "460140141169-nlm0no0uhcaaaot9037sp4g31r36i808.apps.googleusercontent.com";
          const clientSecret = data.clientSecret;

          if (clientSecret) {
            console.log("[Gmail API] Access token expired or expiring. Refreshing in background...");
            try {
              const params = new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret.trim(),
                refresh_token: data.refreshToken.trim(),
                grant_type: "refresh_token",
              });

              const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params.toString(),
              });

              if (tokenRes.ok) {
                const tokenData: any = await tokenRes.json();
                if (tokenData.access_token) {
                  const newAccessToken = tokenData.access_token;
                  const expiresIn = tokenData.expires_in || 3600;
                  const newExpiresAt = new Date(Date.now() + (expiresIn - 180) * 1000).toISOString(); // 3 mins buffer
                  const updatedAt = new Date().toISOString();

                  await firestore.collection("system_meta").doc("gmail_auth").set({
                    token: newAccessToken,
                    expiresAt: newExpiresAt,
                    updatedAt,
                  }, { merge: true });

                  storedGmailToken = newAccessToken;
                  lastGmailTokenUpdate = updatedAt;
                  console.log("[Gmail API] Background token refresh succeeded!");
                  return newAccessToken;
                }
              } else {
                const errText = await tokenRes.text();
                console.warn("[Gmail API] Background refresh request failed:", errText);
              }
            } catch (refErr) {
              console.error("[Gmail API] Background refresh fetch error:", refErr);
            }
          }
        }

        // Return whatever token is there as fallback
        storedGmailToken = data.token || null;
        lastGmailTokenUpdate = data.updatedAt || null;
        return storedGmailToken;
      }
    }
  } catch (e) {
    console.warn("Failed to read/refresh gmail token from Firestore:", e);
  }

  return storedGmailToken;
}

// Helper to normalize dates to YYYY-MM-DD
function normalizeDate(rawDate?: string, rawDateTime?: string): string {
  const candidates = [rawDate, rawDateTime].filter((s): s is string => Boolean(s && s.trim()));
  const monthMap: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
  };

  for (const str of candidates) {
    const trimmed = str.trim();

    // 1. ISO format: YYYY-MM-DD or YYYY/MM/DD
    const isoMatch = trimmed.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (isoMatch) {
      const y = isoMatch[1];
      const m = isoMatch[2].padStart(2, "0");
      const d = isoMatch[3].padStart(2, "0");
      return `${y}-${m}-${d}`;
    }

    // 2. DD-MM-YYYY or DD/MM/YYYY
    const ddmmyyyy = trimmed.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (ddmmyyyy) {
      const d = ddmmyyyy[1].padStart(2, "0");
      const m = ddmmyyyy[2].padStart(2, "0");
      const y = ddmmyyyy[3];
      return `${y}-${m}-${d}`;
    }

    // 3. Named month: e.g. "18 Sep, 2026", "18-Sep-2026", "Sep 18, 2026"
    const namedMonthMatch = trimmed.match(/(\d{1,2})[\s,-]+([a-zA-Z]{3,9})[\s,-]+(\d{4})/) ||
                            trimmed.match(/([a-zA-Z]{3,9})[\s,-]+(\d{1,2})[\s,-]+(\d{4})/);
    if (namedMonthMatch) {
      let d = "";
      let mon = "";
      let y = "";
      if (/^\d+$/.test(namedMonthMatch[1])) {
        d = namedMonthMatch[1].padStart(2, "0");
        mon = namedMonthMatch[2].toLowerCase().slice(0, 3);
        y = namedMonthMatch[3];
      } else {
        mon = namedMonthMatch[1].toLowerCase().slice(0, 3);
        d = namedMonthMatch[2].padStart(2, "0");
        y = namedMonthMatch[3];
      }
      if (monthMap[mon]) {
        return `${y}-${monthMap[mon]}-${d}`;
      }
    }
  }
  return "";
}

// Helper to normalize time to 24-hour HH:MM
function normalizeTime(rawTime?: string, rawDateTime?: string): string {
  const candidates = [rawTime, rawDateTime].filter((s): s is string => Boolean(s && s.trim()));

  for (const str of candidates) {
    const trimmed = str.trim();

    // 1. 12-hour format with AM/PM: e.g. "02:35 PM", "2:35pm", "11:45 AM"
    const ampmMatch = trimmed.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)/i);
    if (ampmMatch) {
      let hours = parseInt(ampmMatch[1], 10);
      const minutes = ampmMatch[2];
      const period = ampmMatch[3].toUpperCase();
      if (period === "PM" && hours < 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;
      return `${String(hours).padStart(2, "0")}:${minutes}`;
    }

    // 2. 24-hour format: e.g. "14:35" or "09:15"
    const h24Match = trimmed.match(/(?:^|\s|[T])(\d{1,2}):(\d{2})(?::\d{2})?(?:\s|$)/);
    if (h24Match) {
      const hours = parseInt(h24Match[1], 10);
      const minutes = h24Match[2];
      if (hours >= 0 && hours <= 23) {
        return `${String(hours).padStart(2, "0")}:${minutes}`;
      }
    }
  }
  return "";
}

// 1. OCR endpoint: Recognize payment details from payment screenshot using Gemini AI
ordersRouter.post("/ocr-payment-receipt", async (req, res) => {
  try {
    const { 
      imageBase64, 
      mimeType = "image/jpeg",
      receiverAccountTitle = "Asmat Ullah",
      receiverAccountNumber = "03416286423",
      knownReceiverAccounts = []
    } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64 data in request" });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "").trim();
    const cleanMimeType = (mimeType && mimeType.startsWith("image/")) ? mimeType : "image/jpeg";
    const ai = getGenAI();

    const prompt = `You are a financial OCR intelligence model specialized in Pakistani digital banking receipts (EasyPaisa, JazzCash, SadaPay, NayaPay, Raast, Meezan, HBL, Bank Alfalah, UBL, MCB, Allied, Askari, Faysal, SCB, etc.).

Your task is divided into 2 steps:

STEP 1: THOROUGH TEXT READING
Transcribe ALL text, headings, labels, names, numbers, badges, and timestamps visible anywhere in the image into "rawTextSummary".

STEP 2: SEMANTIC ROLE REASONING & EXTRACTION
Analyze the transcribed text and determine the exact transaction roles:

1. SENDER / PAYER ROLE ("From" / "Sent by"):
   - Any label such as "From", "Sent by", "Sender", "Sender Name", "Debit Account Title", "Debit Account #", "Remitter", "Paid by", "Payer", "Transferred From", "Debit A/C", or a user profile avatar/name at the top represents the SENDER.
   - Set "accountTitle" to this sender's name / title.
   - Set "senderAccount" to this sender's account number, mobile wallet number (e.g. 03001234567 or masked 0300****567), Raast ID, or IBAN.
   - Set "accountNumberLast4" to the last 4 digits of this sender's account/mobile (e.g. "4567").

2. RECIPIENT ROLE ("To" / "Sent to"):
   - Any label such as "To", "Sent to", "Receiver", "Beneficiary", "Credit Account", "Transferred To", "Deposit To", "Merchant" represents the RECIPIENT.
   - Set "receiverAccountTitle" to the recipient's name (e.g. "${receiverAccountTitle}").
   - Set "receiverAccountNumber" to the recipient's account/mobile number.

3. TRANSACTION IDENTIFIER:
   - Look for labels "TID", "TRX ID", "Trans ID", "Transaction ID", "Reference No.", "Ref #", "Receipt #", "FT Number", "STAN", "Batch".
   - Set "trxId" to the raw alphanumeric identifier.

4. AMOUNT & TIMESTAMP:
   - "amount": The numeric amount transferred in PKR.
   - "date": Date in YYYY-MM-DD.
   - "time": Time in 24h HH:MM.
   - "dateTime": Exact timestamp string.
   - "senderBank": Bank/wallet app name (EasyPaisa, JazzCash, SadaPay, NayaPay, Meezan, HBL, Bank Alfalah, etc.).

Return ONLY a valid JSON object matching the requested schema.`;

    // Prioritize Gemini 3.6 Flash, fallback to 3.5 Flash, then 3.1 Pro
    const modelsToTry = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3.1-pro"];
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
                rawTextSummary: { type: Type.STRING, description: "All visible text transcribed from the receipt image" },
                semanticRoleBreakdown: { type: Type.STRING, description: "AI reasoning mapping which lines represent From/Sender, To/Receiver, and TID" },
                trxId: { type: Type.STRING, description: "Transaction ID / Reference Number" },
                accountTitle: { type: Type.STRING, description: "Sender / Payer Account Title (From / Sent by / Remitter / Debit)" },
                accountNumberLast4: { type: Type.STRING, description: "Last 4 digits of sender account / wallet / mobile" },
                senderAccount: { type: Type.STRING, description: "Full or masked sender account / mobile number" },
                date: { type: Type.STRING, description: "Date in YYYY-MM-DD format" },
                time: { type: Type.STRING, description: "Time in HH:MM format" },
                dateTime: { type: Type.STRING, description: "Exact date and time from receipt" },
                amount: { type: Type.NUMBER, description: "Numeric amount paid in PKR" },
                senderBank: { type: Type.STRING, description: "Bank or wallet name" },
                receiverAccountTitle: { type: Type.STRING, description: "Recipient account title (To / Sent to)" },
                receiverAccountNumber: { type: Type.STRING, description: "Recipient account number" },
              },
              required: ["accountTitle", "trxId", "amount", "rawTextSummary", "semanticRoleBreakdown"],
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

    // Clean up extracted fields
    const rawTrxId = (parsed.trxId || "").replace(/^(TRX\s*ID|TID|REF\s*#?|TRANSACTION\s*ID|RECEIPT\s*#?)[:\s-]*/i, "").trim();
    let cleanAccountTitle = (parsed.accountTitle || "").trim();

    // Extract and validate last 4 digits of sender account
    let rawAccDigits = String(parsed.accountNumberLast4 || "").replace(/\D/g, "");
    if (!rawAccDigits && parsed.senderAccount) {
      const senderDigits = String(parsed.senderAccount).replace(/\D/g, "");
      if (senderDigits.length >= 4) {
        rawAccDigits = senderDigits.slice(-4);
      }
    }
    const cleanLast4 = rawAccDigits.slice(-4);

    const normalizedDate = normalizeDate(parsed.date, parsed.dateTime);
    const normalizedTime = normalizeTime(parsed.time, parsed.dateTime);

    return res.json({
      success: true,
      extracted: {
        trxId: rawTrxId || parsed.trxId || "",
        accountTitle: cleanAccountTitle,
        accountNumberLast4: cleanLast4,
        senderAccount: parsed.senderAccount || "",
        date: normalizedDate || parsed.date || "",
        time: normalizedTime || parsed.time || "",
        dateTime: parsed.dateTime || "",
        amount: typeof parsed.amount === "number" ? parsed.amount : (parseFloat(parsed.amount) || 0),
        senderBank: parsed.senderBank || "",
        receiverAccountTitle: parsed.receiverAccountTitle || "",
        receiverAccountNumber: parsed.receiverAccountNumber || "",
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
    let detectedEmail = email || "asmatn628@gmail.com";
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

    // Load configuration details from Firestore to return to Admin settings
    let clientId = "460140141169-nlm0no0uhcaaaot9037sp4g31r36i808.apps.googleusercontent.com";
    let clientSecret = "";
    let hasRefreshToken = false;

    const firestore = getDb();
    if (firestore) {
      const snap = await firestore.collection("system_meta").doc("gmail_auth").get();
      if (snap.exists) {
        const d = snap.data();
        if (d?.clientId) clientId = d.clientId;
        if (d?.clientSecret) clientSecret = d.clientSecret;
        if (d?.refreshToken) hasRefreshToken = true;
      }
    }

    return res.json({
      connected: !!token,
      isValid: isLiveValid,
      targetEmail: "asmatn628@gmail.com",
      connectedEmail: connectedEmail || (token ? "asmatn628@gmail.com" : null),
      messagesTotal,
      lastUpdated: lastGmailTokenUpdate,
      errorDetail: isLiveValid ? null : errorDetail,
      clientId,
      clientSecret,
      hasRefreshToken,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 5. Test Live Bank Email Search endpoint
ordersRouter.post("/test-bank-search", async (req, res) => {
  try {
    const { paymentDateTime } = req.body;
    const token = await getActiveGmailToken();
    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Gmail is not connected. Please connect your Gmail account first.",
      });
    }

    const emails = await fetchRecentBankEmails(token, paymentDateTime);
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
async function fetchRecentBankEmails(token: string, searchDate?: string) {
  try {
    let dateFilter = "newer_than:7d";
    if (searchDate) {
      const d = new Date(searchDate);
      if (!isNaN(d.getTime())) {
        const afterDate = new Date(d);
        afterDate.setDate(afterDate.getDate() - 1);
        const beforeDate = new Date(d);
        beforeDate.setDate(beforeDate.getDate() + 2);
        
        const yAfter = afterDate.getFullYear();
        const mAfter = String(afterDate.getMonth() + 1).padStart(2, '0');
        const dAfter = String(afterDate.getDate()).padStart(2, '0');

        const yBefore = beforeDate.getFullYear();
        const mBefore = String(beforeDate.getMonth() + 1).padStart(2, '0');
        const dBefore = String(beforeDate.getDate()).padStart(2, '0');

        dateFilter = `after:${yAfter}/${mAfter}/${dAfter} before:${yBefore}/${mBefore}/${dBefore}`;
      }
    }

    // Search query looking for bank transaction messages
    const query = encodeURIComponent(`${dateFilter} (received OR payment OR credit OR transfer OR Rs OR PKR OR EasyPaisa OR JazzCash OR SadaPay OR NayaPay OR Bank OR Meezan OR HBL OR Habib OR Faysal OR MCB OR UBL OR Askari OR Allied OR Alfalah OR trx OR TID OR txn)`);
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

// Helper: AI Reconciliation using Gemini 3 Flash / Gemini 3.1 Flash Lite with strict 2-tier matching
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

  // 1. Pass to Gemini 3 Flash for Comprehensive Reasoning based on strict rules
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

MATCHING RULES (STRICTLY FOLLOW THESE REQUIREMENTS):

You must ONLY approve (matched: true) if the following criteria are met:
1. EXACT DATE: The notification date must match the date provided in the user's "Payment Date & Time".
2. TIME (+/- 3 MINS): The notification time must be within 3 minutes (before or after) of the time provided in the user's "Payment Date & Time".
3. EXACT AMOUNT: The payment amount received in PKR / Rs must exactly match ${orderDetails.amount}.
4. SENDER ACCOUNT TITLE: The sender name or account title must match or closely resemble "${orderDetails.accountTitle}" (fuzzy / case-insensitive).

Note on Bank / Transaction ID:
- If the above 4 conditions (Date, Time, Amount, Account Title) are met, you MUST approve the match (matched: true, confidence: "high", matchTier: "tier1_trx_id" or "tier2_fallback_details").
- In your "reason" field for a successful match, provide a concise confirmation.

CRITICAL PRIVACY & SIMPLICITY RULES FOR "reason" FIELD (WHEN NOT MATCHED):
- NEVER disclose, leak, or mention other sender names, third-party account titles, or unrelated transaction IDs from the bank notifications.
- When the sender account title does not match, DO NOT reveal what name was found in the bank notification or mention any transaction IDs. SIMPLY respond with:
  "The sender account title '${orderDetails.accountTitle || "provided"}' is not found in the records."
- When the amount does not match, simply state: "No transaction found for the specified amount."
- When the date or time does not match, simply state: "No transaction found matching the specified date and time."
- If no transaction matches at all, simply state: "Transaction not found in bank records."
- Keep the reason strictly short, simple, direct, and completely free of third-party transaction details or internal IDs.
- Never mention the words "email", "mailbox", or "Gmail".

Return ONLY valid JSON matching the schema.`;

  // Prioritize Gemini 3.6 Flash, fallback to 3.5 Flash, then 3.1 Pro
  const modelsToTry = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3.1-pro"];
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
    const parsed = JSON.parse(raw);
    // Post-processing guard to ensure no internal leakage in the reason
    if (!parsed.matched && parsed.reason) {
      const lower = parsed.reason.toLowerCase();
      if (lower.includes("does not match the provided") || lower.includes("found in the transaction records") || lower.includes("associated with a payment from")) {
        parsed.reason = `The sender account title '${orderDetails.accountTitle || "provided"}' is not found in the records.`;
      }
    }
    return parsed;
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
      allowAutoApproval = true,
      skipAiVerification = false,
      paymentMethodId = "",
      paymentMethodName = "",
    } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Missing required field: userId" });
    }

    const orderId = providedOrderId || generate9DigitOrderId();
    const firestore = getDb();
    if (!firestore) {
      return res.status(500).json({ error: "Database not available" });
    }

    const shouldRunAiAutoApproval = allowAutoApproval !== false && !skipAiVerification;

    // Step A & B: Run Gmail Token Check & AI Auto-Approval only if enabled for this payment method
    let bankEmails: any[] = [];
    let aiVerdict: any = {
      matched: false,
      confidence: "none",
      reason: shouldRunAiAutoApproval
        ? "No matching transaction found in bank records"
        : "Payment method requires manual approval by admin",
    };

    if (shouldRunAiAutoApproval) {
      // ALWAYS use the server's securely stored admin token, NEVER accept from the client request
      const activeToken = await getActiveGmailToken();
      if (activeToken) {
        bankEmails = await fetchRecentBankEmails(activeToken, paymentDateTime);
      }

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
    }

    let isAutoApproved = shouldRunAiAutoApproval && aiVerdict.matched && (aiVerdict.confidence === "high" || aiVerdict.confidence === "medium");
    
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

    // Only retry if auto-approval was requested and failed before attempt limit
    if (shouldRunAiAutoApproval && !isAutoApproved && verificationAttempt < 3) {
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
      senderBank: senderBank || aiVerdict.detectedBankName || paymentMethodName || "Bank Transfer",
      paymentMethodId: paymentMethodId || "",
      paymentMethodName: paymentMethodName || senderBank || "",
      allowAutoApproval: shouldRunAiAutoApproval,
      aiVerificationAttempted: shouldRunAiAutoApproval,
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
        userUpdates.expiryNoticeSent = false;
        userUpdates.expiryNoticeSentDate = admin.firestore.FieldValue.delete();
        userUpdates.lastExpiryNoticeFor = admin.firestore.FieldValue.delete();
        userUpdates.lastExpiryNoticeSentAt = admin.firestore.FieldValue.delete();
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

    // If auto-approved, record income in Firestore (single document: income/data)
    if (isAutoApproved && Number(amount) > 0) {
      try {
        const incomeDocRef = firestore.collection("income").doc("data");
        const incomeSnap = await incomeDocRef.get();
        let currentRecords: any[] = [];
        if (incomeSnap.exists) {
          currentRecords = incomeSnap.data()?.records || [];
        }
        const newIncomeItem = sanitizeForFirestore({
          id: "inc_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
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
          description: `${type === 'membership' ? 'Membership Renewal' : 'Content Purchase'} (${orderId})`,
        });
        await incomeDocRef.set({
          records: [newIncomeItem, ...currentRecords],
          updatedAt: nowIso
        }, { merge: true });
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
      const pktDate = new Date(Date.now() + 5 * 60 * 60 * 1000);
      const pktString = pktDate.toISOString().replace('Z', '+05:00');
      await firestore.collection("chunk_meta").doc("versions").set({
        users: { [userId]: pktString },
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

    if (targetOrder.allowAutoApproval === false) {
      return res.status(400).json({
        success: false,
        error: "This payment method is configured for manual review only. Auto-approval is disabled for this method.",
      });
    }

    const activeToken = await getActiveGmailToken();
    if (!activeToken) {
      return res.status(400).json({
        success: false,
        error: "Gmail API token is not available. Please connect asmatn628@gmail.com in admin settings.",
      });
    }

    const bankEmails = await fetchRecentBankEmails(activeToken, targetOrder.paymentDateTime || targetOrder.createdAt);
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
        userUpdates.expiryNoticeSent = false;
        userUpdates.expiryNoticeSentDate = admin.firestore.FieldValue.delete();
        userUpdates.lastExpiryNoticeFor = admin.firestore.FieldValue.delete();
        userUpdates.lastExpiryNoticeSentAt = admin.firestore.FieldValue.delete();
      } else if (targetOrder.type === "content" && Array.isArray(targetOrder.items)) {
        const prevContent = Array.isArray(userData.assignedContent) ? userData.assignedContent : [];
        const newContentIds = targetOrder.items.map((i: any) => i.id || i.contentId).filter(Boolean);
        userUpdates.assignedContent = Array.from(new Set([...prevContent, ...newContentIds]));
      }

      await userRef.set(sanitizeForFirestore(userUpdates), { merge: true });

      // Record income (single document: income/data)
      try {
        const incomeDocRef = firestore.collection("income").doc("data");
        const incomeSnap = await incomeDocRef.get();
        let currentRecords: any[] = [];
        if (incomeSnap.exists) {
          currentRecords = incomeSnap.data()?.records || [];
        }
        const newIncomeItem = sanitizeForFirestore({
          id: "inc_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
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
          description: `${targetOrder.type === 'membership' ? 'Membership Renewal' : 'Content Purchase'} (${orderId})`,
        });
        await incomeDocRef.set({
          records: [newIncomeItem, ...currentRecords],
          updatedAt: nowIso
        }, { merge: true });
      } catch (e) {
        console.warn("Failed to record income document:", e);
      }

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

// 6. Exchange Authorization Code for permanent Refresh Token and temporary Access Token (Gmail & Contacts)
ordersRouter.post("/exchange-oauth-code", async (req, res) => {
  try {
    const { code, clientId, clientSecret, scopes } = req.body;
    if (!code || !clientId || !clientSecret) {
      return res.status(400).json({ error: "Missing code, clientId, or clientSecret in request body" });
    }

    // Exchange code via Google Token endpoint
    const params = new URLSearchParams({
      code: code.trim(),
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      redirect_uri: "postmessage",
      grant_type: "authorization_code"
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[Google OAuth] Exchange failed:", errText);
      return res.status(400).json({ error: "Google OAuth exchange failed", details: errText });
    }

    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600;
    const expiresAt = new Date(Date.now() + (expiresIn - 180) * 1000).toISOString();
    const updatedAt = new Date().toISOString();

    if (!accessToken) {
      return res.status(400).json({ error: "Google did not return an access token" });
    }

    let detectedEmail = "wmoviznow@gmail.com";
    try {
      const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (userinfoRes.ok) {
        const uinfo: any = await userinfoRes.json();
        if (uinfo.email) {
          detectedEmail = uinfo.email;
        }
      }
    } catch (e) {
      console.warn("Could not get userinfo during code exchange:", e);
    }

    const firestore = getDb();
    if (!firestore) {
      return res.status(500).json({ error: "Firestore database is unavailable" });
    }

    const requestedScopes = scopes || "";
    const isGmailScope = requestedScopes.includes("gmail") || requestedScopes.includes("mail.google.com");
    const isContactsScope = requestedScopes.includes("contacts");

    const authRecord: any = {
      token: accessToken,
      expiresAt,
      email: detectedEmail,
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      updatedAt,
      isAuthorized: true
    };
    if (refreshToken) {
      authRecord.refreshToken = refreshToken.trim();
    }

    if (isGmailScope) {
      await firestore.collection("system_meta").doc("gmail_auth").set(authRecord, { merge: true });
      storedGmailToken = accessToken;
      lastGmailTokenUpdate = updatedAt;
      console.log(`[Google OAuth] Saved Gmail authentication for ${detectedEmail}`);
    }

    if (isContactsScope) {
      const contactsAuthRecord: any = {
        accessToken: accessToken,
        expiry: Date.now() + (expiresIn - 60) * 1000,
        email: detectedEmail,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        updatedAt,
        isAuthorized: true
      };
      if (refreshToken) {
        contactsAuthRecord.refreshToken = refreshToken.trim();
      }
      await firestore.collection("settings").doc("google_contacts").set(contactsAuthRecord, { merge: true });
      console.log(`[Google OAuth] Saved Google Contacts authentication for ${detectedEmail}`);
    }

    return res.json({
      success: true,
      email: detectedEmail,
      hasRefreshToken: !!refreshToken || !!authRecord.refreshToken,
      message: `Google Workspace authentication succeeded for ${detectedEmail}! Both Gmail and Contacts are now configured with permanent Offline Refresh Access.`,
    });
  } catch (error: any) {
    console.error("Failed to exchange OAuth code:", error);
    return res.status(500).json({ error: error.message || "OAuth Code exchange server error" });
  }
});

// 7. Refresh Google Contacts token from server-side using refresh token
ordersRouter.post("/refresh-contacts-token", async (req, res) => {
  try {
    const firestore = getDb();
    if (!firestore) {
      return res.status(500).json({ error: "Firestore database is unavailable" });
    }

    const snap = await firestore.collection("settings").doc("google_contacts").get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Google Contacts integration is not configured." });
    }

    const data = snap.data();
    if (!data || !data.refreshToken || !data.clientSecret) {
      return res.status(400).json({ error: "No permanent refresh token or client secret configured for Google Contacts." });
    }

    const clientId = data.clientId || "460140141169-nlm0no0uhcaaaot9037sp4g31r36i808.apps.googleusercontent.com";
    const clientSecret = data.clientSecret;

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret.trim(),
      refresh_token: data.refreshToken.trim(),
      grant_type: "refresh_token"
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[Google Contacts API] Refresh failed:", errText);
      return res.status(400).json({ error: "Google Contacts refresh failed", details: errText });
    }

    const tokenData: any = await tokenRes.json();
    const newAccessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in || 3600;
    const expiry = Date.now() + (expiresIn - 60) * 1000;
    const updatedAt = new Date().toISOString();

    if (!newAccessToken) {
      return res.status(400).json({ error: "Google did not return a fresh access token" });
    }

    // Save back to Firestore
    await firestore.collection("settings").doc("google_contacts").set({
      accessToken: newAccessToken,
      expiry,
      updatedAt
    }, { merge: true });

    console.log(`[Google Contacts API] Access token refreshed on server for ${data.email || 'contacts admin'}`);

    return res.json({
      success: true,
      accessToken: newAccessToken,
      expiry,
      email: data.email || null
    });
  } catch (err: any) {
    console.error("Failed to refresh contacts token on server:", err);
    return res.status(500).json({ error: err.message || "Failed to refresh contacts token" });
  }
});
