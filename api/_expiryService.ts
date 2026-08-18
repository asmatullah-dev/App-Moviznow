import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "../firebase-applet-config.json" with { type: "json" };
import { getDb, getEmailConfig, sendEmailMessage, isValidGmailAddress } from "./_email.js";

// Helper to format date nicely
function formatDateDisplay(dateStr?: string): string {
  if (!dateStr) return "Today";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch (e) {
    return dateStr;
  }
}

// Generate the beautiful high-contrast membership update alert email HTML
function generateMembershipUpdateEmailHtml({
  displayName,
  email,
  expiryDateStr,
  siteUrl,
  userRole,
  userStatus,
}: {
  displayName: string;
  email: string;
  expiryDateStr: string;
  siteUrl: string;
  userRole?: string;
  userStatus?: string;
}): string {
  const homeUrl = `${siteUrl}/`;
  const formattedDate = expiryDateStr === "Lifetime" ? "Lifetime VIP Access" : formatDateDisplay(expiryDateStr);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Membership Updated - MovizNow</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 24px auto; background-color: #18181b; border-radius: 16px; border: 1px solid #27272a; overflow: hidden; }
        .header { background: linear-gradient(135deg, #10b981 0%, #047857 100%); padding: 28px 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }
        .header p { margin: 6px 0 0; font-size: 14px; color: #d1fae5; font-weight: 500; }
        .content { padding: 32px 24px; line-height: 1.6; }
        .alert-badge { display: inline-block; background-color: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); padding: 4px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; }
        .greeting { font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
        .text { color: #a1a1aa; font-size: 15px; margin-bottom: 20px; }
        
        .update-card { background-color: #27272a; border-radius: 14px; border: 1px solid #3f3f46; padding: 20px; margin: 24px 0; }
        .update-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #3f3f46; }
        
        .benefits-title { font-size: 13px; font-weight: 800; text-transform: uppercase; color: #34d399; margin: 16px 0 10px; letter-spacing: 0.5px; }
        .benefit-item { font-size: 14px; color: #e4e4e7; margin-bottom: 8px; line-height: 1.5; }
        
        .btn-container { text-align: center; margin: 32px 0 16px; }
        .btn-primary { background-color: #10b981; color: #ffffff !important; padding: 15px 38px; font-weight: 700; font-size: 15px; text-decoration: none; border-radius: 12px; display: inline-block; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.4); }
        
        .footer { text-align: center; padding: 24px 20px; font-size: 12px; color: #71717a; border-top: 1px solid #27272a; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>MovizNow</h1>
          <p>Membership Date & Status Update</p>
        </div>
        <div class="content">
          <span class="alert-badge">⭐ Membership Updated</span>
          <div class="greeting">Hello, ${displayName}!</div>
          <p class="text">
            Great news! Your MovizNow account membership has been updated and active access is confirmed.
          </p>

          <div class="update-card">
            <div style="font-size: 14px; color: #ffffff; font-weight: 600; margin-bottom: 12px;">Plan Details:</div>
            <div style="font-size: 13px; color: #d4d4d8; margin-bottom: 6px;"><strong>Registered Email:</strong> ${email}</div>
            <div style="font-size: 13px; color: #d4d4d8; margin-bottom: 6px;"><strong>Expiry Date:</strong> <span style="color: #34d399; font-weight: 700;">${formattedDate}</span></div>
            <div style="font-size: 13px; color: #d4d4d8; margin-bottom: 6px;"><strong>Account Role:</strong> ${userRole || 'VIP Member'}</div>
            <div style="font-size: 13px; color: #d4d4d8;"><strong>Account Status:</strong> <span style="color: #34d399; font-weight: 700;">Active</span></div>
            
            <div class="benefits-title">⚡ Your Active Benefits:</div>
            <div class="benefit-item">🍿 <strong>Unlimited HD & 4K Streaming:</strong> Stream all movies, web series, and seasons with zero buffering.</div>
            <div class="benefit-item">⚡ <strong>High-Speed Multi-Quality Downloads:</strong> 480p, 720p, 1080p, and 4K direct server downloads.</div>
            <div class="benefit-item">🔔 <strong>Movie & Series Requests:</strong> Priority fulfillment for custom movie and series requests.</div>
          </div>

          <p class="text">
            You can start watching and downloading immediately by visiting MovizNow:
          </p>

          <div class="btn-container">
            <a href="${homeUrl}" class="btn-primary">Explore MovizNow</a>
          </div>

          <p class="text" style="font-size: 13px; text-align: center; margin-top: 24px;">
            Thank you for being a valued member of MovizNow! If you have any questions, our support team is available 24/7.
          </p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} MovizNow. All rights reserved.</p>
          <p>You received this transactional service notice because your membership was updated by administration.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Generate the beautiful high-contrast expiry alert email HTML
function generateExpiryEmailHtml({
  displayName,
  email,
  expiryDateStr,
  siteUrl,
}: {
  displayName: string;
  email: string;
  expiryDateStr: string;
  siteUrl: string;
}): string {
  const membershipUrl = `${siteUrl}/membership`;
  const formattedDate = formatDateDisplay(expiryDateStr);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Membership Expired - MovizNow</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 24px auto; background-color: #18181b; border-radius: 16px; border: 1px solid #27272a; overflow: hidden; }
        .header { background: linear-gradient(135deg, #e11d48 0%, #9f1239 100%); padding: 28px 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }
        .header p { margin: 6px 0 0; font-size: 14px; color: #fecdd3; font-weight: 500; }
        .content { padding: 32px 24px; line-height: 1.6; }
        .alert-badge { display: inline-block; background-color: rgba(225, 29, 72, 0.2); color: #fb7185; border: 1px solid rgba(225, 29, 72, 0.4); padding: 4px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; }
        .greeting { font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
        .text { color: #a1a1aa; font-size: 15px; margin-bottom: 20px; }
        
        .expiry-card { background-color: #27272a; border-radius: 14px; border: 1px solid #3f3f46; padding: 20px; margin: 24px 0; }
        .expiry-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #3f3f46; }
        .expiry-label { font-size: 13px; color: #a1a1aa; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
        .expiry-val { font-size: 14px; color: #f43f5e; font-weight: 700; }
        
        .benefits-title { font-size: 13px; font-weight: 800; text-transform: uppercase; color: #fb7185; margin: 16px 0 10px; letter-spacing: 0.5px; }
        .benefit-item { font-size: 14px; color: #e4e4e7; margin-bottom: 8px; line-height: 1.5; }
        
        .btn-container { text-align: center; margin: 32px 0 16px; }
        .btn-primary { background-color: #e11d48; color: #ffffff !important; padding: 15px 38px; font-weight: 700; font-size: 15px; text-decoration: none; border-radius: 12px; display: inline-block; box-shadow: 0 4px 16px rgba(225, 29, 72, 0.4); }
        
        .footer { text-align: center; padding: 24px 20px; font-size: 12px; color: #71717a; border-top: 1px solid #27272a; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>MovizNow</h1>
          <p>Membership Status Update</p>
        </div>
        <div class="content">
          <span class="alert-badge">⚠️ Membership Expired</span>
          <div class="greeting">Hello, ${displayName}!</div>
          <p class="text">
            Your MovizNow access plan expired on <strong>${formattedDate}</strong>.
          </p>

          <div class="expiry-card">
            <div style="font-size: 14px; color: #ffffff; font-weight: 600; margin-bottom: 12px;">Account Summary:</div>
            <div style="font-size: 13px; color: #d4d4d8; margin-bottom: 6px;"><strong>Registered Email:</strong> ${email}</div>
            <div style="font-size: 13px; color: #d4d4d8; margin-bottom: 6px;"><strong>Expiration Date:</strong> <span style="color: #f43f5e; font-weight: 700;">${formattedDate}</span></div>
            <div style="font-size: 13px; color: #d4d4d8;"><strong>Current Access:</strong> Expired / Restricted</div>
            
            <div class="benefits-title">⚡ Renew now to restore full access:</div>
            <div class="benefit-item">🍿 <strong>Unlimited HD & 4K Streaming:</strong> Watch thousands of movies and web series without interruption.</div>
            <div class="benefit-item">⚡ <strong>High-Speed Multi-Quality Downloads:</strong> 480p, 720p, 1080p, and 4K direct download servers.</div>
            <div class="benefit-item">🔔 <strong>Movie & Series Requests:</strong> Priority fulfillment of your custom movie requests.</div>
          </div>

          <p class="text">
            Click the button below to view available membership plans and renew your account in seconds:
          </p>

          <div class="btn-container">
            <a href="${membershipUrl}" class="btn-primary">View Membership Plans</a>
          </div>
        </div>
        
        <div class="footer">
          <p style="margin: 0 0 8px;">© ${new Date().getFullYear()} MovizNow. All rights reserved.</p>
          <p style="margin: 0;">This is a transactional notice regarding your membership status.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Store In-App Notification directly into Firestore notification_chunks & notifications
async function saveInAppExpiryNotification(
  firestore: admin.firestore.Firestore,
  userId: string,
  userDisplayName: string,
  userEmail: string,
  expiryDateStr: string
) {
  const notifId = `expiry_${userId}_${expiryDateStr.replace(/[^a-zA-Z0-9]/g, "_")}`;
  const formattedDate = formatDateDisplay(expiryDateStr);

  const notifPayload = {
    id: notifId,
    title: "⚠️ Membership Expired",
    body: `Your MovizNow membership plan has expired on ${formattedDate}. Renew now to restore high-speed streaming and downloads.`,
    type: "custom",
    buttonLabel: "Renew Membership",
    buttonUrl: "/membership",
    targetUserId: userId,
    targetUserIds: [userId],
    targetUserNames: [userDisplayName || userEmail],
    createdBy: "System",
    createdAt: new Date().toISOString(),
    sendFcm: true,
  };

  try {
    // 1. Write to notification_chunk_0
    const chunkRef = firestore.collection("notification_chunks").doc("notification_chunk_0");
    const chunkSnap = await chunkRef.get();
    const existingItems = chunkSnap.exists ? chunkSnap.data()?.items || {} : {};

    const updatedItems = {
      [notifId]: notifPayload,
      ...existingItems,
    };

    const batch = firestore.batch();
    batch.set(
      chunkRef,
      {
        items: updatedItems,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 2. Update chunk metadata version so all active clients fetch it immediately
    const metaRef = firestore.collection("chunk_meta").doc("versions");
    batch.set(
      metaRef,
      {
        notifications: {
          version: Date.now(),
          latestChunkId: "notification_chunk_0",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        lastGlobalUpdate: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 3. Fallback standalone notification doc
    const standaloneRef = firestore.collection("notifications").doc(notifId);
    batch.set(standaloneRef, notifPayload, { merge: true });

    await batch.commit();
    console.log(`[Expiry Notification] In-app notification created for user ${userId} (${notifId})`);
    return true;
  } catch (err) {
    console.error(`[Expiry Notification] Failed to write in-app notification for ${userId}:`, err);
    return false;
  }
}

// Send FCM Push Notification to user
async function sendFcmExpiryNotification(userId: string, expiryDateStr: string) {
  try {
    if (!admin.apps.length) return false;

    const formattedDate = formatDateDisplay(expiryDateStr);
    const title = "⚠️ Membership Expired";
    const body = `Your MovizNow membership plan expired on ${formattedDate}. Tap to renew your plan.`;
    const targetUrl = "/membership";

    const message: any = {
      notification: {
        title,
        body,
      },
      data: {
        title,
        body,
        url: targetUrl,
        link: targetUrl,
        click_action: targetUrl,
        type: "membership_expiry",
      },
      webpush: {
        fcmOptions: {
          link: targetUrl,
        },
        notification: {
          title,
          body,
          icon: "/launcher.svg",
          badge: "/launcher.svg",
          data: {
            url: targetUrl,
            link: targetUrl,
            click_action: targetUrl,
            type: "membership_expiry",
          },
        },
      },
      topic: `user_${userId}`,
    };

    const response = await admin.messaging().send(message);
    console.log(`[Expiry Notification] FCM push sent to user_${userId}:`, response);
    return true;
  } catch (err: any) {
    console.warn(`[Expiry Notification] FCM push skipped or failed for user_${userId}:`, err.message);
    return false;
  }
}

export interface ExpiryCheckResult {
  totalUsersChecked: number;
  expiredUsersFound: number;
  notificationsSent: number;
  emailsSent: number;
  fcmSent: number;
  inAppCreated: number;
  processedUserIds: string[];
  skippedAlreadyNotified: number;
  errors: string[];
}

let lastFullExpiryRunTimestamp = 0;

/**
 * Main Background Expiry Service
 * Checks users in Firestore once every 24 hours and sends Email (via Alerts@MovizNow.com), FCM push, and in-app notifications
 * for accounts on the date of expired.
 */
export async function checkAndSendExpiryNotifications(targetUserId?: string, force = false): Promise<ExpiryCheckResult> {
  const result: ExpiryCheckResult = {
    totalUsersChecked: 0,
    expiredUsersFound: 0,
    notificationsSent: 0,
    emailsSent: 0,
    fcmSent: 0,
    inAppCreated: 0,
    processedUserIds: [],
    skippedAlreadyNotified: 0,
    errors: [],
  };

  const nowMs = Date.now();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  const firestore = getDb();
  if (!firestore) {
    result.errors.push("Firestore database not initialized");
    return result;
  }

  // Persistent daily rate limit check across server instances and restarts (Once a day after 6 AM PKT / 1 AM UTC)
  if (!targetUserId && !force) {
    try {
      const metaRef = firestore.collection("system_meta").doc("expiry_service");
      const metaSnap = await metaRef.get();
      const lastRun = metaSnap.exists ? metaSnap.data()?.lastFullRun || 0 : lastFullExpiryRunTimestamp;

      const now = new Date(nowMs);
      const currentThreshold = new Date(now.getTime());
      currentThreshold.setUTCHours(1, 0, 0, 0); // 1 AM UTC is 6 AM PKT
      
      if (now.getUTCHours() < 1) {
        currentThreshold.setUTCDate(currentThreshold.getUTCDate() - 1);
      }
      
      const thresholdMs = currentThreshold.getTime();

      if (lastRun >= thresholdMs) {
        console.log(`[Expiry Service] Skipping full check: already ran for the current cycle (since 6 AM PKT). Last run was ${((nowMs - lastRun) / 1000 / 60 / 60).toFixed(2)} hours ago.`);
        return result;
      }

      lastFullExpiryRunTimestamp = nowMs;
      await metaRef.set(
        { lastFullRun: nowMs, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    } catch (metaErr) {
      console.warn("[Expiry Service] System meta rate-limit check notice:", metaErr);
    }
  }

  try {
    const emailConfig = await getEmailConfig();

    let usersQuery: admin.firestore.Query = firestore.collection("users");
    if (targetUserId) {
      const userDoc = await firestore.collection("users").doc(targetUserId).get();
      if (!userDoc.exists) {
        result.errors.push(`Target user ${targetUserId} not found`);
        return result;
      }
      return await processUserDocs([userDoc], firestore, emailConfig, result);
    }

    const usersSnap = await usersQuery.get();
    return await processUserDocs(usersSnap.docs, firestore, emailConfig, result);
  } catch (err: any) {
    console.error("[Expiry Service Error]:", err);
    result.errors.push(err.message || String(err));
    return result;
  }
}

async function processUserDocs(
  docs: admin.firestore.DocumentSnapshot[],
  firestore: admin.firestore.Firestore,
  emailConfig: any,
  result: ExpiryCheckResult
): Promise<ExpiryCheckResult> {
  const now = new Date();
  // Today's YYYY-MM-DD in UTC and local boundary
  const todayStr = now.toISOString().split("T")[0];

  result.totalUsersChecked = docs.length;

  for (const doc of docs) {
    const data = doc.data();
    if (!data) continue;

    const uid = doc.id;
    const role = data.role || "user";
    const email = (data.email || "").trim();
    const displayName = data.displayName || email.split("@")[0] || "Member";
    const expiryDate = data.expiryDate;

    // Skip owners and admins
    if (role === "owner" || role === "admin") {
      continue;
    }

    // Skip accounts without expiryDate or with "Lifetime" access
    if (!expiryDate || expiryDate === "Lifetime" || expiryDate === "null" || expiryDate === "") {
      continue;
    }

    // Parse the expiry date
    const expiryDateStr = typeof expiryDate === "string" ? expiryDate.split("T")[0] : "";
    if (!expiryDateStr) continue;

    // Check if the user is on the date of expired or past expired
    // Parse parts [YYYY, MM, DD]
    const parts = expiryDateStr.split("-");
    if (parts.length !== 3) continue;

    const expiryYear = parseInt(parts[0], 10);
    const expiryMonth = parseInt(parts[1], 10) - 1;
    const expiryDay = parseInt(parts[2], 10);

    const isExpiredOrToday = now >= new Date(expiryYear, expiryMonth, expiryDay, 0, 0, 0) || todayStr >= expiryDateStr;

    if (!isExpiredOrToday) {
      // Not yet expired
      continue;
    }

    result.expiredUsersFound++;

    // Normalize date strings for safe comparison
    const targetNormalized = expiryDateStr;
    const lastNoticeNormalized = typeof data.lastExpiryNoticeFor === "string" ? data.lastExpiryNoticeFor.split("T")[0] : "";
    const noticeSentDateNormalized = typeof data.expiryNoticeSentDate === "string" ? data.expiryNoticeSentDate.split("T")[0] : "";

    // Quick initial check before running transaction
    if (
      lastNoticeNormalized === targetNormalized ||
      noticeSentDateNormalized === targetNormalized ||
      (data.expiryNoticeSent === true && lastNoticeNormalized === targetNormalized)
    ) {
      result.skippedAlreadyNotified++;
      continue;
    }

    // CRITICAL ATOMIC TRANSACTION: Claim lock BEFORE sending email to prevent double emails from concurrent runs
    const userRef = firestore.collection("users").doc(uid);
    let claimed = false;

    try {
      await firestore.runTransaction(async (transaction) => {
        const freshSnap = await transaction.get(userRef);
        if (!freshSnap.exists) return;
        const freshData = freshSnap.data() || {};

        const freshExpiryDate = freshData.expiryDate;
        if (!freshExpiryDate || freshExpiryDate === "Lifetime" || freshExpiryDate === "null" || freshExpiryDate === "") {
          return;
        }

        const freshExpiryStr = typeof freshExpiryDate === "string" ? freshExpiryDate.split("T")[0] : "";
        const freshLastNotice = typeof freshData.lastExpiryNoticeFor === "string" ? freshData.lastExpiryNoticeFor.split("T")[0] : "";
        const freshSentDate = typeof freshData.expiryNoticeSentDate === "string" ? freshData.expiryNoticeSentDate.split("T")[0] : "";

        if (
          freshLastNotice === freshExpiryStr ||
          freshSentDate === freshExpiryStr ||
          (freshData.expiryNoticeSent === true && freshLastNotice === freshExpiryStr)
        ) {
          // Already claimed/notified by another concurrent process
          claimed = false;
          return;
        }

        // Atomically mark user as processing/notified for this expiry date
        transaction.update(userRef, {
          status: "expired",
          lastExpiryNoticeFor: freshExpiryDate,
          lastExpiryNoticeSentAt: new Date().toISOString(),
          expiryNoticeSent: true,
          expiryNoticeSentDate: freshExpiryStr,
          updatedAt: new Date().toISOString(),
        });

        claimed = true;
      });
    } catch (txErr: any) {
      console.warn(`[Expiry Claim Lock Failed for user ${uid}]:`, txErr.message);
      claimed = false;
    }

    if (!claimed) {
      console.log(`[Expiry Notification] User ${uid} was already claimed/notified by another concurrent process. Skipping.`);
      result.skippedAlreadyNotified++;
      continue;
    }

    console.log(`[Expiry Notification] Claimed lock. Processing expiration notice for user ${uid} (${email}), expired on ${expiryDateStr}`);

    let emailSuccess = false;
    let fcmSuccess = false;
    let inAppSuccess = false;

    const isEmailAllowed =
      data.notificationPreferences?.email?.enabled !== false &&
      data.notificationPreferences?.email?.membershipAlerts !== false &&
      data.notificationPreferences?.email?.membershipExpiry !== false &&
      data.emailNotificationsEnabled !== false &&
      data.emailNotificationsDisabled !== true &&
      data.unsubscribed !== true;

    const isFcmAllowed =
      data.notificationPreferences?.fcm?.enabled !== false &&
      data.notificationPreferences?.fcm?.membershipAlerts !== false &&
      data.notificationPreferences?.fcm?.membershipExpiry !== false &&
      data.notification !== "no" &&
      !data.isFcmDisabled;

    // 1. Send Email Notification (from Alerts@MovizNow.com - transactional account alert)
    if (isEmailAllowed && email && isValidGmailAddress(email)) {
      try {
        const siteUrl = "https://MovizNow.com";
        const emailHtml = generateExpiryEmailHtml({
          displayName,
          email,
          expiryDateStr,
          siteUrl,
        });

        const subject = `⚠️ Action Required: Your MovizNow Membership Has Expired`;
        const emailResult = await sendEmailMessage({
          config: emailConfig,
          to: email,
          subject,
          html: emailHtml,
          text: `Hello ${displayName},\n\nYour MovizNow membership has expired on ${formatDateDisplay(expiryDateStr)}.\n\nView membership plans to restore high-speed 4K/1080p downloads and unlimited streaming:\n${siteUrl}/membership\n\n© MovizNow`,
          senderEmailOverride: "Alerts@MovizNow.com",
          replyTo: "contactus@MovizNow.com",
        });

        if (emailResult) {
          emailSuccess = true;
          result.emailsSent++;
          console.log(`[Expiry Email] Sent to ${email} via ${emailResult.provider} from Alerts@MovizNow.com`);
        }
      } catch (emailErr: any) {
        console.warn(`[Expiry Email Failed for ${email}]:`, emailErr.message);
        result.errors.push(`Email error for ${email}: ${emailErr.message}`);
      }
    } else {
      console.log(`[Expiry Email Skipped] User ${email} email notification is muted or not a valid Gmail address`);
    }

    // 2. Send FCM Push Notification
    if (isFcmAllowed) {
      fcmSuccess = await sendFcmExpiryNotification(uid, expiryDateStr);
      if (fcmSuccess) {
        result.fcmSent++;
      }
    } else {
      console.log(`[Expiry FCM Skipped] User ${uid} FCM push notification is disabled`);
    }

    // 3. Create In-App Notification in Firestore
    inAppSuccess = await saveInAppExpiryNotification(firestore, uid, displayName, email, expiryDateStr);
    if (inAppSuccess) {
      result.inAppCreated++;
    }

    result.notificationsSent++;
    result.processedUserIds.push(uid);
  }

  console.log(`[Expiry Service Completed] Checked: ${result.totalUsersChecked}, Expired: ${result.expiredUsersFound}, Notifications Sent: ${result.notificationsSent}, Emails: ${result.emailsSent}, In-App: ${result.inAppCreated}, Skipped (Already Notified): ${result.skippedAlreadyNotified}`);
  return result;
}

// In-app notification creation for membership update
async function saveInAppMembershipUpdateNotification(
  firestore: admin.firestore.Firestore,
  userId: string,
  displayName: string,
  email: string,
  expiryDateStr: string
) {
  try {
    const notifId = `notif_update_${userId}_${Date.now()}`;
    const formattedDate = expiryDateStr === "Lifetime" ? "Lifetime Access" : formatDateDisplay(expiryDateStr);
    const title = "⭐ Membership Updated";
    const message = `Your MovizNow membership has been updated to ${formattedDate}. Full streaming and download access is active.`;
    const createdAt = new Date().toISOString();

    const notifPayload = {
      id: notifId,
      title,
      message,
      type: "membership_update",
      target: "user",
      targetUserId: userId,
      link: "/membership",
      read: false,
      readBy: [],
      createdAt,
    };

    const chunkRef = firestore.collection("notification_chunks").doc("notification_chunk_0");
    const chunkSnap = await chunkRef.get();
    const existingItems = chunkSnap.exists ? chunkSnap.data()?.items || {} : {};

    const updatedItems = {
      [notifId]: notifPayload,
      ...existingItems,
    };

    const batch = firestore.batch();
    batch.set(
      chunkRef,
      {
        items: updatedItems,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const metaRef = firestore.collection("chunk_meta").doc("versions");
    batch.set(
      metaRef,
      {
        notifications: {
          version: Date.now(),
          latestChunkId: "notification_chunk_0",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        lastGlobalUpdate: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const standaloneRef = firestore.collection("notifications").doc(notifId);
    batch.set(standaloneRef, notifPayload, { merge: true });

    await batch.commit();
    return true;
  } catch (err) {
    console.error(`[Membership Update] Failed to write in-app notification for ${userId}:`, err);
    return false;
  }
}

export interface MembershipUpdateParams {
  userId: string;
  newExpiryDate: string;
  previousExpiryDate?: string;
  role?: string;
  status?: string;
  adminName?: string;
}

/**
 * Send notification when membership expiry date or status is changed by Admin
 * Strictly respects user's enabled notification services (FCM push & Email)
 */
export async function sendMembershipUpdateNotification(params: MembershipUpdateParams) {
  const { userId, newExpiryDate, role, status } = params;
  const firestore = getDb();
  if (!firestore) {
    return { success: false, error: "Firestore not initialized" };
  }

  try {
    const userDoc = await firestore.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return { success: false, error: `User ${userId} not found` };
    }

    const data = userDoc.data() || {};
    const email = (data.email || "").trim();
    const displayName = data.displayName || email.split("@")[0] || "Member";
    const userRole = role || data.role || "user";
    const userStatus = status || data.status || "active";

    const isEmailAllowed =
      data.notificationPreferences?.email?.enabled !== false &&
      data.notificationPreferences?.email?.membershipAlerts !== false &&
      data.notificationPreferences?.email?.membershipExpiry !== false &&
      data.emailNotificationsEnabled !== false &&
      data.emailNotificationsDisabled !== true &&
      data.unsubscribed !== true &&
      isValidGmailAddress(email);

    const isFcmAllowed =
      data.notificationPreferences?.fcm?.enabled !== false &&
      data.notificationPreferences?.fcm?.membershipAlerts !== false &&
      data.notificationPreferences?.fcm?.membershipExpiry !== false &&
      data.notification !== "no" &&
      !data.isFcmDisabled;

    let fcmSent = false;
    let emailSent = false;
    let inAppCreated = false;

    const formattedDate = newExpiryDate === "Lifetime" ? "Lifetime Access" : formatDateDisplay(newExpiryDate);

    // 1. Send FCM Push Notification if enabled
    if (isFcmAllowed && admin.apps.length) {
      try {
        const title = "⭐ Membership Updated";
        const body = `Your MovizNow membership plan has been updated to ${formattedDate}. Enjoy unlimited streaming & downloads!`;
        const targetUrl = "/";

        const message: any = {
          notification: {
            title,
            body,
          },
          data: {
            title,
            body,
            url: targetUrl,
            link: targetUrl,
            click_action: targetUrl,
            type: "membership_update",
          },
          webpush: {
            fcmOptions: {
              link: targetUrl,
            },
            notification: {
              title,
              body,
              icon: "/launcher.svg",
              badge: "/launcher.svg",
              data: {
                url: targetUrl,
                link: targetUrl,
                click_action: targetUrl,
                type: "membership_update",
              },
            },
          },
          topic: `user_${userId}`,
        };

        await admin.messaging().send(message);
        fcmSent = true;
        console.log(`[Membership Update] FCM push sent to topic user_${userId}`);
      } catch (fcmErr: any) {
        console.warn(`[Membership Update FCM failed for user_${userId}]:`, fcmErr.message);
      }
    } else {
      console.log(`[Membership Update] FCM push skipped for user ${userId} (Service disabled by user preference)`);
    }

    // 2. Send Email Notification if enabled
    if (isEmailAllowed && email) {
      try {
        const emailConfig = await getEmailConfig();
        const siteUrl = "https://MovizNow.com";
        const emailHtml = generateMembershipUpdateEmailHtml({
          displayName,
          email,
          expiryDateStr: newExpiryDate,
          siteUrl,
          userRole,
          userStatus,
        });

        const subject = `⭐ Membership Updated: Your MovizNow Plan is Active`;
        const emailResult = await sendEmailMessage({
          config: emailConfig,
          to: email,
          subject,
          html: emailHtml,
          text: `Hello ${displayName},\n\nYour MovizNow membership has been updated!\n\nNew Expiry Date: ${formattedDate}\nRole: ${userRole}\nStatus: Active\n\nEnjoy unlimited high-speed 4K/1080p downloads and streaming:\n${siteUrl}/membership\n\n© MovizNow`,
          senderEmailOverride: "Alerts@MovizNow.com",
          replyTo: "contactus@MovizNow.com",
        });

        if (emailResult) {
          emailSent = true;
          console.log(`[Membership Update Email] Sent to ${email} via ${emailResult.provider}`);
        }
      } catch (emailErr: any) {
        console.warn(`[Membership Update Email failed for ${email}]:`, emailErr.message);
      }
    } else {
      console.log(`[Membership Update] Email notification skipped for user ${email} (Service disabled by user preference or invalid email)`);
    }

    // 3. Create In-App Notification
    inAppCreated = await saveInAppMembershipUpdateNotification(firestore, userId, displayName, email, newExpiryDate);

    // If membership is being set to expired, mark expiryNoticeSent flags to prevent duplicate automated expiry emails
    if (userStatus === "expired" && newExpiryDate) {
      const expStr = typeof newExpiryDate === "string" ? newExpiryDate.split("T")[0] : newExpiryDate;
      await firestore.collection("users").doc(userId).set({
        lastExpiryNoticeFor: newExpiryDate,
        expiryNoticeSent: true,
        expiryNoticeSentDate: expStr,
        lastExpiryNoticeSentAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {});
    }

    return {
      success: true,
      fcmSent,
      emailSent,
      inAppCreated,
      preferences: {
        fcmAllowed: isFcmAllowed,
        emailAllowed: isEmailAllowed,
      },
    };
  } catch (error: any) {
    console.error(`[Membership Update Notification Error]:`, error);
    return { success: false, error: error.message || String(error) };
  }
}
export interface OrderApprovedParams {
  userId: string;
  orderId: string;
  orderType: string;
  newExpiryDate?: string;
}

export async function sendOrderApprovedNotification(params: OrderApprovedParams) {
  const { userId, orderId, orderType, newExpiryDate } = params;
  const firestore = getDb();
  if (!firestore) return { success: false };

  try {
    const userDoc = await firestore.collection("users").doc(userId).get();
    if (!userDoc.exists) return { success: false };

    const data = userDoc.data() || {};
    const email = (data.email || "").trim();
    const displayName = data.displayName || email.split("@")[0] || "Member";

    const isEmailAllowed =
      data.notificationPreferences?.email?.enabled !== false &&
      data.notificationPreferences?.email?.orders !== false &&
      data.emailNotificationsEnabled !== false &&
      data.emailNotificationsDisabled !== true &&
      data.unsubscribed !== true &&
      isValidGmailAddress(email);

    const isFcmAllowed =
      data.notificationPreferences?.fcm?.enabled !== false &&
      data.notificationPreferences?.fcm?.orders !== false &&
      data.notification !== "no" &&
      !data.isFcmDisabled;

    const formattedDate = newExpiryDate ? (newExpiryDate === "Lifetime" ? "Lifetime Access" : formatDateDisplay(newExpiryDate)) : "";

    if (isFcmAllowed && admin.apps.length) {
      try {
        const title = `✅ Order Approved (#${orderId})`;
        const body = orderType === 'membership' 
          ? `Your membership order was approved! New expiry: ${formattedDate}`
          : `Your content order was approved!`;
        const targetUrl = "/";
        await admin.messaging().send({
          notification: { title, body },
          data: { title, body, url: targetUrl, link: targetUrl, click_action: targetUrl, type: "order_approved" },
          topic: `user_${userId}`
        });
      } catch (e: any) { console.warn(`FCM order fail:`, e.message); }
    }

    if (isEmailAllowed && email) {
      try {
        const emailConfig = await getEmailConfig();
        const siteUrl = "https://MovizNow.com";
        const homeUrl = `${siteUrl}/`;
        
        const html = `
          <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #09090b; color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #27272a;">
            <!-- Header -->
            <div style="text-align: center; padding: 30px 20px; background-color: #18181b; border-bottom: 1px solid #27272a;">
              <h1 style="margin: 0; color: #10b981; font-size: 28px; letter-spacing: -0.5px;">MovizNow</h1>
            </div>

            <!-- Body -->
            <div style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px; font-size: 24px; font-weight: 600;">Payment Successful</h2>
              <p style="margin: 0 0 24px; color: #a1a1aa; font-size: 16px; line-height: 1.5;">Hello ${displayName},<br/>Your recent order has been successfully processed and your account has been updated.</p>

              <!-- Order Details Card -->
              <div style="background-color: #18181b; border-radius: 8px; padding: 20px; margin-bottom: 30px; border: 1px solid #27272a;">
                <h3 style="margin: 0 0 16px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #71717a;">Order Summary</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 12px 0; color: #a1a1aa; border-bottom: 1px solid #27272a;">Order ID</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; border-bottom: 1px solid #27272a; color: #ffffff;">#${orderId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #a1a1aa; border-bottom: ${orderType === 'membership' && newExpiryDate ? '1px solid #27272a' : 'none'};">Item</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 500; border-bottom: ${orderType === 'membership' && newExpiryDate ? '1px solid #27272a' : 'none'}; color: #ffffff;">${orderType === 'membership' ? 'VIP Membership' : 'Content Purchase'}</td>
                  </tr>
                  ${orderType === 'membership' && newExpiryDate ? `
                  <tr>
                    <td style="padding: 12px 0; color: #a1a1aa;">Expiry Date</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: 600; color: #10b981;">${formattedDate}</td>
                  </tr>
                  ` : ''}
                </table>
              </div>

              <div style="text-align: center;">
                <a href="${homeUrl}" style="display: inline-block; padding: 14px 28px; background-color: #10b981; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Start Watching</a>
              </div>
            </div>

            <!-- Footer -->
            <div style="text-align: center; padding: 30px 20px; background-color: #18181b; border-top: 1px solid #27272a;">
              <p style="margin: 0; color: #71717a; font-size: 14px;">If you have any questions, contact us at <a href="mailto:contactus@MovizNow.com" style="color: #10b981; text-decoration: none;">contactus@MovizNow.com</a></p>
              <p style="margin: 10px 0 0; color: #52525b; font-size: 12px;">© ${new Date().getFullYear()} MovizNow. All rights reserved.</p>
            </div>
          </div>
        `;
        
        await sendEmailMessage({
          config: emailConfig,
          to: email,
          subject: `✅ Order Approved (#${orderId})`,
          html,
          text: `Your order #${orderId} was approved. ${orderType === 'membership' && newExpiryDate ? 'New expiry: ' + formattedDate : ''}`,
          senderEmailOverride: "Alerts@MovizNow.com",
          replyTo: "contactus@MovizNow.com",
        });
      } catch (e: any) { console.warn(`Email order fail:`, e.message); }
    }

    await saveInAppMembershipUpdateNotification(firestore, userId, displayName, email, newExpiryDate || "");
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false };
  }
}
