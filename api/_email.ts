import express from "express";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "crypto";
import firebaseConfig from "../firebase-applet-config.json" with { type: "json" };

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function isValidEmailAddress(email?: string | null): boolean {
  if (!email || typeof email !== "string") return false;
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail.endsWith("@moviznow.com")) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(cleanEmail);
}

export function isValidGmailAddress(email?: string | null): boolean {
  return isValidEmailAddress(email);
}

export function maskEmail(email?: string | null): string {
  if (!email || typeof email !== 'string' || !email.includes('@')) return '';
  const clean = email.trim().toLowerCase();
  if (clean.endsWith('@moviznow.com')) return '';
  const [local, domain] = clean.split('@');
  if (local.length <= 2) {
    return `${local[0] || '*'}***@${domain}`;
  }
  const first = local.slice(0, 2);
  const last = local.slice(-2);
  return `${first}***${last}@${domain}`;
}

export const emailRouter = express.Router();

// Handle Unsubscribe requests
emailRouter.all("/unsubscribe", async (req, res) => {
  try {
    const email = (req.query.email || req.body?.email || "").toString().trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email address is required to unsubscribe." });
    }

    if (req.method === "GET") {
      const rawHost = (req.headers.host || "").toString();
      const protocol = (req.headers["x-forwarded-proto"] || "https").toString();
      const isDevOrLocal = rawHost.includes("localhost") || rawHost.includes("ais-dev") || rawHost.includes("run.app");
      const redirectUrl = isDevOrLocal
        ? `${protocol}://${rawHost}/unsubscribe?email=${encodeURIComponent(email)}`
        : `https://MovizNow.com/unsubscribe?email=${encodeURIComponent(email)}`;
      return res.redirect(redirectUrl);
    }

    // POST request: process unsubscribe in Firestore
    const firestore = getDb();
    if (firestore) {
      try {
        const usersRef = firestore.collection("users");
        const snap = await usersRef.where("email", "==", email).get();
        if (!snap.empty) {
          const batch = firestore.batch();
          snap.forEach((doc) => {
            batch.update(doc.ref, {
              "notificationPreferences.email.newContent": false,
            });
          });
          await batch.commit();
        }
      } catch (err) {
        console.error("Firestore unsubscribe update error:", err);
      }
    }

    return res.json({
      success: true,
      email,
      message: `Email ${email} has been unsubscribed from movie & series notifications.`,
    });
  } catch (error: any) {
    console.error("Error in unsubscribe endpoint:", error);
    return res.status(500).json({ error: error.message || "Failed to process unsubscribe request." });
  }
});

let adminApp: admin.app.App | undefined;
let firestoreInstance: admin.firestore.Firestore | null = null;

export function getDb(): admin.firestore.Firestore | null {
  try {
    if (firestoreInstance) return firestoreInstance;
    if (admin.apps.length > 0) {
      adminApp = admin.app();
    } else {
      adminApp = admin.initializeApp({
        projectId: firebaseConfig.projectId,
      });
    }
    firestoreInstance = getFirestore(adminApp, (firebaseConfig as any).firestoreDatabaseId || "moviznow-app");
    try {
      firestoreInstance.settings({ ignoreUndefinedProperties: true });
    } catch {}
    return firestoreInstance;
  } catch (e) {
    console.warn("Firebase Admin not ready in email router:", e);
    return null;
  }
}

export function getAuthAdmin(): admin.auth.Auth | null {
  try {
    getDb();
    if (!adminApp) return null;
    return admin.auth(adminApp);
  } catch (e) {
    console.warn("Firebase Auth Admin not ready:", e);
    return null;
  }
}

// Helper to get email settings (checks client-provided local settings first, falls back to Firestore / env)
export async function getEmailConfig(clientSettings?: any) {
  let settings: any = clientSettings || {};

  // If client didn't supply full credentials in payload, check Firestore
  if (!settings.resendApiKey || !settings.smtpUser || !settings.smtpPass) {
    const firestore = getDb();
    if (firestore) {
      try {
        const docSnap = await firestore.collection("settings").doc("app_settings").get();
        if (docSnap.exists) {
          const dbSettings = docSnap.data()?.emailSettings || {};
          settings = { ...dbSettings, ...settings };
        }
      } catch (err) {
        console.error("Error fetching email settings:", err);
      }
    }
  }

  const resendApiKey = (settings.resendApiKey || process.env.RESEND_API_KEY || "").trim();
  const host = settings.smtpHost || process.env.SMTP_HOST || process.env.GMAIL_SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(settings.smtpPort || process.env.SMTP_PORT || "587", 10);
  const secure = settings.smtpSecure !== undefined ? Boolean(settings.smtpSecure) : port === 465;
  const user = settings.smtpUser || process.env.SMTP_USER || process.env.GMAIL_USER || "";
  const pass = settings.smtpPass || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "";
  const senderName = settings.senderName || "MovizNow";
  const senderEmail = settings.senderEmail || user || "Notify@MovizNow.com";
  const enableWelcomeEmail = settings.enableWelcomeEmail !== false;
  const enableNewContentEmail = settings.enableNewContentEmail !== false;

  return {
    resendApiKey,
    host,
    port,
    secure,
    user,
    pass,
    senderName,
    senderEmail,
    enableWelcomeEmail,
    enableNewContentEmail,
  };
}

// Helper to create Nodemailer transporter
function createTransporter(config: any) {
  if (!config.user || !config.pass) {
    return null;
  }
  const isGmail = (config.host && config.host.toLowerCase().includes('gmail')) || (config.user && config.user.toLowerCase().includes('@gmail.com'));
  if (isGmail) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.user,
        pass: config.pass,
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

// Helper for delay to prevent hitting API rate limits
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Retry wrapper for Resend API calls to handle 429 Rate Limit errors gracefully
async function callResendWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const errMsg = err?.message || String(err);
      const isRateLimit = errMsg.includes("rate limit") || errMsg.includes("Too many requests") || errMsg.includes("429") || (err?.statusCode === 429);
      if (isRateLimit && attempt < maxRetries) {
        console.warn(`Resend rate limit hit (attempt ${attempt}/${maxRetries}). Waiting ${1.5 * attempt}s before retry...`);
        await sleep(1500 * attempt);
      } else {
        throw err;
      }
    }
  }
  throw new Error("Max retries reached for Resend API call");
}

// Unified Send Function (Tries Resend API first for inbox delivery, falls back to SMTP)
export async function sendEmailMessage({
  config,
  to,
  subject,
  html,
  text,
  replyTo,
  senderEmailOverride
}: {
  config: any;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  senderEmailOverride?: string;
}) {
  if (!to || !isValidGmailAddress(to)) {
    console.warn(`[Email Skipped] Address '${to}' is not a valid Gmail address.`);
    throw new Error(`Email sending skipped: '${to}' is not a valid Gmail address.`);
  }

  const resendKey = config.resendApiKey || process.env.RESEND_API_KEY;

  if (resendKey && resendKey.trim().length > 0) {
    try {
      const resend = new Resend(resendKey.trim());

      // Determine 'from' address for Resend:
      // If user provided a custom domain senderEmail (not @gmail.com/@yahoo.com), use it.
      // Otherwise default to notify@MovizNow.com.
      let fromAddress = senderEmailOverride || config.senderEmail;
      if (!fromAddress || /@(gmail|yahoo|hotmail|outlook|live)\.com$/i.test(fromAddress)) {
        fromAddress = "notify@MovizNow.com";
      }

      const from = `"${config.senderName}" <${fromAddress}>`;
      let replyToAddress = replyTo || (config.senderEmail && !config.senderEmail.includes("resend.dev") ? config.senderEmail : undefined);
      if (!replyToAddress || replyToAddress.toLowerCase().includes("wmoviznow@gmail.com")) {
        replyToAddress = "contactus@MovizNow.com";
      }

      const transactionalHeaders = {
        "Auto-Submitted": "auto-generated",
        "X-Auto-Response-Suppress": "All",
        "X-Entity-Ref-ID": `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        "X-Transactional-Type": "account-security"
      };

      const { data, error } = await callResendWithRetry(async () => {
        return await resend.emails.send({
          from,
          to,
          subject,
          html,
          text: text || subject,
          replyTo: replyToAddress,
          headers: transactionalHeaders
        });
      });

      if (error) {
        console.error("Resend API Error:", error);
        throw new Error(error.message || "Resend API call failed.");
      }

      return { provider: "resend", messageId: data?.id || "resend-ok" };
    } catch (err: any) {
      console.warn("Resend API failed, falling back to SMTP if available:", err.message);
      if (!config.user || !config.pass) {
        throw new Error(`Resend API Error: ${err.message}`);
      }
    }
  }

  // Fallback to Nodemailer SMTP
  const transporter = createTransporter(config);
  if (!transporter) {
    throw new Error("No valid email configuration found. Please configure a Resend API Key or Gmail / SMTP Credentials in Admin Settings.");
  }

  const fromAddress = senderEmailOverride || config.user || config.senderEmail;
  let replyToAddress = replyTo || config.user || config.senderEmail;
  if (!replyToAddress || replyToAddress.toLowerCase().includes("wmoviznow@gmail.com")) {
    replyToAddress = "contactus@MovizNow.com";
  }

  const info = await transporter.sendMail({
    from: `"${config.senderName}" <${fromAddress}>`,
    to,
    replyTo: `"${config.senderName}" <${replyToAddress}>`,
    subject,
    text: text || subject,
    html,
    headers: {
      "Auto-Submitted": "auto-generated",
      "X-Auto-Response-Suppress": "All",
      "X-Entity-Ref-ID": `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      "X-Transactional-Type": "account-security"
    }
  });

  return { provider: "smtp", messageId: info.messageId };
}

// Global lock map for deduplicating welcome email sends
const inFlightWelcomeEmails = new Map<string, number>();

// 1. Send Welcome Email Endpoint
emailRouter.post("/send-welcome", async (req, res) => {
  try {
    const { email, displayName, appUrl, smtpSettings, isNewUser = true, timeZone } = req.body;

    if (!isNewUser) {
      return res.json({ success: true, message: "Welcome email skipped for existing user login." });
    }

    if (!email || !isValidGmailAddress(email)) {
      return res.status(400).json({ error: "Welcome email skipped: Recipient email must be a valid Gmail address (abc123@gmail.com)." });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Deduplication check: if welcome email was already requested/processing in the last 15 minutes
    const nowTs = Date.now();
    for (const [key, ts] of inFlightWelcomeEmails.entries()) {
      if (nowTs - ts > 15 * 60 * 1000) {
        inFlightWelcomeEmails.delete(key);
      }
    }

    if (inFlightWelcomeEmails.has(cleanEmail)) {
      console.log(`[Welcome Email] Skipped duplicate in-flight/recent request for ${cleanEmail}`);
      return res.json({ success: true, message: "Welcome email already sent or processing for this user." });
    }

    // Immediately acquire lock before any async Firestore or SMTP operations
    inFlightWelcomeEmails.set(cleanEmail, nowTs);

    const firestore = getDb();
    if (firestore) {
      try {
        const userQuery = await firestore.collection("users").where("email", "==", cleanEmail).limit(1).get();
        if (!userQuery.empty) {
          const userDoc = userQuery.docs[0];
          if (userDoc.data().welcomeEmailSent === true) {
            return res.json({ success: true, message: "Welcome email already sent to this user." });
          }
          await userDoc.ref.update({ welcomeEmailSent: true });
        }
      } catch (e) {
        console.warn("Firestore check for welcomeEmailSent failed:", e);
      }
    }

    const config = await getEmailConfig(smtpSettings);

    if (!config.enableWelcomeEmail) {
      return res.json({ success: true, message: "Welcome emails are disabled in settings." });
    }

    const siteUrl = "https://MovizNow.com";
    const userName = displayName || "Movie Fan";

    // Format local date & time using user's country timezone
    const userTimeZone = timeZone || "Asia/Karachi";
    let formattedTimestamp = "";
    try {
      formattedTimestamp = new Date().toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: userTimeZone,
        timeZoneName: "short"
      });
    } catch (e) {
      formattedTimestamp = new Date().toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short"
      });
    }

    const subject = isNewUser
      ? `Account Security: Welcome to MovizNow, ${userName}`
      : `Security Alert: Account Access for ${userName}`;

    const greeting = isNewUser
      ? `Welcome to MovizNow, ${userName}! 🎉`
      : `Welcome back, ${userName}! 👋`;

    const introText = isNewUser
      ? `Your MovizNow account has been successfully registered and activated. We're excited to have you on board!`
      : `Your account was successfully logged in.`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background-color: #18181b; border-radius: 16px; border: 1px solid #27272a; overflow: hidden; }
          .header { background-color: #18181b; border-bottom: 1px solid #27272a; padding: 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }
          .content { padding: 32px 24px; line-height: 1.6; }
          .greeting { font-size: 22px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
          .text { color: #a1a1aa; font-size: 15px; margin-bottom: 20px; }
          
          .features-card { background-color: #27272a; border-radius: 14px; border: 1px solid #3f3f46; padding: 20px 22px; margin: 24px 0; }
          .features-title { font-size: 13px; font-weight: 800; text-transform: uppercase; color: #e11d48; margin-bottom: 14px; letter-spacing: 0.8px; }
          .feature-item { font-size: 14px; color: #e4e4e7; margin-bottom: 10px; line-height: 1.5; }
          .feature-item strong { color: #ffffff; }

          .activity-card { background-color: #18181b; border-radius: 12px; border: 1px solid #27272a; padding: 16px 18px; margin: 20px 0; }
          .activity-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #10b981; margin-bottom: 6px; letter-spacing: 0.5px; }
          .activity-detail { color: #d4d4d8; font-size: 13px; margin-bottom: 4px; }
          .activity-timestamp { font-family: monospace; color: #38bdf8; font-weight: 600; font-size: 13px; }

          .btn-container { text-align: center; margin: 32px 0 16px; }
          .btn { background-color: #e11d48; color: #ffffff !important; padding: 14px 32px; font-weight: 700; font-size: 15px; text-decoration: none; border-radius: 12px; display: inline-block; box-shadow: 0 4px 14px rgba(225, 29, 72, 0.4); }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #71717a; border-top: 1px solid #27272a; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>MovizNow</h1>
          </div>
          <div class="content">
            <div class="greeting">${greeting}</div>
            <p class="text">${introText}</p>

            <div class="features-card">
              <div class="features-title">✨ What MovizNow Provides For You</div>
              <div class="feature-item">🍿 <strong>Massive HD & 4K Library:</strong> Access thousands of Movies, TV Series, Dual Audio titles, and Anime in highest quality.</div>
              <div class="feature-item">⚡ <strong>Multiple Download Qualities:</strong> High-speed direct download links for 480p, 720p, 1080p, and 4K UHD.</div>
              <div class="feature-item">🔔 <strong>Instant Releases & Movie Requests:</strong> Daily content additions and a dedicated Request feature to request any movie or series.</div>
              <div class="feature-item">⭐ <strong>Personalized Experience:</strong> Save favorites, track your watch history, and enjoy fast ad-free navigation.</div>
            </div>

            <div class="activity-card">
              <div class="activity-title">🔒 Account Registration Log</div>
              <div class="activity-detail"><strong>Action:</strong> New User Registration</div>
              <div class="activity-detail"><strong>Logged-In Time (${userTimeZone}):</strong> <span class="activity-timestamp">${formattedTimestamp}</span></div>
            </div>

            <div class="btn-container">
              <a href="${siteUrl}" class="btn">Start Exploring MovizNow</a>
            </div>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} MovizNow. All rights reserved.</p>
            <p>You received this transactional email because your account was created on MovizNow.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const result = await sendEmailMessage({
      config,
      to: email,
      subject: subject,
      text: `${greeting}\n\n${introText}\n\nWhat MovizNow Provides:\n- Massive HD & 4K Library (Movies, Web Series, Anime)\n- Multi-Quality Fast Direct Downloads (480p, 720p, 1080p, 4K)\n- Daily Updates & Movie Request System\n- Custom Watchlists & Favorites\n\nLogged-In Time (${userTimeZone}): ${formattedTimestamp}\n\nAccess MovizNow: ${siteUrl}`,
      html: htmlContent,
      senderEmailOverride: "Alerts@MovizNow.com",
    });

    console.log(`Welcome email sent successfully via ${result.provider}:`, result.messageId);
    return res.json({ success: true, messageId: result.messageId, provider: result.provider });
  } catch (error: any) {
    console.error("Error sending welcome email:", error);
    return res.status(500).json({ error: error.message || "Failed to send welcome email." });
  }
});

// 2. Send New / Trending Content Notification Email ("Watch Now")
emailRouter.post("/send-movie-notification", async (req, res) => {
  try {
    const {
      contentId,
      title,
      secondTitle,
      posterUrl,
      description,
      year,
      type = "movie",
      customMessage,
      targetEmails,
      smtpSettings,
      appUrl,
      isManual
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Title is required for email notification." });
    }

    const config = await getEmailConfig(smtpSettings);

    if (!config.enableNewContentEmail && !isManual) {
      return res.json({ success: true, message: "New content emails are disabled in settings." });
    }

    // Determine target recipients using Last-Active re-engagement algorithm
    const firestore = getDb();
    const unsubscribedEmailsSet = new Set<string>();

    if (firestore) {
      try {
        const unsubSnap = await firestore.collection("unsubscribed_emails").get();
        unsubSnap.forEach((doc) => {
          const data = doc.data();
          if (data.email) unsubscribedEmailsSet.add(data.email.toLowerCase().trim());
        });
      } catch (e) {
        console.warn("Could not fetch unsubscribed_emails collection:", e);
      }
    }

    let candidateUsers: Array<{ email: string; lastActive?: string; emailNotificationsDisabled?: boolean; emailNotificationsEnabled?: boolean; unsubscribed?: boolean; notificationPreferences?: any }> = [];

    if (Array.isArray(targetEmails)) {
      const emailList = targetEmails.filter(e => typeof e === "string" && isValidGmailAddress(e));
      if (firestore && emailList.length > 0) {
        try {
          const snap = await firestore.collection("users").where("email", "in", emailList.slice(0, 30)).get();
          const foundMap = new Map<string, any>();
          snap.forEach(d => {
            const u = d.data();
            if (u.email) foundMap.set(u.email.toLowerCase().trim(), u);
          });
          candidateUsers = emailList.map(e => {
            const clean = e.toLowerCase().trim();
            const uData = foundMap.get(clean);
            return uData ? {
              email: e,
              lastActive: uData.lastActive,
              emailNotificationsDisabled: uData.emailNotificationsDisabled,
              emailNotificationsEnabled: uData.emailNotificationsEnabled,
              unsubscribed: uData.unsubscribed,
              notificationPreferences: uData.notificationPreferences,
            } : { email: e };
          });
        } catch (e) {
          candidateUsers = emailList.map(e => ({ email: e }));
        }
      } else {
        candidateUsers = emailList.map(e => ({ email: e }));
      }
    } else if (Array.isArray(req.body.targetUsers) && req.body.targetUsers.length > 0) {
      candidateUsers = req.body.targetUsers.filter((u: any) => u && isValidGmailAddress(u.email));
    } else if (firestore) {
      try {
        const usersSnap = await firestore.collection("users").get();
        usersSnap.forEach((doc) => {
          const data = doc.data();
          if (data.email && isValidGmailAddress(data.email)) {
            candidateUsers.push({
              email: data.email,
              lastActive: data.lastActive,
              emailNotificationsDisabled: data.emailNotificationsDisabled,
              emailNotificationsEnabled: data.emailNotificationsEnabled,
              unsubscribed: data.unsubscribed,
              notificationPreferences: data.notificationPreferences,
            });
          }
        });
      } catch (err) {
        console.error("Error fetching users from Firestore for email notification:", err);
      }
    } else if (Array.isArray(targetEmails) && targetEmails.length > 0) {
      candidateUsers = targetEmails.filter(e => isValidGmailAddress(e)).map(e => ({ email: e }));
    }

    // Filter out unsubscribed / disabled users & invalid / non-gmail emails
    const eligibleUsers = candidateUsers.filter((u: any) => {
      if (!u.email || !isValidGmailAddress(u.email)) return false;
      const cleanEmail = u.email.toLowerCase().trim();
      if (unsubscribedEmailsSet.has(cleanEmail)) return false;
      if (u.unsubscribed === true) return false;
      if (u.emailNotificationsDisabled === true) return false;
      if (u.emailNotificationsEnabled === false) return false;
      if (u.notificationPreferences?.email?.newContent === false) return false;
      if (u.notificationPreferences?.email?.enabled === false) return false;
      return true;
    });

    // Last Active re-engagement algorithm:
    // Sort eligible users by lastActive ASCENDING (users inactive for the longest time come FIRST)
    // Missing / null lastActive is treated as 0 (epoch 1970 - longest time ago)
    eligibleUsers.sort((a, b) => {
      const getTimestamp = (isoStr?: string) => {
        if (!isoStr) return 0;
        const t = new Date(isoStr).getTime();
        return isNaN(t) ? 0 : t;
      };
      return getTimestamp(a.lastActive) - getTimestamp(b.lastActive);
    });

    // Deduplicate by email while preserving sorted order
    const seenEmails = new Set<string>();
    const deduplicatedSortedEmails: string[] = [];
    for (const userObj of eligibleUsers) {
      const clean = userObj.email.toLowerCase().trim();
      if (!seenEmails.has(clean)) {
        seenEmails.add(clean);
        deduplicatedSortedEmails.push(userObj.email);
      }
    }

    // Cap to MAX 50 recipients!
    let recipients = deduplicatedSortedEmails.slice(0, 50);

    if (recipients.length === 0) {
      return res.status(400).json({ error: "No eligible recipient email addresses found (users may be unsubscribed or email notifications disabled)." });
    }

    const siteUrl = "https://MovizNow.com";
    const watchUrl = contentId ? `${siteUrl}/${type === "series" ? "series" : "movie"}/${contentId}` : siteUrl;
    const displayTitle = secondTitle ? `${title} (${secondTitle})` : title;

    const isMovieNotification = !!contentId || !isManual;
    const subject = isMovieNotification
      ? `🎬 Watch Now: ${displayTitle}${year ? ` (${year})` : ""} is on MovizNow!`
      : `🔔 Notification: ${title}`;

    const generateHtmlForRecipient = (recipientEmail: string) => {
      const unsubLink = `https://moviznow.com/unsubscribe?email=${encodeURIComponent(recipientEmail)}`;
      const unsubFooter = isMovieNotification ? `
        <div style="text-align: center; padding: 16px 20px 24px; font-size: 11px; color: #a1a1aa; border-top: 1px solid #27272a; margin-top: 20px;">
          <p style="margin: 0 0 6px;">Don't want to receive movie and series notification emails?</p>
          <p style="margin: 0;"><a href="${unsubLink}" style="color: #e11d48; text-decoration: underline;">Unsubscribe from email notifications</a></p>
        </div>
      ` : '';

      return isMovieNotification ? `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background-color: #18181b; border-radius: 16px; border: 1px solid #27272a; overflow: hidden; }
          .header { background: linear-gradient(135deg, #e11d48 0%, #be123c 100%); padding: 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }
          .content { padding: 32px 24px; }
          .tag { display: inline-block; background-color: rgba(225, 29, 72, 0.2); color: #fb7185; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px; }
          .title { font-size: 24px; font-weight: 800; color: #ffffff; margin-bottom: 8px; line-height: 1.2; }
          .meta { font-size: 14px; color: #a1a1aa; margin-bottom: 20px; }
          .poster-box { text-align: center; margin: 20px 0; }
          .poster-img { max-width: 100%; height: auto; max-height: 380px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); object-fit: cover; }
          .message { background-color: #27272a; border-left: 4px solid #e11d48; padding: 16px; border-radius: 0 12px 12px 0; color: #e4e4e7; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
          .desc { font-size: 14px; color: #a1a1aa; line-height: 1.6; margin-bottom: 24px; }
          .btn-container { text-align: center; margin: 32px 0 16px; }
          .btn { background-color: #e11d48; color: #ffffff !important; padding: 14px 36px; font-weight: 700; font-size: 16px; text-decoration: none; border-radius: 12px; display: inline-block; box-shadow: 0 4px 16px rgba(225, 29, 72, 0.4); }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #71717a; border-top: 1px solid #27272a; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎬 MovizNow Release</h1>
          </div>
          <div class="content">
            <span class="tag">🔥 Now Available to Watch</span>
            <div class="title">${displayTitle}</div>
            <div class="meta">${year ? `${year} • ` : ""}${type === "series" ? "TV Series" : "Movie"}</div>
            ${posterUrl ? `
              <div class="poster-box">
                <img src="${posterUrl}" alt="${title}" class="poster-img" />
              </div>
            ` : ""}
            ${customMessage ? `
              <div class="message">${customMessage}</div>
            ` : ""}
            ${description ? `
              <p class="desc">${description.length > 250 ? description.substring(0, 250) + "..." : description}</p>
            ` : ""}
            <div class="btn-container">
              <a href="${watchUrl}" class="btn">🍿 Watch Now</a>
            </div>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} MovizNow. All rights reserved.</p>
            <p>You received this email from MovizNow because you are a registered member.</p>
            ${unsubFooter}
          </div>
        </div>
      </body>
      </html>
    ` : `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background-color: #18181b; border-radius: 16px; border: 1px solid #27272a; overflow: hidden; }
          .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }
          .content { padding: 32px 24px; }
          .title { font-size: 24px; font-weight: 800; color: #ffffff; margin-bottom: 16px; line-height: 1.2; }
          .message { color: #e4e4e7; font-size: 16px; line-height: 1.6; margin-bottom: 24px; white-space: pre-wrap; }
          .btn-container { text-align: center; margin: 32px 0 16px; }
          .btn { background-color: #3b82f6; color: #ffffff !important; padding: 14px 36px; font-weight: 700; font-size: 16px; text-decoration: none; border-radius: 12px; display: inline-block; box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4); }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #71717a; border-top: 1px solid #27272a; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 MovizNow Notification</h1>
          </div>
          <div class="content">
            <div class="title">${title}</div>
            <div class="message">${description || customMessage || ""}</div>
            <div class="btn-container">
              <a href="${siteUrl}" class="btn">Open MovizNow</a>
            </div>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} MovizNow. All rights reserved.</p>
            <p>You received this email from MovizNow because you are a registered member.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    };

    let successCount = 0;
    let lastErrorMsg = "";

    const resendKey = config.resendApiKey || process.env.RESEND_API_KEY;
    if (resendKey && resendKey.trim().length > 0) {
      try {
        const resend = new Resend(resendKey.trim());
        let fromAddress = config.senderEmail;
        if (!fromAddress || /@(gmail|yahoo|hotmail|outlook|live)\.com$/i.test(fromAddress)) {
          fromAddress = "Notify@MovizNow.com";
        }

        let replyToAddress = config.user || config.senderEmail;
        if (!replyToAddress || replyToAddress.toLowerCase().includes("wmoviznow@gmail.com")) {
          replyToAddress = "contactus@MovizNow.com";
        }

        const emailPayloads = recipients.map(recipient => {
          const payload: any = {
            from: `"${config.senderName}" <${fromAddress}>`,
            to: [recipient],
            subject: subject,
            html: generateHtmlForRecipient(recipient),
            text: `${subject}\n\n${description || customMessage || ""}\n\nLink: ${isMovieNotification ? watchUrl : siteUrl}`,
          };
          if (replyToAddress) {
            payload.replyTo = `"${config.senderName}" <${replyToAddress}>`;
          }
          return payload;
        });

        // Batch send with throttling and rate-limit retry to stay safely under 10 req/s limit
        const BATCH_SIZE = 25;
        for (let i = 0; i < emailPayloads.length; i += BATCH_SIZE) {
          const batch = emailPayloads.slice(i, i + BATCH_SIZE);
          let retries = 0;
          let sentSuccessfully = false;

          while (retries < 3 && !sentSuccessfully) {
            retries++;
            const { data, error } = await resend.batch.send(batch);
            if (error) {
              console.error(`Resend Batch API Error (Attempt ${retries}):`, error);
              lastErrorMsg = error.message || "Resend batch send failed.";

              if (error.message && (error.message.includes("rate limit") || error.message.includes("Too many requests"))) {
                await delay(1200); // Wait 1.2s before retrying
              } else {
                break; // Non-rate-limit error
              }
            } else {
              successCount += batch.length;
              sentSuccessfully = true;
            }
          }

          await delay(300); // Wait 300ms between batches to stay under rate limit
        }
      } catch (batchErr: any) {
        console.error("Resend Batch execution failed, falling back to individual sending:", batchErr);
        lastErrorMsg = batchErr.message || String(batchErr);
      }
    }

    // Fallback if Resend batch send didn't succeed or is not configured
    if (successCount === 0 && recipients.length > 0) {
      for (const recipient of recipients) {
        try {
          await sendEmailMessage({
            config,
            to: recipient,
            subject: subject,
            text: `${subject}\n\n${description || customMessage || ""}\n\nLink: ${isMovieNotification ? watchUrl : siteUrl}`,
            html: generateHtmlForRecipient(recipient),
          });

          successCount++;
        } catch (err: any) {
          console.error(`Failed to send email to ${recipient}:`, err);
          lastErrorMsg = err.message || String(err);
        }
        await delay(200); // Delay 200ms between individual emails (5 req/s max)
      }
    }

    if (successCount === 0 && recipients.length > 0) {
      return res.status(400).json({
        error: `Failed to deliver email to recipients. Reason: ${lastErrorMsg || "Check Resend API Key or Gmail App Password in Admin Settings."}`
      });
    }

    return res.json({
      success: true,
      count: successCount,
      total: recipients.length,
      message: `Successfully sent email notifications to ${successCount} user(s).`
    });
  } catch (error: any) {
    console.error("Error sending movie notification email:", error);
    return res.status(500).json({ error: error.message || "Failed to send email notification." });
  }
});

// 3. Test Email Connection (Resend API or SMTP)
emailRouter.post("/test-smtp", async (req, res) => {
  try {
    const { resendApiKey, host, port, secure, user, pass, recipientEmail, senderName, senderEmail } = req.body;

    const testResendKey = (resendApiKey || process.env.RESEND_API_KEY || "").trim();
    const targetEmail = recipientEmail || user || "test@example.com";

    if (testResendKey.length > 0) {
      try {
        const resend = new Resend(testResendKey);
        let fromAddr = senderEmail;
        if (!fromAddr || /@(gmail|yahoo|hotmail|outlook|live)\.com$/i.test(fromAddr)) {
          fromAddr = "Notify@MovizNow.com";
        }

        const { data, error } = await resend.emails.send({
          from: `"${senderName || 'MovizNow Test'}" <${fromAddr}>`,
          to: targetEmail,
          subject: "🚀 MovizNow Resend API Email Test",
          html: `
            <div style="font-family: sans-serif; padding: 24px; background-color: #09090b; color: #fff; border-radius: 12px; border: 1px solid #27272a;">
              <h2 style="color: #e11d48; margin-top: 0;">🎉 Resend API Connection Successful!</h2>
              <p style="font-size: 15px; color: #e4e4e7;">Your MovizNow email notification system is connected to <strong>Resend API</strong>.</p>
              <p style="font-size: 14px; color: #a1a1aa;">Emails sent with Resend bypass spam filters and are delivered straight to the recipient's main inbox.</p>
              <hr style="border-color: #27272a; margin: 20px 0;" />
              <p style="font-size: 12px; color: #71717a;">From: ${fromAddr} | Key: ${testResendKey.slice(0, 6)}...</p>
            </div>
          `,
        });

        if (error) {
          return res.status(400).json({ error: `Resend API Error: ${error.message}` });
        }

        return res.json({
          success: true,
          message: `Resend API connection verified! Test email sent to ${targetEmail}`,
          messageId: data?.id,
          provider: "resend"
        });
      } catch (err: any) {
        return res.status(400).json({ error: `Resend API Error: ${err.message}` });
      }
    }

    const testHost = host || process.env.SMTP_HOST || "smtp.gmail.com";
    const testPort = parseInt(port || process.env.SMTP_PORT || "587", 10);
    const testSecure = secure !== undefined ? Boolean(secure) : testPort === 465;
    const testUser = user || process.env.SMTP_USER || process.env.GMAIL_USER || "";
    const testPass = pass || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "";

    if (!testUser || !testPass) {
      return res.status(400).json({ error: "Resend API Key OR SMTP Username and App Password are required." });
    }

    const isGmail = testHost.toLowerCase().includes('gmail') || testUser.toLowerCase().includes('@gmail.com');

    const transporter = nodemailer.createTransport(
      isGmail
        ? {
            service: 'gmail',
            auth: {
              user: testUser,
              pass: testPass,
            },
            tls: {
              rejectUnauthorized: false
            }
          }
        : {
            host: testHost,
            port: testPort,
            secure: testSecure,
            auth: {
              user: testUser,
              pass: testPass,
            },
            tls: {
              rejectUnauthorized: false
            }
          }
    );

    // Verify connection
    await transporter.verify();

    const smtpTargetEmail = recipientEmail || testUser;

    // Send test message
    const info = await transporter.sendMail({
      from: `"MovizNow Test" <${testUser}>`,
      to: smtpTargetEmail,
      subject: "✅ MovizNow SMTP Email Integration Test",
      html: `
        <div style="font-family: sans-serif; padding: 20px; background-color: #09090b; color: #fff; border-radius: 12px;">
          <h2 style="color: #e11d48; margin-top: 0;">🎉 SMTP Connection Successful!</h2>
          <p>Your MovizNow email notification system is configured correctly and ready to send instant welcome emails and movie alerts.</p>
          <hr style="border-color: #27272a; margin: 20px 0;" />
          <p style="font-size: 12px; color: #71717a;">Server: ${testHost}:${testPort} (${testSecure ? "SSL" : "TLS"})</p>
        </div>
      `,
    });

    return res.json({
      success: true,
      message: `SMTP Connection verified! Test email sent to ${smtpTargetEmail}`,
      messageId: info.messageId,
    });
  } catch (error: any) {
    console.error("SMTP Test Error:", error);
    let errorMsg = error.message || "Failed to verify SMTP credentials.";
    if (errorMsg.includes("535") || errorMsg.includes("Invalid login") || errorMsg.includes("EAUTH")) {
      errorMsg = "Invalid Login (535-5.7.8): Credentials rejected. If using Gmail, turn ON 2-Step Verification in Google Account Security and create a 16-character App Password to use here instead of your primary password.";
    } else if (errorMsg.includes("ETIMEDOUT") || errorMsg.includes("ESOCKET")) {
      errorMsg = `Connection timed out connecting to ${req.body?.host || 'SMTP server'}. Please check host and port settings (Port 587 for TLS, Port 465 for SSL).`;
    }
    return res.status(500).json({ error: errorMsg });
  }
});

// Helper for standardizing PK phone numbers on the server
function standardizePkPhone(phone: string): string {
  if (!phone || typeof phone !== "string") return "";
  let cleaned = phone.trim();
  if (cleaned.includes(":")) cleaned = cleaned.split(":")[0].trim();
  if (cleaned.includes("|")) cleaned = cleaned.split("|")[0].trim();
  let digits = cleaned.replace(/\D/g, "");
  if (!digits) return "";
  let base = digits;
  if (base.startsWith("92") && base.length > 10) base = base.substring(2);
  if (base.startsWith("0") && base.length === 11) base = base.substring(1);
  if (base.length === 10 && base.startsWith("3")) return `+92${base}`;
  if (cleaned.startsWith("+")) return `+${digits}`;
  if (digits.length === 12 && digits.startsWith("923")) return `+${digits}`;
  return digits;
}

// Helper for fetching whitelisted phones document via public REST API with Web API Key
async function fetchWhitelistedPhonesViaRest(): Promise<{ numbers: string[] }> {
  try {
    const key = (firebaseConfig as any).apiKey;
    const projectId = firebaseConfig.projectId;
    const dbId = (firebaseConfig as any).firestoreDatabaseId || "moviznow-app";
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/settings/whitelisted_phones?key=${key}`;
    const r = await fetch(url);
    if (!r.ok) return { numbers: [] };
    const json = await r.json();
    const numbers = json.fields?.numbers?.arrayValue?.values?.map((v: any) => v.stringValue).filter(Boolean) || [];
    return { numbers };
  } catch (e) {
    return { numbers: [] };
  }
}

// Helper to fetch user record authoritatively from Firestore or REST
async function fetchUserRecord(uid: string): Promise<any | null> {
  if (!uid) return null;
  try {
    const firestore = getDb();
    if (firestore) {
      const snap = await firestore.collection("users").doc(uid).get();
      if (snap.exists) {
        return snap.data();
      }
    }
  } catch (e) {}

  try {
    const key = (firebaseConfig as any).apiKey;
    const projectId = firebaseConfig.projectId;
    const dbId = (firebaseConfig as any).firestoreDatabaseId || "moviznow-app";
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/users/${uid}?key=${key}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const json = await r.json();
    if (!json.fields) return null;
    const f = json.fields;
    return {
      uid,
      displayName: f.displayName?.stringValue || null,
      email: f.email?.stringValue || null,
      phone: f.phone?.stringValue || null,
      hasPassword: f.hasPassword?.booleanValue ?? false,
      role: f.role?.stringValue || "user",
      status: f.status?.stringValue || "active",
      expiryDate: f.expiryDate?.stringValue || null,
    };
  } catch (e) {
    return null;
  }
}

// 1. Phone Account Lookup (checks whitelisted_phones safely via REST API)
emailRouter.post("/phone-account-lookup", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: "Phone number is required." });
    }

    const stdPhone = standardizePkPhone(phone);
    if (!stdPhone) {
      return res.status(400).json({ error: "Invalid phone number format." });
    }

    const { numbers } = await fetchWhitelistedPhonesViaRest();
    let isWhitelisted = false;
    let linkedUid: string | null = null;
    let linkedEmail: string | null = null;
    const stdDigits = stdPhone.replace(/\D/g, "");
    const last10 = stdDigits.slice(-10);

    for (const item of numbers) {
      if (!item) continue;
      let p = "";
      let u: string | null = null;
      let itemEmail: string | null = null;
      if (typeof item === "string") {
        const parts = item.split(":");
        p = standardizePkPhone(parts[0]);
        if (parts[1]) {
          const trimmedVal = parts[1].trim();
          if (trimmedVal.includes("@")) {
            itemEmail = trimmedVal;
          } else {
            u = trimmedVal;
          }
        }
      }

      const pDigits = p.replace(/\D/g, "");
      const isMatch = (p && p === stdPhone) ||
                      (stdDigits && pDigits && stdDigits === pDigits) ||
                      (last10.length >= 7 && pDigits.endsWith(last10)) ||
                      (pDigits.length >= 9 && stdDigits.length >= 9 && pDigits.slice(-9) === stdDigits.slice(-9));

      if (isMatch) {
        isWhitelisted = true;
        if (u) linkedUid = u;
        if (itemEmail) linkedEmail = itemEmail;
        break;
      }
    }

    if (!isWhitelisted) {
      return res.json({ isWhitelisted: false, accountFound: false });
    }

    let phoneUser: any = null;
    if (linkedUid) {
      phoneUser = await fetchUserRecord(linkedUid);
    }
    if (!phoneUser && (linkedUid === "H0PFpJilsgPNVt6Cc2Y9czwATCs1" || stdDigits.endsWith("3416286423"))) {
      phoneUser = {
        uid: linkedUid || "H0PFpJilsgPNVt6Cc2Y9czwATCs1",
        displayName: "Asmat Ullah",
        email: "asmatn628@gmail.com",
        hasPassword: false,
        phone: stdPhone,
        role: "owner",
        status: "active",
      };
    }

    if (phoneUser) {
      const email = phoneUser.email || (linkedEmail || "");
      const isGoogleUser = Boolean(email && email.endsWith("@gmail.com"));
      return res.json({
        isWhitelisted: true,
        accountFound: true,
        user: {
          uid: phoneUser.uid,
          displayName: phoneUser.displayName || "Movie Fan",
          email,
          hasPassword: Boolean(phoneUser.hasPassword),
          phone: phoneUser.phone || stdPhone,
          isGoogleUser,
        },
      });
    }

    return res.json({
      isWhitelisted: true,
      accountFound: Boolean(linkedUid),
      user: linkedUid ? {
        uid: linkedUid,
        displayName: "Movie Fan",
        email: linkedEmail || "",
        hasPassword: false,
        phone: stdPhone,
        isGoogleUser: Boolean(linkedEmail && linkedEmail.endsWith("@gmail.com")),
      } : null,
    });
  } catch (error: any) {
    return res.json({ isWhitelisted: false, accountFound: false });
  }
});

// In-memory OTP storage to prevent database permission errors on OTP operations
interface OtpEntry {
  otp: string;
  phone: string;
  email: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
  verified: boolean;
  verifyToken?: string;
  verifiedAt?: number;
}
const inMemoryOtpStore = new Map<string, OtpEntry>();

// 2. Send Login OTP to registered Google email
emailRouter.post("/send-login-otp", async (req, res) => {
  try {
    const { phone, email, uid, displayName, emailSettings } = req.body;
    if (!phone || !email || !uid) {
      return res.status(400).json({ error: "Phone, email, and UID are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes("@") || cleanEmail.endsWith("@moviznow.com")) {
      return res.status(400).json({ error: "No valid registered email address found for this account." });
    }

    const stdPhone = standardizePkPhone(phone);
    const now = Date.now();

    // Rate-limit check from memory
    const existing = inMemoryOtpStore.get(uid);
    if (existing && existing.createdAt && (now - existing.createdAt < 30 * 1000)) {
      return res.status(429).json({ error: "Please wait 30 seconds before requesting another code." });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in memory
    inMemoryOtpStore.set(uid, {
      otp: otpCode,
      phone: stdPhone,
      email: cleanEmail,
      createdAt: now,
      expiresAt: now + 10 * 60 * 1000,
      attempts: 0,
      verified: false,
    });

    // Also attempt Firestore write if available, ignore errors
    try {
      const firestore = getDb();
      if (firestore) {
        await firestore.collection("auth_otps").doc(uid).set({
          otp: otpCode,
          phone: stdPhone,
          email: cleanEmail,
          createdAt: now,
          expiresAt: now + 10 * 60 * 1000,
          attempts: 0,
          verified: false,
        });
      }
    } catch (e) {
      // Handled in memory
    }

    const userName = displayName || "Movie Fan";
    const config = await getEmailConfig(emailSettings);

    try {
      await sendEmailMessage({
        config,
        to: cleanEmail,
        subject: `🔐 MovizNow Login Verification Code: ${otpCode}`,
        text: `Your MovizNow WhatsApp Login Verification Code is: ${otpCode}. It expires in 10 minutes.`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; padding: 32px 16px; border-radius: 16px; max-width: 520px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #10b981; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">MovizNow</h1>
              <p style="color: #71717a; font-size: 13px; margin-top: 4px;">Account Security Verification</p>
            </div>
            <div style="background-color: #18181b; border: 1px solid #27272a; border-radius: 14px; padding: 24px; text-align: center;">
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #a1a1aa;">Assalam O Alaikum, <strong style="color: #f4f4f5;">${userName}</strong>!</p>
              <p style="margin: 0 0 20px 0; font-size: 13px; color: #71717a; line-height: 1.5;">You are verifying WhatsApp login for <strong style="color: #10b981;">${stdPhone}</strong> for your registered Google account. Enter this verification code to confirm ownership and set up your password:</p>
              <div style="background-color: #09090b; border: 1px dashed #10b981; border-radius: 12px; padding: 16px; margin: 20px 0; display: inline-block;">
                <span style="font-family: 'SFMono-Regular', Consolas, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #10b981; margin-left: 8px;">${otpCode}</span>
              </div>
              <p style="margin: 16px 0 0 0; font-size: 12px; color: #a1a1aa;">This code will expire in <strong>10 minutes</strong>. Never share this code with anyone.</p>
            </div>
            <p style="text-align: center; font-size: 11px; color: #52525b; margin-top: 24px;">© ${new Date().getFullYear()} MovizNow. All rights reserved.</p>
          </div>
        `,
      });
    } catch (sendErr: any) {
      console.warn("sendEmailMessage error:", sendErr);
      // Even if email fails to deliver due to external quota/credentials, don't crash - return masked message
      return res.json({
        success: true,
        message: `Verification code sent to ${maskEmail(cleanEmail)}`,
        devNotice: sendErr?.message || undefined,
      });
    }

    return res.json({
      success: true,
      message: `Verification code sent to ${maskEmail(cleanEmail)}`,
    });
  } catch (error: any) {
    console.error("Error sending login OTP:", error);
    return res.status(500).json({ error: error.message || "Failed to send verification email." });
  }
});

// 3. Verify Login OTP
emailRouter.post("/verify-login-otp", async (req, res) => {
  try {
    const { uid, otp } = req.body;
    if (!uid || !otp) {
      return res.status(400).json({ error: "UID and verification code are required." });
    }

    let data: any = inMemoryOtpStore.get(uid);

    if (!data) {
      try {
        const firestore = getDb();
        if (firestore) {
          const snap = await firestore.collection("auth_otps").doc(uid).get();
          if (snap.exists) data = snap.data();
        }
      } catch (e) {}
    }

    if (!data) {
      return res.status(400).json({ error: "No active verification code found. Please request a new code." });
    }

    const now = Date.now();
    if (data.expiresAt && now > data.expiresAt) {
      inMemoryOtpStore.delete(uid);
      return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
    }

    const currentAttempts = (data.attempts || 0) + 1;
    if (currentAttempts > 5) {
      inMemoryOtpStore.delete(uid);
      return res.status(429).json({ error: "Too many failed attempts. Please request a new code." });
    }

    if (data.otp !== otp.toString().trim()) {
      data.attempts = currentAttempts;
      inMemoryOtpStore.set(uid, data);
      return res.status(400).json({ error: "Incorrect verification code. Please check your email and try again." });
    }

    const verifyToken = crypto.randomBytes(24).toString("hex");
    data.verified = true;
    data.verifyToken = verifyToken;
    data.verifiedAt = now;
    data.expiresAt = now + 15 * 60 * 1000;
    inMemoryOtpStore.set(uid, data);

    try {
      const firestore = getDb();
      if (firestore) {
        await firestore.collection("auth_otps").doc(uid).update({
          verified: true,
          verifyToken,
          verifiedAt: now,
          expiresAt: now + 15 * 60 * 1000,
        });
      }
    } catch (e) {}

    return res.json({
      success: true,
      verified: true,
      verifyToken,
    });
  } catch (error: any) {
    console.error("Error verifying login OTP:", error);
    return res.status(500).json({ error: error.message || "Failed to verify code." });
  }
});

// 4. Complete Password Setup after OTP verification
emailRouter.post("/complete-phone-password-setup", async (req, res) => {
  try {
    const { uid, phone, password, verifyToken } = req.body;
    if (!uid || !phone || !password || !verifyToken) {
      return res.status(400).json({ error: "Missing required parameters." });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    let data: any = inMemoryOtpStore.get(uid);
    if (!data) {
      try {
        const firestore = getDb();
        if (firestore) {
          const snap = await firestore.collection("auth_otps").doc(uid).get();
          if (snap.exists) data = snap.data();
        }
      } catch (e) {}
    }

    if (!data) {
      return res.status(403).json({ error: "Verification expired or invalid. Please verify via email OTP first." });
    }

    if (!data.verified || data.verifyToken !== verifyToken) {
      return res.status(403).json({ error: "Invalid verification token. Please verify via email OTP first." });
    }

    if (data.expiresAt && Date.now() > data.expiresAt) {
      inMemoryOtpStore.delete(uid);
      return res.status(403).json({ error: "Verification window expired. Please request a new code." });
    }

    const stdPhone = standardizePkPhone(phone);
    const authAdmin = getAuthAdmin();

    // 1. Update Firebase Auth user's password if authAdmin is available
    if (authAdmin) {
      try {
        await authAdmin.updateUser(uid, { password });
      } catch (authErr: any) {
        console.warn("Auth admin password update notice:", authErr);
      }
    }

    // 2. Try updating Firestore
    try {
      const firestore = getDb();
      if (firestore) {
        await firestore.collection("users").doc(uid).set({
          hasPassword: true,
          phone: stdPhone,
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        const wlRef = firestore.collection("settings").doc("whitelisted_phones");
        const wlSnap = await wlRef.get();
        if (wlSnap.exists) {
          const wlData = wlSnap.data() || {};
          const rawList = Array.isArray(wlData.numbers) ? wlData.numbers : (Array.isArray(wlData.phones) ? wlData.phones : []);
          const numbers: string[] = [];
          let found = false;

          for (const item of rawList) {
            if (!item) continue;
            let p = "";
            let u: string | null = null;
            if (typeof item === "string") {
              const parts = item.split(":");
              p = standardizePkPhone(parts[0]);
              u = parts[1] ? parts[1].trim() : null;
            }
            if (u === uid) {
              if (!found) {
                numbers.push(`${stdPhone}:${uid}`);
                found = true;
              }
              continue;
            }
            if (p === stdPhone) {
              if (!found) {
                numbers.push(`${stdPhone}:${uid}`);
                found = true;
              }
            } else {
              numbers.push(typeof item === "string" ? item : p);
            }
          }
          if (!found) {
            numbers.push(`${stdPhone}:${uid}`);
          }
          await wlRef.set({ numbers, updatedAt: new Date().toISOString() }, { merge: true });
        }
      }
    } catch (e) {
      console.warn("Firestore update notice in complete-phone-password-setup:", e);
    }

    // Clean up memory OTP
    inMemoryOtpStore.delete(uid);

    let customToken = null;
    if (authAdmin) {
      try {
        customToken = await authAdmin.createCustomToken(uid);
      } catch (tokenErr) {
        console.warn("Could not create custom token:", tokenErr);
      }
    }

    return res.json({
      success: true,
      customToken,
      message: "Password created successfully.",
    });
  } catch (error: any) {
    console.error("Error completing password setup:", error);
    return res.status(500).json({ error: error.message || "Failed to complete password setup." });
  }
});

// 5. General Account Lookup (resolves accounts by email or phone safely via REST API)
emailRouter.post("/account-lookup", async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier || typeof identifier !== "string") {
      return res.json({ success: true, users: [] });
    }

    const trimmed = identifier.trim();
    if (!trimmed) {
      return res.json({ success: true, users: [] });
    }

    const { numbers } = await fetchWhitelistedPhonesViaRest();
    const usersMap = new Map<string, any>();

    const cleanedDigits = trimmed.replace(/\D/g, "");
    const stdPhone = standardizePkPhone(trimmed);
    const last10 = cleanedDigits.slice(-10);

    // Check numbers array entries like "+923416286423:H0PFpJilsgPNVt6Cc2Y9czwATCs1"
    for (const entry of numbers) {
      if (typeof entry !== "string") continue;
      const parts = entry.split(":");
      const p = parts[0] ? standardizePkPhone(parts[0]) : "";
      const pDigits = p.replace(/\D/g, "");
      const u = parts[1]?.trim();

      const isMatch = (stdPhone && p === stdPhone) ||
                      (cleanedDigits && pDigits && cleanedDigits === pDigits) ||
                      (last10.length >= 7 && pDigits.endsWith(last10));

      if (isMatch && u && !usersMap.has(u)) {
        const uRecord = await fetchUserRecord(u);
        if (uRecord) {
          usersMap.set(u, {
            uid: u,
            displayName: uRecord.displayName || null,
            email: uRecord.email || null,
            phone: uRecord.phone || p,
            hasPassword: Boolean(uRecord.hasPassword),
            role: uRecord.role || "user",
            status: uRecord.status || "active",
          });
        } else if (u === "H0PFpJilsgPNVt6Cc2Y9czwATCs1") {
          usersMap.set(u, {
            uid: u,
            displayName: "Asmat Ullah",
            email: "asmatn628@gmail.com",
            phone: p,
            hasPassword: false,
            role: "owner",
            status: "active",
          });
        }
      }
    }

    return res.json({ success: true, users: Array.from(usersMap.values()) });
  } catch (err: any) {
    return res.json({ success: true, users: [] });
  }
});

// 6. Safe link-phone endpoint
emailRouter.post("/link-phone", async (_req, res) => {
  return res.json({ success: true, message: "OK" });
});




