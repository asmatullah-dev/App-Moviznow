import express from "express";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "../firebase-applet-config.json" with { type: "json" };

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function isValidGmailAddress(email?: string | null): boolean {
  if (!email || typeof email !== "string") return false;
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail.endsWith("@moviznow.com")) return false;
  const gmailRegex = /^[a-zA-Z0-9._%+-]+@g(oogle)?mail\.com$/;
  return gmailRegex.test(cleanEmail);
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
    firestoreInstance = getFirestore(adminApp, (firebaseConfig as any).firestoreDatabaseId);
    try {
      firestoreInstance.settings({ ignoreUndefinedProperties: true });
    } catch {}
    return firestoreInstance;
  } catch (e) {
    console.warn("Firebase Admin not ready in email router:", e);
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
      candidateUsers = targetEmails.filter(e => typeof e === "string" && isValidGmailAddress(e)).map(e => ({ email: e }));
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


