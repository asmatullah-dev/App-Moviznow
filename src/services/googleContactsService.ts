import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile } from '../types';
import { isUserExpired } from '../contexts/UsersContext';
import { doc, updateDoc, getDoc, setDoc, deleteDoc, deleteField, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

const CONTACTS_SCOPE = 'https://www.googleapis.com/auth/contacts';
const STORAGE_TOKEN_KEY = 'gcontacts_access_token';
const STORAGE_EXPIRY_KEY = 'gcontacts_token_expiry';
const STORAGE_EMAIL_KEY = 'gcontacts_account_email';
const STORAGE_AUTHORIZED_KEY = 'gcontacts_is_authorized';
const STORAGE_PENDING_KEY = 'gcontacts_pending_sync_queue';

export interface PendingContactItem {
  uid: string;
  user: UserProfile;
  queuedAt: string;
  reason?: string;
  attempts?: number;
  lastAttemptAt?: string;
  lastError?: string;
}

// Memory cache for contact group resource names during session
const groupResourceCache: Record<string, string> = {};

/**
 * Gets local pending contacts queue from localStorage
 */
export function getLocalPendingQueue(): Record<string, PendingContactItem> {
  try {
    const data = localStorage.getItem(STORAGE_PENDING_KEY);
    if (data) {
      return JSON.parse(data) || {};
    }
  } catch (e) {
    console.warn('[Google Contacts] Error reading local pending queue:', e);
  }
  return {};
}

/**
 * Saves local pending contacts queue to localStorage
 */
export function saveLocalPendingQueue(queue: Record<string, PendingContactItem>): void {
  try {
    localStorage.setItem(STORAGE_PENDING_KEY, JSON.stringify(queue));
    // Dispatch custom event to notify components in the same window
    window.dispatchEvent(new CustomEvent('gcontacts_pending_updated', { detail: queue }));
  } catch (e) {
    console.warn('[Google Contacts] Error saving local pending queue:', e);
  }
}

/**
 * Returns array of currently pending contacts
 */
export function getPendingContactsList(): PendingContactItem[] {
  const queue = getLocalPendingQueue();
  return Object.values(queue);
}

/**
 * Adds a user to the Pending Contact Sync queue in both localStorage and Firestore settings/google_contacts
 */
export async function addToPendingContactsSync(user: UserProfile, reason: string = 'Sync pending / token refresh needed'): Promise<void> {
  if (!user || !user.uid) return;

  const item: PendingContactItem = {
    uid: user.uid,
    user: { ...user },
    queuedAt: new Date().toISOString(),
    reason,
    attempts: 0
  };

  // 1. Update localStorage
  const localQueue = getLocalPendingQueue();
  localQueue[user.uid] = item;
  saveLocalPendingQueue(localQueue);

  // 2. Update Firestore settings/google_contacts
  try {
    const docRef = doc(db, 'settings', 'google_contacts');
    await setDoc(docRef, {
      [`pendingContacts.${user.uid}`]: item,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('[Google Contacts] Error saving pending contact to Firestore settings:', err);
  }

  // 3. Mark in user profile
  try {
    if (!user.uid.startsWith('pending_')) {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        contactSyncStatus: 'pending',
        contactSyncPendingAt: new Date().toISOString()
      }).catch(() => {});
    }
  } catch (e) {}

  console.log(`[Google Contacts Queue] Queued user ${user.displayName || user.phone || user.uid} to pending sync: ${reason}`);
}

/**
 * Removes a user from the Pending Contact Sync queue once successfully synced
 */
export async function removeFromPendingContactsSync(uid: string): Promise<void> {
  if (!uid) return;

  // 1. Update localStorage
  const localQueue = getLocalPendingQueue();
  if (localQueue[uid]) {
    delete localQueue[uid];
    saveLocalPendingQueue(localQueue);
  }

  // 2. Remove from Firestore settings/google_contacts
  try {
    const docRef = doc(db, 'settings', 'google_contacts');
    await updateDoc(docRef, {
      [`pendingContacts.${uid}`]: deleteField(),
      updatedAt: new Date().toISOString()
    }).catch(async () => {
      // If document or field doesn't exist yet, fetch and re-save
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.pendingContacts && data.pendingContacts[uid]) {
          delete data.pendingContacts[uid];
          await setDoc(docRef, { pendingContacts: data.pendingContacts }, { merge: true });
        }
      }
    });
  } catch (err) {
    console.warn('[Google Contacts] Error removing pending contact from Firestore settings:', err);
  }

  // 3. Mark in user profile as synced
  try {
    if (!uid.startsWith('pending_')) {
      const userDocRef = doc(db, 'users', uid);
      await updateDoc(userDocRef, {
        contactSyncStatus: 'synced',
        contactLastSyncedAt: new Date().toISOString()
      }).catch(() => {});
    }
  } catch (e) {}

  console.log(`[Google Contacts Queue] Removed user ${uid} from pending sync queue (synced successfully)`);
}

/**
 * Fetches latest pending contacts from Firestore settings/google_contacts and merges with localStorage
 */
export async function fetchPendingContactsFromFirestore(): Promise<PendingContactItem[]> {
  const localQueue = getLocalPendingQueue();

  try {
    const docRef = doc(db, 'settings', 'google_contacts');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.pendingContacts && typeof data.pendingContacts === 'object') {
        const merged = { ...localQueue, ...data.pendingContacts };
        saveLocalPendingQueue(merged);
        return Object.values(merged);
      }
    }
  } catch (err) {
    console.warn('[Google Contacts] Error fetching pending contacts from Firestore:', err);
  }

  return Object.values(localQueue);
}

/**
 * Gets or creates a Google Contacts Group / Label by name (e.g., "Created by MovizNow" or "Modified by MovizNow")
 */
export async function getOrCreateContactGroup(groupName: string, accessToken: string): Promise<string | null> {
  if (groupResourceCache[groupName]) {
    return groupResourceCache[groupName];
  }

  try {
    const res = await fetch('https://people.googleapis.com/v1/contactGroups?pageSize=1000', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.contactGroups && Array.isArray(data.contactGroups)) {
        const found = data.contactGroups.find((g: any) => g.name === groupName || g.formattedName === groupName);
        if (found && found.resourceName) {
          groupResourceCache[groupName] = found.resourceName;
          return found.resourceName;
        }
      }
    }

    const createRes = await fetch('https://people.googleapis.com/v1/contactGroups', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contactGroup: { name: groupName }
      })
    });

    if (createRes.ok) {
      const createdData = await createRes.json();
      if (createdData && createdData.resourceName) {
        groupResourceCache[groupName] = createdData.resourceName;
        return createdData.resourceName;
      }
    }
  } catch (err) {
    console.warn(`Could not get or create contact group "${groupName}":`, err);
  }

  return null;
}

/**
 * Parses DOB string into Google People API birthday date object { year, month, day }
 */
export function parseDobToGoogleDate(dobStr: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!dobStr || !dobStr.trim()) return null;
  const clean = dobStr.split('T')[0].trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const parts = clean.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  const dateObj = new Date(dobStr);
  if (!isNaN(dateObj.getTime())) {
    return {
      year: dateObj.getUTCFullYear(),
      month: dateObj.getUTCMonth() + 1,
      day: dateObj.getUTCDate()
    };
  }

  return null;
}

/**
 * Extracts DOB as YYYY-MM-DD from Google Contact birthdays array
 */
export function extractDobFromGoogleContact(birthdays?: any[]): string | undefined {
  if (!birthdays || !Array.isArray(birthdays) || birthdays.length === 0) return undefined;
  const b = birthdays[0];
  if (b.date) {
    const { year, month, day } = b.date;
    if (year && month && day) {
      const yyyy = String(year).padStart(4, '0');
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  if (b.text && /^\d{4}-\d{2}-\d{2}$/.test(b.text.trim())) {
    return b.text.trim();
  }
  return undefined;
}

/**
 * Updates or uploads a photo/avatar for a Google Contact using the Google People API (:updateContactPhoto).
 * Prioritizes the server-side proxy which eliminates browser CORS & referer blocking,
 * processes the image with sharp to a clean 500x500 JPEG, and uploads to Google People API.
 */
export async function updateGoogleContactPhoto(
  resourceName: string,
  photoUrl: string,
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  if (!resourceName || !photoUrl || !accessToken) {
    return { success: false, error: 'Missing required parameters' };
  }

  const cleanResourceName = resourceName.startsWith('people/')
    ? resourceName
    : `people/${resourceName}`;

  // 1. Primary: Use backend proxy to download, resize, convert to clean JPEG, and upload
  try {
    const res = await fetch('/api/contacts/update-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resourceName: cleanResourceName,
        photoUrl,
        accessToken
      })
    });

    if (res.ok) {
      console.log(`[Google Contacts Photo] Successfully updated photo for ${cleanResourceName} via backend proxy`);
      return { success: true };
    } else {
      const errData = await res.json().catch(() => ({}));
      console.warn(`[Google Contacts Photo] Backend update failed (${res.status}):`, errData);
    }
  } catch (backendErr) {
    console.warn(`[Google Contacts Photo] Backend proxy error, attempting client fallback:`, backendErr);
  }

  // 2. Client-side fallback (if backend is temporarily unavailable)
  try {
    let base64Photo = '';

    if (photoUrl.startsWith('data:image/')) {
      base64Photo = photoUrl.split(',')[1] || '';
    } else if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) {
      const response = await fetch(photoUrl, { referrerPolicy: 'no-referrer' });
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, chunk as any);
        }
        base64Photo = btoa(binary);
      }
    }

    if (base64Photo) {
      const updateUrl = `https://people.googleapis.com/v1/${cleanResourceName}:updateContactPhoto`;
      const res = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          photoBytes: base64Photo,
          personFields: 'photos'
        })
      });

      if (res.ok) {
        console.log(`[Google Contacts Photo] Successfully updated photo for ${cleanResourceName} via client fallback`);
        return { success: true };
      }
    }
  } catch (clientErr) {
    console.warn(`[Google Contacts Photo] Client fallback error for ${cleanResourceName}:`, clientErr);
  }

  return { success: false, error: 'Failed to update contact photo' };
}

function loadGoogleGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existingScript = document.getElementById('google-gsi-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', (e) => reject(e));
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (e) => reject(new Error('Failed to load Google Identity Services SDK'));
    document.head.appendChild(script);
  });
}

export interface PhoneNormalizationResult {
  normalized: string; // E.164 e.g. +923001234567
  matchKey: string;   // Last 10 digits or core digits e.g. 3001234567
}

/**
 * Converts Eastern Arabic/Persian/Urdu digits to standard ASCII digits (0-9).
 */
function convertToAsciiDigits(str: string): string {
  return str
    .replace(/[٠۰]/g, '0')
    .replace(/[١۱]/g, '1')
    .replace(/[٢۲]/g, '2')
    .replace(/[٣۳]/g, '3')
    .replace(/[٤۴]/g, '4')
    .replace(/[٥۵]/g, '5')
    .replace(/[٦۶]/g, '6')
    .replace(/[٧۷]/g, '7')
    .replace(/[٨۸]/g, '8')
    .replace(/[٩۹]/g, '9');
}

/**
 * Normalizes phone numbers, specifically handling Pakistani formats:
 * +923xxxxxxxxx, 923xxxxxxxxx, 03xxxxxxxxx, 3xxxxxxxxx, 00923xxxxxxxxx
 * Always formats Pakistani numbers as +92xxxxxxxxxx for saving.
 */
export function normalizePhone(phoneStr: string | null | undefined): PhoneNormalizationResult {
  if (!phoneStr) return { normalized: '', matchKey: '' };

  let trimmed = convertToAsciiDigits(phoneStr.trim());
  // Strip non-digit characters except leading +
  let cleaned = trimmed.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }

  const digits = cleaned.replace(/\D/g, '');

  // Pakistani number format recognition
  if (digits.startsWith('92') && digits.length === 12) {
    const normalized = '+' + digits;
    return { normalized, matchKey: digits.slice(-10) };
  } else if (digits.startsWith('03') && digits.length === 11) {
    const normalized = '+92' + digits.slice(1);
    return { normalized, matchKey: digits.slice(-10) };
  } else if (digits.startsWith('3') && digits.length === 10) {
    const normalized = '+92' + digits;
    return { normalized, matchKey: digits };
  } else if (cleaned.startsWith('+')) {
    return { normalized: cleaned, matchKey: digits.length >= 10 ? digits.slice(-10) : digits };
  } else {
    const normalized = digits.length >= 10 ? '+' + digits : digits;
    return { normalized, matchKey: digits.length >= 10 ? digits.slice(-10) : digits };
  }
}

/**
 * Extracts city name from contact name if present in parentheses e.g. "Ikram Raza (Lahore)" -> "Lahore",
 * or "AV27/01/25 1Y Muhammad Khalid Khan (Peshawar) +1100" -> "Peshawar".
 * Ignores phone numbers and pure digits in parentheses like "(03001234567)".
 */
export function extractCityFromContactName(contactName: string | null | undefined): string | null {
  if (!contactName || !contactName.trim()) return null;
  const parenMatches = Array.from(contactName.matchAll(/\(([^)]+)\)/g));
  let fallbackCity: string | null = null;

  for (const match of parenMatches) {
    const candidate = match[1].trim();
    if (!candidate) continue;
    // Skip if it's purely digits, plus/minus, or a phone number
    if (/^[\d\s\+\-\(\)]+$/.test(candidate)) continue;

    if (candidate.toLowerCase() === 'city') {
      fallbackCity = 'City';
    } else {
      return candidate; // Found actual city name (e.g. Peshawar, Lahore, Karachi, Islamabad)
    }
  }

  return fallbackCity;
}

/**
 * Replaces or cleanly formats the parenthesized city in a contact name string without duplicating.
 * Handles strings with suffixes like "1Y Muhammad Khalid Khan (Peshawar) +1100" or already duplicated "(Peshawar) (Peshawar)".
 */
export function formatNameWithCity(restOfName: string, targetCity: string): string {
  if (!restOfName || !restOfName.trim()) {
    return `User (${targetCity})`;
  }

  const trimmed = restOfName.trim();
  const parenMatches = Array.from(trimmed.matchAll(/\(([^)]+)\)/g));
  const cityMatches: { match: string; index: number; content: string }[] = [];

  for (const m of parenMatches) {
    const candidate = m[1].trim();
    if (candidate && !/^[\d\s\+\-\(\)]+$/.test(candidate)) {
      cityMatches.push({
        match: m[0],
        index: m.index ?? -1,
        content: candidate
      });
    }
  }

  if (cityMatches.length > 0) {
    // There is at least one existing city parenthesis (e.g. (Peshawar), (Lahore), or (City))
    // Replace the first city parenthesis with (${targetCity}) and strip any subsequent duplicate city parentheses
    let result = '';
    let lastIndex = 0;

    for (let i = 0; i < cityMatches.length; i++) {
      const cm = cityMatches[i];
      if (cm.index < 0) continue;

      result += trimmed.slice(lastIndex, cm.index);
      if (i === 0) {
        // Replace first city match with targetCity
        result += `(${targetCity})`;
      } else {
        // Remove duplicate city match
      }
      lastIndex = cm.index + cm.match.length;
    }
    result += trimmed.slice(lastIndex);
    return result.replace(/\s{2,}/g, ' ').trim();
  }

  // If no city parenthesis was found:
  // Check if there is a trailing note / amount / suffix (e.g. " +1100", " +500", " 1100", " Paid", " [Paid]")
  const suffixMatch = trimmed.match(/\s+(\+\d+|\d+|Paid|VIP)$/i);
  if (suffixMatch && suffixMatch.index !== undefined) {
    const beforeSuffix = trimmed.slice(0, suffixMatch.index).trim();
    const suffix = suffixMatch[0].trim();
    return `${beforeSuffix} (${targetCity}) ${suffix}`;
  }

  return `${trimmed} (${targetCity})`;
}

/**
 * Formats or updates contact name according to specifications:
 * 1. User with Pending Status:
 *    AUPending {Name} ({City}) eg AUPending Ikram Raza (Lahore)
 *    (A = App, U = User role, Pending = Status; no expiry date needed)
 * 2. Trial (Active / Expired):
 *    ATYY/MM/DD {Name} ({City}) eg AT26/10/13 Ikram Raza (Lahore)
 *    Expired: Exd ATYY/MM/DD {Name} ({City}) eg Exd AT26/10/13 Ikram Raza (Lahore)
 * 3. Selected Content (Active / Expired):
 *    ASCYY/MM/DD {Name} ({City}) eg ASC26/10/13 Ikram Raza (Lahore)
 *    Expired: Exd ASCYY/MM/DD {Name} ({City}) eg Exd ASC26/10/13 Ikram Raza (Lahore)
 * 4. Content Manager (Active / Expired):
 *    ACMYY/MM/DD {Name} ({City}) eg ACM26/10/13 Ikram Raza (Lahore)
 *    Expired: Exd ACMYY/MM/DD {Name} ({City}) eg Exd ACM26/10/13 Ikram Raza (Lahore)
 * 5. User Manager (Active / Expired):
 *    AUMYY/MM/DD {Name} ({City}) eg AUM26/10/13 Ikram Raza (Lahore)
 *    Expired: Exd AUMYY/MM/DD {Name} ({City}) eg Exd AUM26/10/13 Ikram Raza (Lahore)
 * 6. Manager (Active / Expired):
 *    AMYY/MM/DD {Name} ({City}) eg AM26/10/13 Ikram Raza (Lahore)
 *    Expired: Exd AMYY/MM/DD {Name} ({City}) eg Exd AM26/10/13 Ikram Raza (Lahore)
 * 7. Admin / Owner (Active / Expired):
 *    AAYY/MM/DD {Name} ({City}) eg AA26/10/13 Ikram Raza (Lahore)
 *    Expired: Exd AAYY/MM/DD {Name} ({City}) eg Exd AA26/10/13 Ikram Raza (Lahore)
 * 8. VIP (Active / Expired):
 *    AVYY/MM/DD {Name} ({City}) eg AV26/10/13 Ikram Raza (Lahore)
 *    Expired: Exd AVYY/MM/DD {Name} ({City}) eg Exd AV26/10/13 Ikram Raza (Lahore)
 * 9. Basic (Active / Expired):
 *    ABYY/MM/DD {Name} ({City}) eg AB26/10/13 Ikram Raza (Lahore)
 *    Expired: Exd ABYY/MM/DD {Name} ({City}) eg Exd AB26/10/13 Ikram Raza (Lahore)
 * 10. User Role (Active / Expired):
 *    AUYY/MM/DD {Name} ({City}) eg AU26/10/13 Ikram Raza (Lahore)
 *    Expired: Exd AUYY/MM/DD {Name} ({City}) eg Exd AU26/10/13 Ikram Raza (Lahore)
 *
 * If city is missing:
 *    Save or update contact in name (city) eg AUPending Ahmad Ali (City)
 *
 * If existingContactName is provided:
 *    Replaces the status/prefix (AUPending / Exd / AT... / ASC... / ACM... / AUM... / AM... / AA... / AV... / AB... / AU...),
 *    preserves/cleans {Name}, and updates the parenthesized ({City}) part without duplicating.
 */
export function formatContactName(user: UserProfile, existingContactName?: string | null): string {
  const roleLower = (user.role || '').toLowerCase().replace(/[-\s]/g, '_');
  const isVip = roleLower === 'vip';
  const isBasic = roleLower === 'basic';
  const isTrial = roleLower === 'trial';
  const isSelectedContent = roleLower === 'selected_content';
  const isContentManager = roleLower === 'content_manager';
  const isUserManager = roleLower === 'user_manager';
  const isManager = roleLower === 'manager';
  const isAdminOrOwner = roleLower === 'admin' || roleLower === 'owner';
  const isUserRole = !isVip && !isBasic && !isTrial && !isSelectedContent && !isContentManager && !isUserManager && !isManager && !isAdminOrOwner;

  // User (Role) with Pending Status: AUPending [Name] ([City])
  // A = App, U = User (Role), Pending = Status (no expiry date needed because of pending status)
  const isPending = isUserRole && (user.status === 'pending' || !user.status);

  let newPrefix = '';
  if (isPending) {
    newPrefix = 'AUPending';
  } else {
    let prefixCode = 'AU';
    if (isVip) {
      prefixCode = 'AV';
    } else if (isBasic) {
      prefixCode = 'AB';
    } else if (isTrial) {
      prefixCode = 'AT';
    } else if (isSelectedContent) {
      prefixCode = 'ASC';
    } else if (isContentManager) {
      prefixCode = 'ACM';
    } else if (isUserManager) {
      prefixCode = 'AUM';
    } else if (isManager) {
      prefixCode = 'AM';
    } else if (isAdminOrOwner) {
      prefixCode = 'AA';
    }

    const expired = user.status === 'expired' || (!!user.expiryDate && user.expiryDate !== 'Lifetime' && isUserExpired(user.expiryDate));
    const statusPrefix = expired ? 'Exd ' : '';

    // Format expiry date as YY/MM/DD
    let datePart = '26/12/31';
    if (user.expiryDate) {
      if (user.expiryDate === 'Lifetime') {
        datePart = '99/12/31';
      } else {
        const dateOnlyStr = user.expiryDate.split('T')[0].trim();
        const parts = dateOnlyStr.split('-');
        if (parts.length === 3) {
          const yy = parts[0].slice(-2);
          const mm = parts[1].padStart(2, '0');
          const dd = parts[2].padStart(2, '0');
          datePart = `${yy}/${mm}/${dd}`;
        } else {
          const d = new Date(user.expiryDate);
          if (!isNaN(d.getTime())) {
            const yy = String(d.getUTCFullYear()).slice(-2);
            const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(d.getUTCDate()).padStart(2, '0');
            datePart = `${yy}/${mm}/${dd}`;
          }
        }
      }
    } else {
      // Default to 30 days from now
      const d = new Date();
      d.setDate(d.getDate() + 30);
      const yy = String(d.getFullYear()).slice(-2);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      datePart = `${yy}/${mm}/${dd}`;
    }

    newPrefix = `${statusPrefix}${prefixCode}${datePart}`;
  }

  // Recognize city:
  // 1. From user profile
  const rawCity = user.city?.trim();
  let validCity: string | null = (rawCity && rawCity.toLowerCase() !== 'city') ? rawCity : null;

  // 2. If user profile has no city, try extracting from existingContactName
  if (!validCity) {
    const cityFromExisting = extractCityFromContactName(existingContactName);
    if (cityFromExisting && cityFromExisting.toLowerCase() !== 'city') {
      validCity = cityFromExisting;
    }
  }

  // 3. If still no city, try extracting from user displayName (e.g. "Muhammad Khalid Khan (Peshawar)")
  if (!validCity) {
    const cityFromDisplay = extractCityFromContactName(user.displayName);
    if (cityFromDisplay && cityFromDisplay.toLowerCase() !== 'city') {
      validCity = cityFromDisplay;
    }
  }

  const targetCity = validCity || 'City';

  // Matches status prefix (Exd ), tier code (AT/ASC/ACM/AUM/AM/AA/AV/AB/AU), date (YY/MM/DD), or AUPending / Pending keywords
  const prefixRegex = /^(?:(?:Exd|EXD|exd)\s+)?(?:AUPending|ABPending|AVPending|ATPending|ASCPending|ACMPending|AUMPending|AMPending|AAPending|(?:[A-Za-z]{2,4})?\s*(?:\d{2,4}[\/\.-]\d{2}[\/\.-]\d{2,4}|Pending))\s*/i;

  let baseName = '';
  if (existingContactName && existingContactName.trim()) {
    baseName = existingContactName.trim().replace(prefixRegex, '').trim();
  }

  if (!baseName) {
    const fallbackDisplayName = user.displayName?.trim() || user.email?.split('@')[0] || (user.phone ? `User (${user.phone.trim()})` : 'User');
    baseName = fallbackDisplayName.replace(prefixRegex, '').trim();
  }

  const formattedRest = formatNameWithCity(baseName, targetCity);
  return `${newPrefix} ${formattedRest}`;
}

/**
 * Saves Google Contacts OAuth token details to Firestore and localStorage for persistence across sessions, tabs, and devices.
 */
export async function saveContactsTokenToFirestore(accessToken: string, expiry: string | number, email: string): Promise<void> {
  const expiryNum = typeof expiry === 'string' ? parseInt(expiry, 10) : expiry;
  
  // Cache in localStorage for immediate client-side availability
  try {
    localStorage.setItem(STORAGE_TOKEN_KEY, accessToken);
    localStorage.setItem(STORAGE_EXPIRY_KEY, String(expiryNum));
    localStorage.setItem(STORAGE_EMAIL_KEY, email);
    localStorage.setItem(STORAGE_AUTHORIZED_KEY, 'true');
    // Also set sessionStorage for legacy compatibility
    sessionStorage.setItem(STORAGE_TOKEN_KEY, accessToken);
    sessionStorage.setItem(STORAGE_EXPIRY_KEY, String(expiryNum));
    sessionStorage.setItem(STORAGE_EMAIL_KEY, email);
  } catch (e) {
    console.warn('[Google Contacts] LocalStorage write error:', e);
  }

  try {
    const docRef = doc(db, 'settings', 'google_contacts');
    await setDoc(docRef, {
      accessToken,
      expiry: expiryNum,
      email,
      isAuthorized: true,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log('[Google Contacts] Token and authorization state permanently saved to Firestore');
  } catch (err) {
    console.warn('[Google Contacts] Error saving token to Firestore:', err);
  }
}

/**
 * Attempts to silently refresh the Google Contacts OAuth access token in the background.
 * In Google Identity Services (GIS), tokenClient.requestAccessToken always triggers a browser popup window.
 * To strictly prevent unprompted popups when navigating tabs, automated background GIS requests are disabled.
 * Re-authentication occurs via user-initiated actions (clicking Connect, Re-verify, or Sync).
 */
export async function refreshContactsTokenSilently(_accountEmail?: string): Promise<{ accessToken: string; email: string } | null> {
  // Silent GIS token acquisition without a user gesture triggers unwanted browser popups or is blocked.
  // Return null to prevent opening unprompted popups.
  return null;
}

/**
 * Ensures a valid Google Contacts access token is available.
 * 1. Checks localStorage with a safety buffer.
 * 2. Checks Firestore document `settings/google_contacts` (syncs tokens across all tabs/browsers).
 * 3. In non-interactive mode (forceInteractiveIfFailed = false): NEVER opens a popup window.
 *    Returns the cached/stored token and authorization state directly.
 * 4. Only if forceInteractiveIfFailed is true (explicit user click) and token is invalid/expired,
 *    initiates an interactive Google connection popup.
 */
export async function ensureValidContactsToken(forceInteractiveIfFailed = false): Promise<{ accessToken: string | null; email: string | null }> {
  const BUFFER_MS = 2 * 60 * 1000; // 2 minutes buffer before token expires
  const now = Date.now();

  // 1. Check localStorage first
  const localToken = localStorage.getItem(STORAGE_TOKEN_KEY) || sessionStorage.getItem(STORAGE_TOKEN_KEY);
  const localExpiryStr = localStorage.getItem(STORAGE_EXPIRY_KEY) || sessionStorage.getItem(STORAGE_EXPIRY_KEY);
  const localEmail = localStorage.getItem(STORAGE_EMAIL_KEY) || sessionStorage.getItem(STORAGE_EMAIL_KEY);
  const isAuthorizedLocal = localStorage.getItem(STORAGE_AUTHORIZED_KEY) === 'true';

  if (localToken && localExpiryStr) {
    const localExpiry = parseInt(localExpiryStr, 10);
    if (!isNaN(localExpiry) && now < (localExpiry - BUFFER_MS)) {
      return { accessToken: localToken, email: localEmail || 'wmoviznow@gmail.com' };
    }
  }

  // 2. Check Firestore `settings/google_contacts`
  let firestoreAuthData: any = null;
  try {
    const docRef = doc(db, 'settings', 'google_contacts');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      firestoreAuthData = docSnap.data();
      const fToken = firestoreAuthData.accessToken;
      const fExpiry = parseInt(String(firestoreAuthData.expiry || 0), 10);
      const fEmail = firestoreAuthData.email || localEmail || 'wmoviznow@gmail.com';
      const isAuthInDb = firestoreAuthData.isAuthorized !== false && (!!fToken || !!fEmail);

      if (fToken && !isNaN(fExpiry) && now < (fExpiry - BUFFER_MS) && isAuthInDb) {
        // Cache valid token from Firestore to localStorage
        try {
          localStorage.setItem(STORAGE_TOKEN_KEY, fToken);
          localStorage.setItem(STORAGE_EXPIRY_KEY, String(fExpiry));
          localStorage.setItem(STORAGE_EMAIL_KEY, fEmail);
          localStorage.setItem(STORAGE_AUTHORIZED_KEY, 'true');
        } catch (e) {}
        return { accessToken: fToken, email: fEmail };
      } else if (firestoreAuthData?.refreshToken) {
        // Method 1: Refresh token is available! Call server to refresh the token.
        try {
          console.log('[Google Contacts] Token expired. Requesting server-side refresh...');
          const refreshRes = await fetch('/api/orders/refresh-contacts-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          if (refreshRes.ok) {
            const rData = await refreshRes.json();
            if (rData.success && rData.accessToken) {
              const newExpiry = rData.expiry;
              const newEmail = rData.email || fEmail;
              
              try {
                localStorage.setItem(STORAGE_TOKEN_KEY, rData.accessToken);
                localStorage.setItem(STORAGE_EXPIRY_KEY, String(newExpiry));
                localStorage.setItem(STORAGE_EMAIL_KEY, newEmail);
                localStorage.setItem(STORAGE_AUTHORIZED_KEY, 'true');
              } catch (e) {}
              
              return { accessToken: rData.accessToken, email: newEmail };
            }
          }
        } catch (refErr) {
          console.warn('[Google Contacts] Failed server-side refresh attempt:', refErr);
        }
      }
    }
  } catch (err) {
    console.warn('[Google Contacts] Error reading Firestore token:', err);
  }

  const savedEmail = firestoreAuthData?.email || localEmail || 'wmoviznow@gmail.com';
  const wasAuthorized = isAuthorizedLocal || firestoreAuthData?.isAuthorized === true || !!firestoreAuthData?.accessToken;
  const fallbackToken = localToken || firestoreAuthData?.accessToken;

  // 3. In non-interactive mode (tab open, mount, background checks):
  // NEVER open a Google popup window! Return existing token and authorization info.
  if (!forceInteractiveIfFailed) {
    if (fallbackToken && wasAuthorized) {
      return { accessToken: fallbackToken, email: savedEmail };
    }
    return { accessToken: null, email: wasAuthorized ? savedEmail : null };
  }

  // 4. Only if user explicitly clicked an action (forceInteractiveIfFailed === true):
  try {
    const conn = await connectGoogleContacts(savedEmail || 'wmoviznow@gmail.com', false);
    return { accessToken: conn.accessToken, email: conn.email };
  } catch (err) {
    console.warn('[Google Contacts] Interactive connect attempt failed:', err);
  }

  // 5. Fallback: if we have an existing token from Firestore or localStorage, return it
  if (fallbackToken && wasAuthorized) {
    return { accessToken: fallbackToken, email: savedEmail };
  }

  return { accessToken: null, email: savedEmail || null };
}

/**
 * Loads and verifies the Google Contacts token, checking localStorage, Firestore, and auto-renewing silently if needed.
 */
export async function loadAndVerifyStoredContactsToken(): Promise<{ accessToken: string | null; email: string | null }> {
  return ensureValidContactsToken(false);
}

/**
 * Gets cached Google Contacts access token if available in localStorage or sessionStorage.
 */
export function getStoredContactsToken(): string | null {
  const token = localStorage.getItem(STORAGE_TOKEN_KEY) || sessionStorage.getItem(STORAGE_TOKEN_KEY);
  return token || null;
}

/**
 * Gets email of connected Google Contacts account.
 */
export function getConnectedAccountEmail(): string | null {
  return localStorage.getItem(STORAGE_EMAIL_KEY) || sessionStorage.getItem(STORAGE_EMAIL_KEY) || null;
}

/**
 * Returns true if Google Contacts has been authorized.
 */
export function isGoogleContactsAuthorized(): boolean {
  if (localStorage.getItem(STORAGE_AUTHORIZED_KEY) === 'false') return false;
  return (
    localStorage.getItem(STORAGE_AUTHORIZED_KEY) === 'true' ||
    !!localStorage.getItem(STORAGE_TOKEN_KEY) ||
    !!sessionStorage.getItem(STORAGE_TOKEN_KEY)
  );
}

/**
 * Connects to Google Contacts via GIS Token Client and persists credentials to Firestore & localStorage.
 * Does NOT force consent dialog if user already consented.
 */
export async function connectGoogleContacts(
  accountHint: string = 'wmoviznow@gmail.com',
  forceConsent: boolean = false
): Promise<{ accessToken: string; email: string }> {
  const clientId = (firebaseConfig as any).oAuthClientId;
  if (!clientId) {
    throw new Error('OAuth Client ID is missing in configuration.');
  }

  await loadGoogleGsiScript();

  return new Promise((resolve, reject) => {
    try {
      const googleObj = (window as any).google;
      if (!googleObj?.accounts?.oauth2) {
        reject(new Error('Google Identity Services SDK is not available.'));
        return;
      }

      const tokenClient = googleObj.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: CONTACTS_SCOPE,
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            reject(new Error(tokenResponse.error_description || tokenResponse.error));
            return;
          }

          const accessToken = tokenResponse.access_token;
          if (!accessToken) {
            reject(new Error('Could not retrieve access token for Google Contacts.'));
            return;
          }

          // Fetch connected Google Account info if possible
          let email = accountHint;
          try {
            const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (userinfoRes.ok) {
              const uinfo = await userinfoRes.json();
              if (uinfo.email) email = uinfo.email;
            }
          } catch (e) {
            console.warn('Could not fetch userinfo for contacts account email:', e);
          }

          const expiresIn = parseInt(tokenResponse.expires_in || '3500', 10);
          const expiry = (Date.now() + (expiresIn - 60) * 1000).toString();

          // Permanently save to Firestore and localStorage
          await saveContactsTokenToFirestore(accessToken, expiry, email);

          resolve({ accessToken, email });
        },
        error_callback: (err: any) => {
          reject(new Error(err?.message || 'Google Contacts authorization popup closed or cancelled.'));
        }
      });

      const requestOptions: any = { hint: accountHint };
      if (forceConsent) {
        requestOptions.prompt = 'consent';
      }
      tokenClient.requestAccessToken(requestOptions);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Disconnects Google Contacts session and removes stored credentials from Firestore and localStorage.
 */
export function disconnectGoogleContacts(): void {
  try {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_EXPIRY_KEY);
    localStorage.removeItem(STORAGE_EMAIL_KEY);
    localStorage.setItem(STORAGE_AUTHORIZED_KEY, 'false');
    sessionStorage.removeItem(STORAGE_TOKEN_KEY);
    sessionStorage.removeItem(STORAGE_EXPIRY_KEY);
    sessionStorage.removeItem(STORAGE_EMAIL_KEY);
  } catch (e) {}

  // Update Firestore document to indicate deauthorization
  const docRef = doc(db, 'settings', 'google_contacts');
  setDoc(docRef, {
    isAuthorized: false,
    accessToken: '',
    expiry: 0,
    email: '',
    updatedAt: new Date().toISOString()
  }, { merge: true }).catch(err => {
    console.warn('[Google Contacts] Error updating deauthorization in Firestore:', err);
  });
}

export interface GoogleContactPerson {
  resourceName: string;
  etag: string;
  names?: Array<{ givenName?: string; displayName?: string; familyName?: string; middleName?: string }>;
  phoneNumbers?: Array<{ value?: string; canonicalForm?: string }>;
  emailAddresses?: Array<{ value?: string }>;
  birthdays?: Array<{ date?: { year?: number; month?: number; day?: number }; text?: string }>;
  biographies?: Array<{ value?: string; contentType?: string }>;
  userDefined?: Array<{ key?: string; value?: string }>;
  memberships?: Array<{ contactGroupMembership?: { contactGroupResourceName?: string } }>;
}

/**
 * Fetches connections list from Google People API.
 */
export async function fetchAllGoogleContacts(accessToken: string): Promise<GoogleContactPerson[]> {
  const contacts: GoogleContactPerson[] = [];
  let pageToken: string | undefined = undefined;

  try {
    do {
      let url = 'https://people.googleapis.com/v1/people/me/connections?personFields=names,phoneNumbers,emailAddresses,birthdays,biographies,userDefined,memberships&pageSize=1000';
      if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      let res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (res.status === 401) {
        console.warn('[Google Contacts] 401 Unauthorized in fetchAllGoogleContacts. Token may be expired. Please re-authenticate via the Contacts button.');
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Google Contacts API error (${res.status}): ${errText}`);
      }

      const data = await res.json();
      if (data.connections && Array.isArray(data.connections)) {
        contacts.push(...data.connections);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  } catch (err) {
    console.error('Error fetching Google Contacts:', err);
    throw err;
  }

  return contacts;
}

/**
 * Checks if a user's phone number matches any phone number stored in a Google Contact person object.
 */
export function isPhoneMatch(
  userPhone: string | null | undefined,
  person: GoogleContactPerson
): boolean {
  if (!userPhone || !person || !person.phoneNumbers || person.phoneNumbers.length === 0) {
    return false;
  }

  const { normalized: targetNorm, matchKey: targetMatchKey } = normalizePhone(userPhone);
  const targetDigits = convertToAsciiDigits(userPhone).replace(/\D/g, '');
  if (!targetDigits) return false;

  const targetLast10 = targetDigits.length >= 10 ? targetDigits.slice(-10) : '';
  const targetLast9 = targetDigits.length >= 9 ? targetDigits.slice(-9) : '';

  for (const p of person.phoneNumbers) {
    const val = p.value || p.canonicalForm || '';
    if (!val) continue;

    const { normalized: contactNorm, matchKey: contactMatchKey } = normalizePhone(val);
    const contactDigits = convertToAsciiDigits(val).replace(/\D/g, '');
    if (!contactDigits) continue;

    // 1. Direct normalized match (+923001234567 === +923001234567)
    if (targetNorm && contactNorm && targetNorm === contactNorm) {
      return true;
    }

    // 2. Core match key match (e.g. 3001234567 === 3001234567)
    if (targetMatchKey && contactMatchKey && targetMatchKey === contactMatchKey) {
      return true;
    }

    // 3. Last 10 digits match (3001234567)
    if (targetLast10 && contactDigits.length >= 10 && targetLast10 === contactDigits.slice(-10)) {
      return true;
    }

    // 4. Last 9 digits match (001234567)
    if (targetLast9 && contactDigits.length >= 9 && targetLast9 === contactDigits.slice(-9)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a user's email matches any email in a Google Contact person.
 */
export function isEmailMatch(userEmail: string | undefined, person: GoogleContactPerson): boolean {
  if (!userEmail || !person.emailAddresses || person.emailAddresses.length === 0) return false;
  const target = userEmail.trim().toLowerCase();
  if (!target || !target.includes('@') || target.endsWith('@moviznow.com')) return false;
  return person.emailAddresses.some(e => e.value && e.value.trim().toLowerCase() === target);
}

/**
 * Searches Google Contacts directly via Google People API search endpoint using email query.
 */
export async function searchGoogleContactsByEmail(
  emailStr: string,
  accessToken: string
): Promise<GoogleContactPerson | null> {
  const cleanEmail = emailStr.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@') || cleanEmail.endsWith('@moviznow.com')) return null;

  try {
    const url = `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(cleanEmail)}&readMask=names,phoneNumbers,emailAddresses,birthdays,biographies,userDefined,memberships&pageSize=10`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.results && Array.isArray(data.results)) {
      for (const item of data.results) {
        if (item.person && isEmailMatch(cleanEmail, item.person)) {
          return item.person;
        }
      }
    }
  } catch (e) {
    console.warn('searchGoogleContactsByEmail error:', e);
  }
  return null;
}

/**
 * Searches Google Contacts directly via Google People API search endpoint using phone number query.
 */
export async function searchGoogleContactsByPhone(
  phoneStr: string,
  accessToken: string
): Promise<GoogleContactPerson | null> {
  const { matchKey, normalized } = normalizePhone(phoneStr);
  const digits = convertToAsciiDigits(phoneStr).replace(/\D/g, '');
  const queryTerm = matchKey || normalized || digits;
  if (!queryTerm || queryTerm.length < 5) return null;

  try {
    const url = `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(queryTerm)}&readMask=names,phoneNumbers,emailAddresses,birthdays,biographies,userDefined,memberships&pageSize=10`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.results && Array.isArray(data.results)) {
      for (const item of data.results) {
        if (item.person && isPhoneMatch(phoneStr, item.person)) {
          return item.person;
        }
      }
    }
  } catch (e) {
    console.warn('searchGoogleContactsByPhone error:', e);
  }
  return null;
}

/**
 * Finds a contact in Google Contacts list strictly matching a user's phone number or email address.
 */
export function findMatchingContact(
  user: { phone?: string; email?: string; displayName?: string },
  connectionsList: GoogleContactPerson[] = []
): GoogleContactPerson | null {
  if (!connectionsList || connectionsList.length === 0) return null;

  // 1. Primary: Match by phone number
  if (user.phone) {
    for (const person of connectionsList) {
      if (isPhoneMatch(user.phone, person)) {
        return person;
      }
    }
  }

  // 2. Secondary: Match by email address (if not default dummy @moviznow.com)
  if (user.email && user.email.includes('@') && !user.email.endsWith('@moviznow.com')) {
    for (const person of connectionsList) {
      if (isEmailMatch(user.email, person)) {
        return person;
      }
    }
  }

  return null;
}

/**
 * Syncs a single user to Google Contacts.
 * Checks by phone number or email. If found, updates the contact's name with the new formatted name prefix.
 * If not found, creates a new contact.
 */
export async function syncSingleUserContact(
  user: UserProfile,
  accessToken: string,
  cachedConnections?: GoogleContactPerson[]
): Promise<{
  success: boolean;
  created: boolean;
  updated: boolean;
  photoUpdated?: boolean;
  contactName: string;
  phoneUsed: string;
  error?: string;
  isTokenError?: boolean;
}> {
  if (!user.phone && !user.email) {
    return {
      success: false,
      created: false,
      updated: false,
      contactName: '',
      phoneUsed: '',
      error: 'User has no phone or email address'
    };
  }

  let normalized = '';
  if (user.phone) {
    const { normalized: norm } = normalizePhone(user.phone);
    normalized = norm;
  }

  if (!normalized && (!user.email || user.email.endsWith('@moviznow.com'))) {
    return {
      success: false,
      created: false,
      updated: false,
      contactName: '',
      phoneUsed: user.phone || '',
      error: 'Invalid phone number format and no valid email address'
    };
  }

  const formattedName = formatContactName(user);
  const nameForAvatar = user.displayName || user.email || user.phone || '';
  const photoToUpload = user.photoURL && user.photoURL.trim() !== ''
    ? user.photoURL.trim()
    : nameForAvatar
      ? `https://ui-avatars.com/api/?name=${encodeURIComponent(nameForAvatar.trim())}&background=random&size=500`
      : undefined;

  try {
    let connections = cachedConnections;
    if (!connections) {
      connections = await fetchAllGoogleContacts(accessToken);
    }

    // 1. Check in fetched connections list by phone or email
    let existingPerson = findMatchingContact(user, connections);

    // 2. Fallback: Search directly via Google Contacts API if not found in top connections list
    if (!existingPerson) {
      if (user.phone) {
        existingPerson = await searchGoogleContactsByPhone(user.phone, accessToken);
      }
      if (!existingPerson && user.email) {
        existingPerson = await searchGoogleContactsByEmail(user.email, accessToken);
      }
    }

    if (existingPerson) {
      let existingDisplayName: string | null = null;
      if (existingPerson.names && existingPerson.names.length > 0) {
        const primaryName = existingPerson.names[0];
        const combined = [primaryName.givenName, primaryName.familyName]
          .filter(Boolean)
          .join(' ')
          .trim();
        existingDisplayName = primaryName.displayName || combined || primaryName.givenName || null;
      }

      // Fetch latest person data & etag to ensure updateContact call succeeds
      let currentEtag = existingPerson.etag;
      let phoneNumbersToUse = existingPerson.phoneNumbers && existingPerson.phoneNumbers.length > 0
        ? existingPerson.phoneNumbers
        : [{ value: normalized }];
      let emailAddressesToUse = existingPerson.emailAddresses || [];
      let birthdaysToUse = existingPerson.birthdays || [];
      let extractedEmail: string | undefined = undefined;
      let extractedDob: string | undefined = undefined;
      let extractedCity: string | undefined = undefined;

      if (existingDisplayName) {
        const detectedCity = extractCityFromContactName(existingDisplayName);
        if (detectedCity && detectedCity.toLowerCase() !== 'city') {
          extractedCity = detectedCity;
        }
      }

      try {
        const fetchRes = await fetch(`https://people.googleapis.com/v1/${existingPerson.resourceName}?personFields=names,phoneNumbers,emailAddresses,birthdays,biographies,userDefined,memberships`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (fetchRes.ok) {
          const fetchedPerson = await fetchRes.json();
          if (fetchedPerson.etag) {
            currentEtag = fetchedPerson.etag;
            existingPerson.etag = currentEtag;
          }
          if (fetchedPerson.names && fetchedPerson.names.length > 0) {
            existingPerson.names = fetchedPerson.names;
            const primaryName = fetchedPerson.names[0];
            const combined = [primaryName.givenName, primaryName.familyName]
              .filter(Boolean)
              .join(' ')
              .trim();
            existingDisplayName = primaryName.displayName || combined || primaryName.givenName || existingDisplayName;
            if (existingDisplayName && !extractedCity) {
              const detectedCity = extractCityFromContactName(existingDisplayName);
              if (detectedCity && detectedCity.toLowerCase() !== 'city') {
                extractedCity = detectedCity;
              }
            }
          }
          if (fetchedPerson.phoneNumbers && fetchedPerson.phoneNumbers.length > 0) {
            phoneNumbersToUse = fetchedPerson.phoneNumbers;
            existingPerson.phoneNumbers = fetchedPerson.phoneNumbers;
          }
          if (fetchedPerson.emailAddresses && fetchedPerson.emailAddresses.length > 0) {
            emailAddressesToUse = fetchedPerson.emailAddresses;
            existingPerson.emailAddresses = fetchedPerson.emailAddresses;
          }
          if (fetchedPerson.birthdays && fetchedPerson.birthdays.length > 0) {
            birthdaysToUse = fetchedPerson.birthdays;
            existingPerson.birthdays = fetchedPerson.birthdays;
          }
        }
      } catch (e) {
        console.warn('Could not fetch latest details for contact update:', e);
      }

      // 1. Email sync & missing data detection
      if (user.email && user.email.trim()) {
        emailAddressesToUse = [{ value: user.email.trim() }];
      } else if (emailAddressesToUse.length > 0 && emailAddressesToUse[0].value) {
        extractedEmail = emailAddressesToUse[0].value.trim();
      }

      // 2. DOB sync & missing data detection
      const userDobObj = parseDobToGoogleDate(user.dob);
      if (userDobObj) {
        birthdaysToUse = [{ date: userDobObj }];
      } else if (birthdaysToUse.length > 0) {
        extractedDob = extractDobFromGoogleContact(birthdaysToUse);
      }

      // 3. Label / Group Membership "Modified by MovizNow" + Preserve "contactGroups/myContacts"
      const modifiedGroupId = await getOrCreateContactGroup('Modified by MovizNow', accessToken);
      let existingMemberships: any[] = existingPerson.memberships || [];
      let membershipsToUse: any[] = existingMemberships.filter((m: any) => m && m.contactGroupMembership);

      // Ensure 'contactGroups/myContacts' is present so contact stays in main Contacts list
      const hasMyContacts = membershipsToUse.some(
        (m: any) => m.contactGroupMembership?.contactGroupResourceName === 'contactGroups/myContacts'
      );
      if (!hasMyContacts) {
        membershipsToUse.push({
          contactGroupMembership: { contactGroupResourceName: 'contactGroups/myContacts' }
        });
      }

      if (modifiedGroupId) {
        const hasModifiedGroup = membershipsToUse.some(
          (m: any) => m.contactGroupMembership?.contactGroupResourceName === modifiedGroupId
        );
        if (!hasModifiedGroup) {
          membershipsToUse.push({
            contactGroupMembership: { contactGroupResourceName: modifiedGroupId }
          });
        }
      }

      // Update existing contact - REPLACE prefix date/status while keeping rest of name ({Name} ({City}) ...) untouched
      const formattedName = formatContactName(user, existingDisplayName);
      const newNameObj = {
        givenName: formattedName,
        familyName: '',
        middleName: ''
      };

      const updateFields = ['names', 'phoneNumbers', 'emailAddresses', 'birthdays', 'memberships'];

      const updateUrl = `https://people.googleapis.com/v1/${existingPerson.resourceName}:updateContact?updatePersonFields=${updateFields.join(',')}`;
      const updateBody: any = {
        resourceName: existingPerson.resourceName,
        etag: currentEtag || '*',
        names: [newNameObj],
        phoneNumbers: phoneNumbersToUse,
        emailAddresses: emailAddressesToUse,
        birthdays: birthdaysToUse,
        memberships: membershipsToUse
      };

      let res = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateBody)
      });

      if (res.status === 401) {
        console.warn('[Google Contacts] 401 Unauthorized in updateContact. Token may be expired.');
        return {
          success: false,
          created: false,
          updated: false,
          contactName: formattedName,
          phoneUsed: normalized,
          isTokenError: true,
          error: '401 Unauthorized: Google Contacts token is expired or invalid'
        };
      }

      // Fallback if update fails: retry with basic updateFields
      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 401 || errText.includes('401') || errText.includes('UNAUTHENTICATED') || errText.includes('invalid_grant')) {
          return {
            success: false,
            created: false,
            updated: false,
            contactName: formattedName,
            phoneUsed: normalized,
            isTokenError: true,
            error: 'Google Contacts authentication expired'
          };
        }
        console.warn(`Primary contact update failed for ${existingPerson.resourceName} (${res.status}): ${errText}. Retrying update...`);

        const fallbackUrl = `https://people.googleapis.com/v1/${existingPerson.resourceName}:updateContact?updatePersonFields=names,phoneNumbers,emailAddresses,birthdays`;
        const fallbackBody: any = {
          resourceName: existingPerson.resourceName,
          etag: '*',
          names: [newNameObj],
          phoneNumbers: phoneNumbersToUse,
          emailAddresses: emailAddressesToUse,
          birthdays: birthdaysToUse
        };

        res = await fetch(fallbackUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(fallbackBody)
        });

        if (!res.ok) {
          const fallbackErr = await res.text();
          const isTok = res.status === 401 || fallbackErr.includes('401') || fallbackErr.includes('UNAUTHENTICATED') || fallbackErr.includes('invalid_grant');
          return {
            success: false,
            created: false,
            updated: false,
            contactName: formattedName,
            phoneUsed: normalized,
            isTokenError: isTok,
            error: `Failed to replace contact name & details: ${fallbackErr}`
          };
        }
      }

      const updatedPersonData = await res.json().catch(() => null);
      if (updatedPersonData) {
        existingPerson.etag = updatedPersonData.etag || existingPerson.etag;
        existingPerson.names = updatedPersonData.names || [{ givenName: formattedName, familyName: '', displayName: formattedName }];
        existingPerson.phoneNumbers = updatedPersonData.phoneNumbers || phoneNumbersToUse;
        existingPerson.emailAddresses = updatedPersonData.emailAddresses || emailAddressesToUse;
        existingPerson.birthdays = updatedPersonData.birthdays || birthdaysToUse;
      } else {
        existingPerson.names = [{ givenName: formattedName, familyName: '', displayName: formattedName }];
      }

      // Backfill missing user profile data in Firestore if found in Google Contacts
      if (user.uid && (extractedEmail || extractedDob || extractedCity)) {
        const missingUpdates: Record<string, any> = {};
        if (extractedEmail && (!user.email || user.email.trim() === '')) {
          missingUpdates.email = extractedEmail;
        }
        if (extractedDob && (!user.dob || user.dob.trim() === '')) {
          missingUpdates.dob = extractedDob;
        }
        if (extractedCity && extractedCity.toLowerCase() !== 'city' && (!user.city || user.city.trim() === '')) {
          missingUpdates.city = extractedCity;
        }
        if (Object.keys(missingUpdates).length > 0) {
          try {
            await updateDoc(doc(db, 'users', user.uid), missingUpdates);
            console.log(`[Google Contacts Sync] Backfilled user profile for ${user.uid} in Firestore:`, missingUpdates);
          } catch (e) {
            console.warn(`[Google Contacts Sync] Could not backfill profile for ${user.uid}:`, e);
          }
        }
      }

      // Sync profile picture if available
      let photoUpdated = false;
      if (photoToUpload && existingPerson.resourceName) {
        try {
          const photoRes = await updateGoogleContactPhoto(existingPerson.resourceName, photoToUpload, accessToken);
          photoUpdated = !!photoRes?.success;
        } catch (e) {
          console.warn(`[Google Contacts Sync] Could not sync photo for ${existingPerson.resourceName}:`, e);
        }
      }

      return {
        success: true,
        created: false,
        updated: true,
        photoUpdated,
        contactName: formattedName,
        phoneUsed: normalized
      };
    } else {
      // Create new contact with "Created by MovizNow" label
      const createdGroupId = await getOrCreateContactGroup('Created by MovizNow', accessToken);
      const createUrl = 'https://people.googleapis.com/v1/people:createContact';
      const userDobObj = parseDobToGoogleDate(user.dob);

      const createBody: any = {
        names: [{ givenName: formattedName, familyName: '', middleName: '' }],
        phoneNumbers: normalized ? [{ value: normalized }] : []
      };

      if (user.email && user.email.trim()) {
        createBody.emailAddresses = [{ value: user.email.trim() }];
      }

      if (userDobObj) {
        createBody.birthdays = [{ date: userDobObj }];
      }

      const membershipsForCreate: any[] = [
        { contactGroupMembership: { contactGroupResourceName: 'contactGroups/myContacts' } }
      ];
      if (createdGroupId) {
        membershipsForCreate.push({
          contactGroupMembership: { contactGroupResourceName: createdGroupId }
        });
      }
      createBody.memberships = membershipsForCreate;

      let res = await fetch(createUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(createBody)
      });

      if (res.status === 401) {
        console.warn('[Google Contacts] 401 Unauthorized in createContact. Token may be expired.');
        return {
          success: false,
          created: false,
          updated: false,
          contactName: formattedName,
          phoneUsed: normalized,
          isTokenError: true,
          error: '401 Unauthorized: Google Contacts token is expired or invalid'
        };
      }

      // Fallback if creating with memberships fails: create without memberships
      if (!res.ok) {
        delete createBody.memberships;
        res = await fetch(createUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(createBody)
        });
      }

      if (!res.ok) {
        const errText = await res.text();
        const isTok = res.status === 401 || errText.includes('401') || errText.includes('UNAUTHENTICATED') || errText.includes('invalid_grant');
        return {
          success: false,
          created: false,
          updated: false,
          contactName: formattedName,
          phoneUsed: normalized,
          isTokenError: isTok,
          error: `Failed to create contact: ${errText}`
        };
      }

      const createdPerson = await res.json().catch(() => null);
      if (createdPerson && connections) {
        connections.push(createdPerson);
      }

      // Sync profile picture if available for newly created contact
      let photoUpdated = false;
      const createdResourceName = createdPerson?.resourceName;
      if (photoToUpload && createdResourceName) {
        try {
          const photoRes = await updateGoogleContactPhoto(createdResourceName, photoToUpload, accessToken);
          photoUpdated = !!photoRes?.success;
        } catch (e) {
          console.warn(`[Google Contacts Sync] Could not sync photo for new contact ${createdResourceName}:`, e);
        }
      }

      return {
        success: true,
        created: true,
        updated: false,
        photoUpdated,
        contactName: formattedName,
        phoneUsed: normalized
      };
    }
  } catch (err: any) {
    console.error(`Error syncing contact for user ${user.uid}:`, err);
    const errMsg = err?.message || String(err || '');
    const isTok = errMsg.includes('401') || errMsg.includes('UNAUTHENTICATED') || errMsg.includes('invalid_grant') || errMsg.includes('Invalid Credentials') || errMsg.includes('Token');
    return {
      success: false,
      created: false,
      updated: false,
      contactName: formattedName,
      phoneUsed: normalized,
      isTokenError: isTok,
      error: errMsg || 'Unknown error during Google Contacts API call'
    };
  }
}

export interface BatchSyncResult {
  total: number;
  synced: number;
  created: number;
  updated: number;
  unchanged: number;
  photosUpdated: number;
  failed: number;
  errors: string[];
}

export interface ContactComparisonItem {
  user: UserProfile;
  status: 'mismatch' | 'missing' | 'synced';
  googlePerson?: GoogleContactPerson;
  currentGoogleName: string;
  expectedTargetName: string;
  changeReason: string;
  oldPrefix: string;
  newPrefix: string;
  phone: string;
  normalizedPhone: string;
}

export interface ContactsComparisonReport {
  totalChecked: number;
  mismatches: ContactComparisonItem[];
  missing: ContactComparisonItem[];
  synced: ContactComparisonItem[];
}

/**
 * Executes a batch creation of contacts via Google People API (people:batchCreateContacts).
 * Accepts up to 200 contacts per call (recommended chunk size 50).
 */
export async function batchCreateGoogleContacts(
  contactsList: Array<{ contactPerson: any }>,
  accessToken: string
): Promise<{ success: boolean; createdCount: number; createdPeople: GoogleContactPerson[]; error?: string }> {
  if (!contactsList || contactsList.length === 0) {
    return { success: true, createdCount: 0, createdPeople: [] };
  }

  const endpoint = 'https://people.googleapis.com/v1/people:batchCreateContacts';
  const readMask = 'names,phoneNumbers,emailAddresses,birthdays,memberships';

  try {
    let res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contacts: contactsList,
        readMask
      })
    });

    if (res.status === 401) {
      throw new Error('401 Unauthorized: Google Contacts token is expired');
    }

    // Fallback: If creation fails with memberships error, strip memberships and retry
    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[Batch Create Contacts] Initial batch failed (${res.status}): ${errText}. Retrying without memberships...`);

      const cleanedList = contactsList.map(item => {
        const copy = { ...item.contactPerson };
        delete copy.memberships;
        return { contactPerson: copy };
      });

      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contacts: cleanedList,
          readMask: 'names,phoneNumbers,emailAddresses,birthdays'
        })
      });

      if (!res.ok) {
        const retryErr = await res.text();
        throw new Error(`Batch create failed: ${retryErr}`);
      }
    }

    const data = await res.json();
    const createdPeople: GoogleContactPerson[] = [];
    if (data.createdPeople && Array.isArray(data.createdPeople)) {
      for (const entry of data.createdPeople) {
        if (entry.person) {
          createdPeople.push(entry.person);
        }
      }
    }

    return {
      success: true,
      createdCount: createdPeople.length,
      createdPeople
    };
  } catch (err: any) {
    console.error('[Google Contacts Batch Create Error]:', err);
    return {
      success: false,
      createdCount: 0,
      createdPeople: [],
      error: err?.message || 'Failed batch create contacts'
    };
  }
}

/**
 * Executes a batch update of contacts via Google People API (people:batchUpdateContacts).
 * Accepts up to 200 contacts per call (recommended chunk size 50).
 */
export async function batchUpdateGoogleContacts(
  contactsMap: Record<string, any>,
  accessToken: string
): Promise<{ success: boolean; updatedCount: number; updatedPeople: GoogleContactPerson[]; error?: string }> {
  const resourceKeys = Object.keys(contactsMap);
  if (resourceKeys.length === 0) {
    return { success: true, updatedCount: 0, updatedPeople: [] };
  }

  const endpoint = 'https://people.googleapis.com/v1/people:batchUpdateContacts';
  const updateMask = 'names,phoneNumbers,emailAddresses,birthdays,memberships';
  const readMask = 'names,phoneNumbers,emailAddresses,birthdays,memberships';

  try {
    let res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contacts: contactsMap,
        updateMask,
        readMask
      })
    });

    if (res.status === 401) {
      throw new Error('401 Unauthorized: Google Contacts token is expired');
    }

    // Fallback: If update fails due to memberships, retry without memberships
    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[Batch Update Contacts] Initial batch failed (${res.status}): ${errText}. Retrying without memberships...`);

      const cleanedMap: Record<string, any> = {};
      for (const [key, val] of Object.entries(contactsMap)) {
        const copy = { ...val };
        delete copy.memberships;
        cleanedMap[key] = copy;
      }

      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contacts: cleanedMap,
          updateMask: 'names,phoneNumbers,emailAddresses,birthdays',
          readMask: 'names,phoneNumbers,emailAddresses,birthdays'
        })
      });

      if (!res.ok) {
        const retryErr = await res.text();
        throw new Error(`Batch update failed: ${retryErr}`);
      }
    }

    const data = await res.json();
    const updatedPeople: GoogleContactPerson[] = [];
    if (data.updateResult && typeof data.updateResult === 'object') {
      for (const [rName, entry] of Object.entries<any>(data.updateResult)) {
        if (entry.person) {
          updatedPeople.push(entry.person);
        }
      }
    }

    return {
      success: true,
      updatedCount: updatedPeople.length,
      updatedPeople
    };
  } catch (err: any) {
    console.error('[Google Contacts Batch Update Error]:', err);
    return {
      success: false,
      updatedCount: 0,
      updatedPeople: [],
      error: err?.message || 'Failed batch update contacts'
    };
  }
}

/**
 * Extracts prefix (e.g. AT26/10/13, Exd AT26/10/13, AV26/12/31, AUPending) from a contact name.
 */
export function extractContactPrefix(contactName: string): string {
  if (!contactName || !contactName.trim()) return '';
  const prefixRegex = /^(?:(?:Exd|EXD|exd)\s+)?(?:AUPending|ABPending|AVPending|ATPending|ASCPending|ACMPending|AUMPending|AMPending|AAPending|(?:[A-Za-z]{2,4})?\s*(?:\d{2,4}[\/\.-]\d{2}[\/\.-]\d{2,4}|Pending))\s*/i;
  const match = contactName.trim().match(prefixRegex);
  return match ? match[0].trim() : '';
}

/**
 * Compares system users against Google Contacts to detect:
 * 1. Missing users (not yet saved in Google Contacts).
 * 2. Format / Prefix mismatches (e.g., Trial upgraded to VIP where AT must be replaced with AV, Exd missing, or city updated).
 * 3. Already synced contacts.
 */
export async function compareUsersWithGoogleContacts(
  users: UserProfile[],
  accessToken: string,
  cachedConnections?: GoogleContactPerson[]
): Promise<ContactsComparisonReport> {
  let connections = cachedConnections;
  if (!connections) {
    connections = await fetchAllGoogleContacts(accessToken);
  }

  const mismatches: ContactComparisonItem[] = [];
  const missing: ContactComparisonItem[] = [];
  const synced: ContactComparisonItem[] = [];

  for (const user of users) {
    if (!user.phone && !user.email) continue;

    const { normalized } = normalizePhone(user.phone);
    const matchingPerson = findMatchingContact(user, connections);

    if (!matchingPerson) {
      // User is missing from Google Contacts
      const expectedTargetName = formatContactName(user);
      const newPrefix = extractContactPrefix(expectedTargetName);
      missing.push({
        user,
        status: 'missing',
        currentGoogleName: '(Not saved in Google Contacts)',
        expectedTargetName,
        changeReason: 'New contact: Not yet saved in Google Contacts',
        oldPrefix: '',
        newPrefix,
        phone: user.phone || '',
        normalizedPhone: normalized
      });
      continue;
    }

    // Contact found in Google Contacts
    let currentGoogleName = '';
    if (matchingPerson.names && matchingPerson.names.length > 0) {
      const p = matchingPerson.names[0];
      currentGoogleName = p.displayName || [p.givenName, p.familyName].filter(Boolean).join(' ') || p.givenName || '';
    }

    const expectedTargetName = formatContactName(user, currentGoogleName);
    const oldPrefix = extractContactPrefix(currentGoogleName);
    const newPrefix = extractContactPrefix(expectedTargetName);

    const isNameMatch = currentGoogleName.trim() === expectedTargetName.trim();

    if (!isNameMatch) {
      // Analyze specific replacement reason
      let reason = 'Format replacement needed';
      const oldPrefixClean = oldPrefix.toUpperCase();
      const newPrefixClean = newPrefix.toUpperCase();

      if (oldPrefixClean !== newPrefixClean) {
        // Prefix code changed (e.g. AT to AV, AUPending to AV, etc.)
        const oldTier = oldPrefixClean.replace(/EXD\s*/, '').slice(0, 2);
        const newTier = newPrefixClean.replace(/EXD\s*/, '').slice(0, 2);

        if (oldPrefixClean.includes('PENDING') && !newPrefixClean.includes('PENDING')) {
          reason = `Activated: ${oldPrefix} ➔ ${newPrefix}`;
        } else if (oldTier && newTier && oldTier !== newTier) {
          reason = `Role prefix replacement: ${oldTier} ➔ ${newTier} (${user.role.toUpperCase()})`;
        } else if (!oldPrefixClean.startsWith('EXD') && newPrefixClean.startsWith('EXD')) {
          reason = `Status expired: Needs "Exd" prefix (${user.status})`;
        } else if (oldPrefixClean.startsWith('EXD') && !newPrefixClean.startsWith('EXD')) {
          reason = `Status active: Remove "Exd" prefix (${user.status})`;
        } else {
          reason = `Prefix updated: ${oldPrefix} ➔ ${newPrefix}`;
        }
      } else {
        const oldCity = extractCityFromContactName(currentGoogleName);
        const newCity = extractCityFromContactName(expectedTargetName);
        if (oldCity !== newCity) {
          reason = `City format updated: (${oldCity || 'None'}) ➔ (${newCity || 'City'})`;
        } else {
          reason = `Name format updated`;
        }
      }

      mismatches.push({
        user,
        status: 'mismatch',
        googlePerson: matchingPerson,
        currentGoogleName,
        expectedTargetName,
        changeReason: reason,
        oldPrefix,
        newPrefix,
        phone: user.phone || '',
        normalizedPhone: normalized
      });
    } else {
      synced.push({
        user,
        status: 'synced',
        googlePerson: matchingPerson,
        currentGoogleName,
        expectedTargetName,
        changeReason: 'Synced & correctly formatted',
        oldPrefix,
        newPrefix,
        phone: user.phone || '',
        normalizedPhone: normalized
      });
    }
  }

  return {
    totalChecked: missing.length + mismatches.length + synced.length,
    mismatches,
    missing,
    synced
  };
}

/**
 * Bulk syncs an array of users to Google Contacts using Google People API BATCH endpoints
 * (batchCreateContacts and batchUpdateContacts) in chunks of up to 50 items.
 * Drastically improves sync performance from minutes to seconds.
 */
export async function batchSyncUsersContacts(
  users: UserProfile[],
  accessToken: string,
  onProgress?: (current: number, total: number) => void,
  cachedConnections?: GoogleContactPerson[]
): Promise<BatchSyncResult> {
  const CHUNK_SIZE = 50;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let photosUpdated = 0;
  let failed = 0;
  const errors: string[] = [];

  if (!users || users.length === 0) {
    return { total: 0, synced: 0, created: 0, updated: 0, unchanged: 0, photosUpdated: 0, failed: 0, errors: [] };
  }

  // 1. Fetch contact groups
  const createdGroupId = await getOrCreateContactGroup('Created by MovizNow', accessToken).catch(() => null);
  const modifiedGroupId = await getOrCreateContactGroup('Modified by MovizNow', accessToken).catch(() => null);

  // 2. Pre-fetch connections if not passed
  let connections: GoogleContactPerson[] = [];
  try {
    connections = cachedConnections || await fetchAllGoogleContacts(accessToken);
  } catch (e: any) {
    console.warn('[Batch Sync] Could not fetch connections before batch sync:', e);
  }

  // 3. Partition users into Creations and Updates
  const toCreate: Array<{ user: UserProfile; contactPerson: any }> = [];
  const toUpdate: Array<{ user: UserProfile; resourceName: string; contactPerson: any }> = [];
  const successfulUids: string[] = [];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (!user.phone && !user.email) {
      failed++;
      errors.push(`${user.displayName || user.uid}: Missing phone and email`);
      continue;
    }

    const { normalized } = normalizePhone(user.phone);
    const existingPerson = findMatchingContact(user, connections);

    if (existingPerson) {
      let existingDisplayName = '';
      if (existingPerson.names && existingPerson.names.length > 0) {
        const p = existingPerson.names[0];
        existingDisplayName = p.displayName || [p.givenName, p.familyName].filter(Boolean).join(' ') || p.givenName || '';
      }

      const formattedName = formatContactName(user, existingDisplayName);
      const userDobObj = parseDobToGoogleDate(user.dob);

      // Memberships
      const membershipsToUse: any[] = (existingPerson.memberships || []).filter((m: any) => m && m.contactGroupMembership);
      if (!membershipsToUse.some((m: any) => m.contactGroupMembership?.contactGroupResourceName === 'contactGroups/myContacts')) {
        membershipsToUse.push({ contactGroupMembership: { contactGroupResourceName: 'contactGroups/myContacts' } });
      }
      if (modifiedGroupId && !membershipsToUse.some((m: any) => m.contactGroupMembership?.contactGroupResourceName === modifiedGroupId)) {
        membershipsToUse.push({ contactGroupMembership: { contactGroupResourceName: modifiedGroupId } });
      }

      const phoneNumbers = normalized
        ? [{ value: normalized }]
        : (existingPerson.phoneNumbers || []);

      const emailAddresses = (user.email && !user.email.endsWith('@moviznow.com'))
        ? [{ value: user.email.trim() }]
        : (existingPerson.emailAddresses || []);

      const birthdays = userDobObj ? [{ date: userDobObj }] : (existingPerson.birthdays || []);

      const updatePersonPayload: any = {
        etag: existingPerson.etag || '*',
        names: [{ givenName: formattedName, familyName: '', middleName: '' }],
        phoneNumbers,
        emailAddresses,
        birthdays,
        memberships: membershipsToUse
      };

      toUpdate.push({
        user,
        resourceName: existingPerson.resourceName,
        contactPerson: updatePersonPayload
      });
    } else {
      // Create new contact payload
      const formattedName = formatContactName(user);
      const userDobObj = parseDobToGoogleDate(user.dob);

      const memberships: any[] = [
        { contactGroupMembership: { contactGroupResourceName: 'contactGroups/myContacts' } }
      ];
      if (createdGroupId) {
        memberships.push({ contactGroupMembership: { contactGroupResourceName: createdGroupId } });
      }

      const createPersonPayload: any = {
        names: [{ givenName: formattedName, familyName: '', middleName: '' }],
        phoneNumbers: normalized ? [{ value: normalized }] : [],
        emailAddresses: (user.email && !user.email.endsWith('@moviznow.com')) ? [{ value: user.email.trim() }] : [],
        memberships
      };
      if (userDobObj) {
        createPersonPayload.birthdays = [{ date: userDobObj }];
      }

      toCreate.push({
        user,
        contactPerson: createPersonPayload
      });
    }
  }

  const totalOps = toCreate.length + toUpdate.length;
  let processedOps = 0;

  // 4. Process Batch Creations in chunks of CHUNK_SIZE
  for (let c = 0; c < toCreate.length; c += CHUNK_SIZE) {
    const chunk = toCreate.slice(c, c + CHUNK_SIZE);
    const chunkPayload = chunk.map(item => ({ contactPerson: item.contactPerson }));

    const res = await batchCreateGoogleContacts(chunkPayload, accessToken);
    if (res.success) {
      created += res.createdCount;
      chunk.forEach(item => {
        successfulUids.push(item.user.uid);
        removeFromPendingContactsSync(item.user.uid).catch(() => {});
      });
      // Append created people to connections cache
      connections.push(...res.createdPeople);
    } else {
      // Chunk failed: fallback to single creates for this chunk so individual errors don't drop the rest
      console.warn(`[Batch Sync] Chunk creation failed, falling back to single creates:`, res.error);
      for (const item of chunk) {
        const singleRes = await syncSingleUserContact(item.user, accessToken, connections);
        if (singleRes.success) {
          created++;
          successfulUids.push(item.user.uid);
          removeFromPendingContactsSync(item.user.uid).catch(() => {});
        } else {
          failed++;
          errors.push(`${item.user.displayName || item.user.phone}: ${singleRes.error}`);
        }
      }
    }

    processedOps += chunk.length;
    if (onProgress) {
      onProgress(processedOps, totalOps);
    }
  }

  // 5. Process Batch Updates in chunks of CHUNK_SIZE
  for (let u = 0; u < toUpdate.length; u += CHUNK_SIZE) {
    const chunk = toUpdate.slice(u, u + CHUNK_SIZE);
    const chunkMap: Record<string, any> = {};
    chunk.forEach(item => {
      chunkMap[item.resourceName] = item.contactPerson;
    });

    const res = await batchUpdateGoogleContacts(chunkMap, accessToken);
    if (res.success) {
      updated += res.updatedCount;
      chunk.forEach(item => {
        successfulUids.push(item.user.uid);
        removeFromPendingContactsSync(item.user.uid).catch(() => {});
      });
    } else {
      // Chunk failed: fallback to single updates for this chunk
      console.warn(`[Batch Sync] Chunk update failed, falling back to single updates:`, res.error);
      for (const item of chunk) {
        const singleRes = await syncSingleUserContact(item.user, accessToken, connections);
        if (singleRes.success) {
          updated++;
          successfulUids.push(item.user.uid);
          removeFromPendingContactsSync(item.user.uid).catch(() => {});
        } else {
          failed++;
          errors.push(`${item.user.displayName || item.user.phone}: ${singleRes.error}`);
        }
      }
    }

    processedOps += chunk.length;
    if (onProgress) {
      onProgress(processedOps, totalOps);
    }
  }

  // 6. Bulk update Firestore user documents with contactSyncStatus: 'synced' in writeBatch
  if (successfulUids.length > 0) {
    try {
      const nowIso = new Date().toISOString();
      const firestoreBatches = [];
      const BATCH_LIMIT = 400;

      for (let b = 0; b < successfulUids.length; b += BATCH_LIMIT) {
        const slice = successfulUids.slice(b, b + BATCH_LIMIT);
        const fbBatch = writeBatch(db);
        slice.forEach(uid => {
          if (!uid.startsWith('pending_')) {
            const userRef = doc(db, 'users', uid);
            fbBatch.update(userRef, {
              contactSyncStatus: 'synced',
              contactLastSyncedAt: nowIso
            });
          }
        });
        firestoreBatches.push(fbBatch.commit());
      }

      await Promise.allSettled(firestoreBatches);
      console.log(`[Batch Sync] Updated ${successfulUids.length} user records in Firestore to 'synced'.`);
    } catch (fbErr) {
      console.warn('[Batch Sync] Non-blocking error updating Firestore contact sync statuses:', fbErr);
    }
  }

  return {
    total: users.length,
    synced: created + updated,
    created,
    updated,
    unchanged,
    photosUpdated,
    failed,
    errors
  };
}

/**
 * Bulk syncs an array of users to Google Contacts (now powered by batchSyncUsersContacts).
 */
export async function syncMultipleUsersContacts(
  users: UserProfile[],
  accessToken: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ total: number; synced: number; created: number; updated: number; photosUpdated: number; failed: number; errors: string[] }> {
  const result = await batchSyncUsersContacts(users, accessToken, onProgress);
  return {
    total: result.total,
    synced: result.synced,
    created: result.created,
    updated: result.updated,
    photosUpdated: result.photosUpdated,
    failed: result.failed,
    errors: result.errors
  };
}

/**
 * Processes and syncs all contacts in the pending queue.
 * Removes contacts that sync successfully, keeping any failing or un-synced contacts in the queue.
 */
export async function processPendingContactsQueue(
  accessToken: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ total: number; synced: number; failed: number; remaining: number; isTokenError: boolean }> {
  const pendingItems = await fetchPendingContactsFromFirestore();
  if (pendingItems.length === 0) {
    return { total: 0, synced: 0, failed: 0, remaining: 0, isTokenError: false };
  }

  let synced = 0;
  let failed = 0;
  let isTokenError = false;

  // Pre-fetch connections for performance
  let connections: GoogleContactPerson[] = [];
  try {
    connections = await fetchAllGoogleContacts(accessToken);
  } catch (e: any) {
    const msg = e?.message || '';
    if (msg.includes('401') || msg.includes('UNAUTHENTICATED')) {
      return { total: pendingItems.length, synced: 0, failed: pendingItems.length, remaining: pendingItems.length, isTokenError: true };
    }
  }

  for (let i = 0; i < pendingItems.length; i++) {
    const item = pendingItems[i];
    if (onProgress) {
      onProgress(i + 1, pendingItems.length);
    }

    if (!item.user || !item.user.phone) {
      // User has no phone or is invalid, remove from pending
      await removeFromPendingContactsSync(item.uid);
      continue;
    }

    const res = await syncSingleUserContact(item.user, accessToken, connections);
    if (res.success) {
      synced++;
      await removeFromPendingContactsSync(item.uid);
    } else {
      failed++;
      if (res.isTokenError) {
        isTokenError = true;
        console.warn(`[Google Contacts Queue] Token error while syncing pending user ${item.uid}, aborting queue.`);
        break; // Stop processing rest of queue until next valid token
      } else {
        // Record attempt count
        const currentQueue = getLocalPendingQueue();
        if (currentQueue[item.uid]) {
          currentQueue[item.uid].attempts = (currentQueue[item.uid].attempts || 0) + 1;
          currentQueue[item.uid].lastAttemptAt = new Date().toISOString();
          currentQueue[item.uid].lastError = res.error;
          saveLocalPendingQueue(currentQueue);
        }
      }
    }
  }

  const remaining = getPendingContactsList().length;
  console.log(`[Google Contacts Queue Processed] Synced: ${synced}, Failed: ${failed}, Remaining Pending: ${remaining}`);

  return {
    total: pendingItems.length,
    synced,
    failed,
    remaining,
    isTokenError
  };
}

/**
 * Handles always-sync contact flow on user edit / update:
 * 1. Checks if user has phone; if not, returns.
 * 2. Attempts to sync immediately with stored/active token.
 * 3. If token is expired, invalid, missing, or fails with 401:
 *    - Immediately queues user into Pending Contacts Sync.
 *    - Opens Google OAuth popup for token refresh (if interactive).
 *    - Once token is retrieved, automatically flushes and syncs all pending contacts.
 *    - If OAuth is cancelled/fails, user remains in Pending Contacts until synced successfully.
 */
export async function syncUserContactWithAutoOAuth(
  userToSync: UserProfile,
  interactivePromptIfNoToken: boolean = true
): Promise<{ success: boolean; pending: boolean; contactName?: string; error?: string; syncedCount?: number }> {
  if (!userToSync.phone && !userToSync.email) {
    return { success: true, pending: false };
  }

  // 1. Check existing token
  const tokenState = await ensureValidContactsToken(false);
  let accessToken = tokenState.accessToken;
  const accountEmail = tokenState.email || getConnectedAccountEmail() || 'wmoviznow@gmail.com';

  if (accessToken) {
    // 2. Try immediate sync with active token
    const res = await syncSingleUserContact(userToSync, accessToken);
    if (res.success) {
      await removeFromPendingContactsSync(userToSync.uid);
      // Background flush any previously queued contacts
      processPendingContactsQueue(accessToken).catch(() => {});
      return { success: true, pending: false, contactName: res.contactName };
    }

    if (!res.isTokenError) {
      // Non-token error (e.g. invalid phone number format)
      await addToPendingContactsSync(userToSync, res.error || 'Failed to sync contact');
      return { success: false, pending: true, error: res.error };
    }
  }

  // 3. Token is missing, expired, or rejected with 401:
  // Move contact to Pending Sync queue immediately
  await addToPendingContactsSync(userToSync, 'Token expired / authentication required');

  if (!interactivePromptIfNoToken) {
    return {
      success: false,
      pending: true,
      error: 'Google Contacts token expired. User moved to Pending Sync.'
    };
  }

  // 4. Open OAuth for token refresh
  try {
    console.log('[Google Contacts Auto-Sync] Opening OAuth to refresh token and sync pending contact...');
    const conn = await connectGoogleContacts(accountEmail, false);
    if (conn && conn.accessToken) {
      // 5. Successfully got token! Sync this user & all pending contacts immediately
      const queueRes = await processPendingContactsQueue(conn.accessToken);
      return {
        success: true,
        pending: queueRes.remaining > 0,
        contactName: formatContactName(userToSync),
        syncedCount: queueRes.synced
      };
    }
  } catch (authErr: any) {
    console.warn('[Google Contacts Auto-Sync] OAuth connection cancelled or failed:', authErr);
    return {
      success: false,
      pending: true,
      error: authErr?.message || 'OAuth authorization cancelled. Contact remains in Pending Sync.'
    };
  }

  return {
    success: false,
    pending: true,
    error: 'Contact kept in Pending Sync until token is authorized.'
  };
}
