import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile } from '../types';
import { isUserExpired } from '../contexts/UsersContext';
import { doc, updateDoc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

const CONTACTS_SCOPE = 'https://www.googleapis.com/auth/contacts';
const STORAGE_TOKEN_KEY = 'gcontacts_access_token';
const STORAGE_EXPIRY_KEY = 'gcontacts_token_expiry';
const STORAGE_EMAIL_KEY = 'gcontacts_account_email';

// Memory cache for contact group resource names during session
const groupResourceCache: Record<string, string> = {};

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
 * Updates or uploads a photo/avatar for a Google Contact using the Google People API (:updateContactPhoto)
 */
export async function updateGoogleContactPhoto(
  resourceName: string,
  photoUrl: string,
  accessToken: string
): Promise<boolean> {
  if (!resourceName || !photoUrl) return false;

  try {
    let base64Photo = '';

    if (photoUrl.startsWith('data:image/')) {
      base64Photo = photoUrl.split(',')[1] || '';
    } else if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) {
      const response = await fetch(photoUrl);
      if (!response.ok) {
        console.warn(`[Google Contacts Photo] Could not fetch avatar from ${photoUrl} (${response.status})`);
        return false;
      }
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      base64Photo = btoa(binary);
    }

    if (!base64Photo) return false;

    const updateUrl = `https://people.googleapis.com/v1/${resourceName}:updateContactPhoto`;
    const res = await fetch(updateUrl, {
      method: 'POST',
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
      console.log(`[Google Contacts Photo] Successfully updated photo for ${resourceName}`);
      return true;
    } else {
      const errText = await res.text();
      console.warn(`[Google Contacts Photo] Failed to update photo for ${resourceName}: ${errText}`);
      return false;
    }
  } catch (err) {
    console.warn(`[Google Contacts Photo] Exception while updating photo for ${resourceName}:`, err);
    return false;
  }
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
 * Formats or updates contact name according to specifications:
 * For VIP users:
 *   Not expired: AVYY/MM/DD {Name} ({City}) eg AV26/10/13 Ikram Raza (Lahore)
 *   Expired: Exd AVYY/MM/DD {Name} ({City}) eg Exd AV26/10/13 Ikram Raza (Lahore)
 * For Basic users:
 *   Not expired: ABYY/MM/DD {Name} ({City}) eg AB26/10/13 Ikram Raza (Lahore)
 *   Expired: Exd ABYY/MM/DD {Name} ({City}) eg Exd AB26/10/13 Ikram Raza (Lahore)
 *
 * If existingContactName is provided:
 *   Replaces ONLY the status (Exd ) and prefix date (AVYY/MM/DD / ABYY/MM/DD)
 *   and keeps the remaining text ({Name} ({City}) and everything after) UNTOUCHED!
 */
export function formatContactName(user: UserProfile, existingContactName?: string | null): string {
  const isVip = user.role === 'vip';
  const tierLetter = isVip ? 'V' : 'B';
  const prefixCode = `A${tierLetter}`; // AV or AB

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

  const newPrefix = `${statusPrefix}${prefixCode}${datePart}`;

  if (existingContactName && existingContactName.trim()) {
    const trimmedExisting = existingContactName.trim();
    // Matches status prefix (Exd ), tier code (AV/AB), and date (YY/MM/DD)
    const prefixRegex = /^(?:Exd\s+)?(?:[A-Za-z]{2})?\s*\d{2,4}[\/\.-]\d{2}[\/\.-]\d{2,4}\s*/i;
    const restOfName = trimmedExisting.replace(prefixRegex, '').trim();

    if (restOfName) {
      const cityRegex = /\s*\(([^)]+)\)$/;
      const cityMatch = restOfName.match(cityRegex);

      let baseName = restOfName;
      let existingCityInParen: string | null = null;

      if (cityMatch) {
        baseName = restOfName.slice(0, cityMatch.index).trim();
        existingCityInParen = cityMatch[1].trim();
      }

      const targetCity = user.city?.trim() || existingCityInParen || 'Lahore';
      const nameWithCity = targetCity ? `${baseName} (${targetCity})` : baseName;

      return `${newPrefix} ${nameWithCity}`;
    }
  }

  // Default format for new contacts
  const name = user.displayName?.trim() || user.email?.split('@')[0] || 'User';
  const city = user.city?.trim() || 'Lahore';

  return `${newPrefix} ${name} (${city})`;
}

/**
 * Saves Google Contacts OAuth token details to Firestore for persistence across sessions/tabs.
 */
export async function saveContactsTokenToFirestore(accessToken: string, expiry: string, email: string): Promise<void> {
  try {
    const docRef = doc(db, 'settings', 'google_contacts');
    await setDoc(docRef, {
      accessToken,
      expiry,
      email,
      updatedAt: new Date().toISOString()
    });
    console.log('[Google Contacts] Token saved to Firestore');
  } catch (err) {
    console.warn('[Google Contacts] Error saving token to Firestore:', err);
  }
}

/**
 * Loads and verifies the Google Contacts token, checking sessionStorage first, then falling back to Firestore.
 * If a valid token is found in Firestore, it caches it in sessionStorage and returns it.
 */
export async function loadAndVerifyStoredContactsToken(): Promise<{ accessToken: string | null; email: string | null }> {
  // Check sessionStorage first
  const token = sessionStorage.getItem(STORAGE_TOKEN_KEY);
  const expiry = sessionStorage.getItem(STORAGE_EXPIRY_KEY);
  const email = sessionStorage.getItem(STORAGE_EMAIL_KEY);
  if (token && expiry && Date.now() < parseInt(expiry, 10)) {
    return { accessToken: token, email: email || null };
  }

  // Fallback to Firestore
  try {
    const docRef = doc(db, 'settings', 'google_contacts');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const fToken = data.accessToken;
      const fExpiry = data.expiry;
      const fEmail = data.email;

      if (fToken && fExpiry && Date.now() < parseInt(fExpiry, 10)) {
        // Cache in sessionStorage for synchronous getters
        sessionStorage.setItem(STORAGE_TOKEN_KEY, fToken);
        sessionStorage.setItem(STORAGE_EXPIRY_KEY, fExpiry);
        if (fEmail) {
          sessionStorage.setItem(STORAGE_EMAIL_KEY, fEmail);
        }
        console.log('[Google Contacts] Valid token restored from Firestore and cached in sessionStorage');
        return { accessToken: fToken, email: fEmail || null };
      }
    }
  } catch (err) {
    console.warn('[Google Contacts] Error loading token from Firestore:', err);
  }

  return { accessToken: null, email: null };
}

/**
 * Gets cached Google Contacts access token if available and valid.
 */
export function getStoredContactsToken(): string | null {
  const token = sessionStorage.getItem(STORAGE_TOKEN_KEY);
  const expiry = sessionStorage.getItem(STORAGE_EXPIRY_KEY);
  if (token && expiry && Date.now() < parseInt(expiry, 10)) {
    return token;
  }
  return null;
}

/**
 * Gets email of connected Google Contacts account.
 */
export function getConnectedAccountEmail(): string | null {
  return sessionStorage.getItem(STORAGE_EMAIL_KEY) || null;
}

/**
 * Connects to Google Contacts via GIS Token Client without altering Firebase Auth state.
 */
export async function connectGoogleContacts(accountHint: string = 'wmoviznow@gmail.com'): Promise<{ accessToken: string; email: string }> {
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
        hint: accountHint,
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
          const expiry = (Date.now() + (expiresIn - 100) * 1000).toString();

          sessionStorage.setItem(STORAGE_TOKEN_KEY, accessToken);
          sessionStorage.setItem(STORAGE_EXPIRY_KEY, expiry);
          sessionStorage.setItem(STORAGE_EMAIL_KEY, email);

          // Save to Firestore for persistence
          await saveContactsTokenToFirestore(accessToken, expiry, email);

          resolve({ accessToken, email });
        },
        error_callback: (err: any) => {
          reject(new Error(err?.message || 'Google Contacts authorization popup closed or cancelled.'));
        }
      });

      tokenClient.requestAccessToken({ prompt: 'select_account', hint: accountHint });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Disconnects Google Contacts session.
 */
export function disconnectGoogleContacts(): void {
  sessionStorage.removeItem(STORAGE_TOKEN_KEY);
  sessionStorage.removeItem(STORAGE_EXPIRY_KEY);
  sessionStorage.removeItem(STORAGE_EMAIL_KEY);

  // Clear Firestore document
  const docRef = doc(db, 'settings', 'google_contacts');
  deleteDoc(docRef).catch(err => {
    console.warn('[Google Contacts] Error deleting token from Firestore:', err);
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

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

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
 * Finds a contact in Google Contacts list strictly matching a user's phone number.
 */
export function findMatchingContact(
  user: { phone?: string; email?: string; displayName?: string },
  connectionsList: GoogleContactPerson[] = []
): GoogleContactPerson | null {
  if (!user.phone || !connectionsList || connectionsList.length === 0) return null;

  for (const person of connectionsList) {
    if (isPhoneMatch(user.phone, person)) {
      return person;
    }
  }

  return null;
}

/**
 * Syncs a single user to Google Contacts.
 * Always checks by phone number. If found, replaces the contact's name with the new formatted name.
 * If not found, creates a new contact.
 */
export async function syncSingleUserContact(
  user: UserProfile,
  accessToken: string,
  cachedConnections?: GoogleContactPerson[]
): Promise<{ success: boolean; created: boolean; updated: boolean; contactName: string; phoneUsed: string; error?: string }> {
  const normalizedRole = (user.role || '').toString().trim().toLowerCase();
  if (normalizedRole !== 'vip' && normalizedRole !== 'basic') {
    return {
      success: false,
      created: false,
      updated: false,
      contactName: '',
      phoneUsed: user.phone || '',
      error: 'User role is not VIP or Basic (Only VIP and Basic roles are synced)'
    };
  }

  if (!user.phone) {
    return {
      success: false,
      created: false,
      updated: false,
      contactName: '',
      phoneUsed: '',
      error: 'User has no phone or WhatsApp number'
    };
  }

  const { normalized, matchKey } = normalizePhone(user.phone);
  if (!normalized || !matchKey) {
    return {
      success: false,
      created: false,
      updated: false,
      contactName: '',
      phoneUsed: user.phone,
      error: 'Invalid phone number format'
    };
  }

  const formattedName = formatContactName(user);
  const nameForAvatar = user.displayName || user.email || user.phone || '';
  const photoToUpload = user.photoURL && user.photoURL.trim() !== ''
    ? user.photoURL.trim()
    : nameForAvatar
      ? `https://ui-avatars.com/api/?name=${encodeURIComponent(nameForAvatar.trim())}&background=random&size=256`
      : undefined;

  try {
    let connections = cachedConnections;
    if (!connections) {
      connections = await fetchAllGoogleContacts(accessToken);
    }

    // 1. Check in fetched connections list by phone
    let existingPerson = findMatchingContact(user, connections);

    // 2. Fallback: Search directly via Google Contacts API if not found in top connections list
    if (!existingPerson) {
      existingPerson = await searchGoogleContactsByPhone(user.phone, accessToken);
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
        const cityMatch = existingDisplayName.match(/\s*\(([^)]+)\)$/);
        if (cityMatch && cityMatch[1]) {
          extractedCity = cityMatch[1].trim();
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

      // Fallback if update fails: retry with basic updateFields
      if (!res.ok) {
        const errText = await res.text();
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
          throw new Error(`Failed to replace contact name & details: ${fallbackErr}`);
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
        if (extractedCity && (!user.city || user.city.trim() === '')) {
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
      if (photoToUpload && existingPerson.resourceName) {
        try {
          await updateGoogleContactPhoto(existingPerson.resourceName, photoToUpload, accessToken);
        } catch (e) {
          console.warn(`[Google Contacts Sync] Could not sync photo for ${existingPerson.resourceName}:`, e);
        }
      }

      return {
        success: true,
        created: false,
        updated: true,
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
        phoneNumbers: [{ value: normalized }]
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
        throw new Error(`Failed to create contact: ${errText}`);
      }

      const createdPerson = await res.json().catch(() => null);
      if (createdPerson && connections) {
        connections.push(createdPerson);
      }

      // Sync profile picture if available for newly created contact
      const createdResourceName = createdPerson?.resourceName;
      if (photoToUpload && createdResourceName) {
        try {
          await updateGoogleContactPhoto(createdResourceName, photoToUpload, accessToken);
        } catch (e) {
          console.warn(`[Google Contacts Sync] Could not sync photo for new contact ${createdResourceName}:`, e);
        }
      }

      return {
        success: true,
        created: true,
        updated: false,
        contactName: formattedName,
        phoneUsed: normalized
      };
    }
  } catch (err: any) {
    console.error(`Error syncing contact for user ${user.uid}:`, err);
    return {
      success: false,
      created: false,
      updated: false,
      contactName: formattedName,
      phoneUsed: normalized,
      error: err?.message || 'Unknown error during Google Contacts API call'
    };
  }
}

/**
 * Bulk syncs an array of users to Google Contacts.
 */
export async function syncMultipleUsersContacts(
  users: UserProfile[],
  accessToken: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ total: number; synced: number; created: number; updated: number; failed: number; errors: string[] }> {
  let created = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  // Fetch connections once to avoid rate limits
  let connections: GoogleContactPerson[] = [];
  try {
    connections = await fetchAllGoogleContacts(accessToken);
  } catch (e: any) {
    console.warn('Could not fetch existing connections prior to bulk sync:', e);
  }

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    if (onProgress) {
      onProgress(i + 1, users.length);
    }

    if (!u.phone) {
      failed++;
      errors.push(`${u.displayName || u.email || u.uid}: No phone number`);
      continue;
    }

    const res = await syncSingleUserContact(u, accessToken, connections);
    if (res.success) {
      if (res.created) created++;
      if (res.updated) updated++;
    } else {
      failed++;
      errors.push(`${u.displayName || u.phone}: ${res.error}`);
    }
  }

  return {
    total: users.length,
    synced: created + updated,
    created,
    updated,
    failed,
    errors
  };
}
