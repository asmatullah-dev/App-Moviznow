import express from "express";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "../firebase-applet-config.json" with { type: "json" };

export const emailRouter = express.Router();

let adminApp: admin.app.App | undefined;

function getDb(): admin.firestore.Firestore | null {
  try {
    if (admin.apps.length > 0) {
      adminApp = admin.app();
    } else {
      adminApp = admin.initializeApp({
        projectId: firebaseConfig.projectId,
      });
    }
    return getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
  } catch (e) {
    console.warn("Firebase Admin not ready in email router:", e);
    return null;
  }
}

// Helper to get email settings (checks client-provided local settings first, falls back to Firestore / env)
async function getEmailConfig(clientSettings?: any) {
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
  const senderEmail = settings.senderEmail || user || "onboarding@resend.dev";
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

// Unified Send Function (Tries Resend API first for inbox delivery, falls back to SMTP)
async function sendEmailMessage({
  config,
  to,
  subject,
  html,
  text,
  replyTo
}: {
  config: any;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}) {
  const resendKey = config.resendApiKey || process.env.RESEND_API_KEY;

  if (resendKey && resendKey.trim().length > 0) {
    try {
      const resend = new Resend(resendKey.trim());

      // Determine 'from' address for Resend:
      // If user provided a custom domain senderEmail (not @gmail.com/@yahoo.com), use it.
      // Otherwise default to onboarding@resend.dev (Resend's default test domain).
      let fromAddress = config.senderEmail;
      if (!fromAddress || /@(gmail|yahoo|hotmail|outlook|live)\.com$/i.test(fromAddress)) {
        fromAddress = "onboarding@resend.dev";
      }

      const from = `"${config.senderName}" <${fromAddress}>`;
      const replyToAddress = replyTo || (config.senderEmail && !config.senderEmail.includes("resend.dev") ? config.senderEmail : undefined);

      const { data, error } = await resend.emails.send({
        from,
        to,
        subject,
        html,
        text: text || subject,
        replyTo: replyToAddress,
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

  const fromAddress = config.user || config.senderEmail;
  const replyToAddress = replyTo || config.user || config.senderEmail;

  const info = await transporter.sendMail({
    from: `"${config.senderName}" <${fromAddress}>`,
    to,
    replyTo: `"${config.senderName}" <${replyToAddress}>`,
    subject,
    text: text || subject,
    html,
  });

  return { provider: "smtp", messageId: info.messageId };
}

// 1. Send Welcome Email Endpoint
emailRouter.post("/send-welcome", async (req, res) => {
  try {
    const { email, displayName, appUrl, smtpSettings, isNewUser = true } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Recipient email is required." });
    }

    const config = await getEmailConfig(smtpSettings);

    if (!config.enableWelcomeEmail) {
      return res.json({ success: true, message: "Welcome emails are disabled in settings." });
    }

    const siteUrl = appUrl || "https://moviznow.com";
    const userName = displayName || "Movie Fan";

    const subject = isNewUser
      ? `🎬 Welcome to MovizNow, ${userName}!`
      : `👋 Welcome back to MovizNow, ${userName}!`;

    const greeting = isNewUser
      ? `Welcome to MovizNow, ${userName}! 👋`
      : `Welcome back, ${userName}! 👋`;

    const introText = isNewUser
      ? `We're thrilled to have you join our community! Get ready to explore thousands of high-quality movies, trending TV series, and exclusive content right at your fingertips.`
      : `Great to see you again! Dive right back into your favorite movies and series. We've added lots of new content since you were last here.`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background-color: #18181b; border-radius: 16px; border: 1px solid #27272a; overflow: hidden; }
          .header { background: linear-gradient(135deg, #e11d48 0%, #be123c 100%); padding: 32px 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }
          .content { padding: 32px 24px; line-height: 1.6; }
          .greeting { font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
          .text { color: #a1a1aa; font-size: 15px; margin-bottom: 20px; }
          .features { background-color: #27272a; border-radius: 12px; padding: 20px; margin: 24px 0; }
          .feature-item { display: flex; align-items: center; margin-bottom: 12px; color: #e4e4e7; font-size: 14px; }
          .btn-container { text-align: center; margin: 32px 0 16px; }
          .btn { background-color: #e11d48; color: #ffffff !important; padding: 14px 32px; font-weight: 700; font-size: 16px; text-decoration: none; border-radius: 12px; display: inline-block; box-shadow: 0 4px 14px rgba(225, 29, 72, 0.4); }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #71717a; border-top: 1px solid #27272a; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎬 MovizNow</h1>
          </div>
          <div class="content">
            <div class="greeting">${greeting}</div>
            <p class="text">${introText}</p>
            
            <div class="features">
              <div class="feature-item">🍿 <strong>Unlimited Streaming:</strong> Watch trending movies and series anytime.</div>
              <div class="feature-item">⭐ <strong>Watchlists & Favorites:</strong> Save titles to watch later.</div>
              <div class="feature-item">🚀 <strong>Fast Downloads:</strong> Multiple print quality options available.</div>
              <div class="feature-item">⚡ <strong>Request Movies:</strong> Ask for your favorite movies directly.</div>
            </div>

            <div class="btn-container">
              <a href="${siteUrl}" class="btn">Start Watching Now</a>
            </div>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} MovizNow. All rights reserved.</p>
            <p>You received this email because you ${isNewUser ? 'recently signed up for' : 'logged into'} MovizNow.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const result = await sendEmailMessage({
      config,
      to: email,
      subject: subject,
      text: `${greeting}\n\n${introText}\n\nStart watching now at ${siteUrl}`,
      html: htmlContent,
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

    // Determine target recipients
    let recipients: string[] = [];
    const firestore = getDb();
    let fetchFromDb = true;

    if (Array.isArray(targetEmails)) {
      recipients = targetEmails.filter(e => typeof e === "string" && e.includes("@"));
      fetchFromDb = false; // If targetEmails array is provided (even if empty), don't fallback to all users
    }
    
    if (fetchFromDb && firestore) {
      // Fetch all user emails from Firestore if targetEmails was not supplied
      try {
        const usersSnap = await firestore.collection("users").get();
        usersSnap.forEach((doc) => {
          const data = doc.data();
          if (data.email && typeof data.email === "string" && data.email.includes("@")) {
            recipients.push(data.email);
          }
        });
      } catch (err) {
        console.error("Error fetching users from Firestore for email notification:", err);
      }
    }

    // Deduplicate emails
    recipients = Array.from(new Set(recipients));

    if (recipients.length === 0) {
      return res.status(400).json({ error: "No recipient email addresses found. Please ensure users have valid email addresses in their profile." });
    }

    const siteUrl = appUrl || "https://moviznow.com";
    const watchUrl = contentId ? `${siteUrl}/${type === "series" ? "series" : "movie"}/${contentId}` : siteUrl;
    const displayTitle = secondTitle ? `${title} (${secondTitle})` : title;

    const isMovieNotification = !!contentId || !isManual;
    const subject = isMovieNotification
      ? `🎬 Watch Now: ${displayTitle}${year ? ` (${year})` : ""} is on MovizNow!`
      : `🔔 Notification: ${title}`;

    const htmlContent = isMovieNotification ? `
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


    let successCount = 0;
    let lastErrorMsg = "";

    // Send emails individually using unified send helper (Resend API or SMTP)
    for (const recipient of recipients) {
      try {
        await sendEmailMessage({
          config,
          to: recipient,
          subject: subject,
          text: `${subject}\n\n${description || customMessage || ""}\n\nLink: ${isMovieNotification ? watchUrl : siteUrl}`,
          html: htmlContent,
        });

        successCount++;
      } catch (err: any) {
        console.error(`Failed to send email to ${recipient}:`, err);
        lastErrorMsg = err.message || String(err);
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
          fromAddr = "onboarding@resend.dev";
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
