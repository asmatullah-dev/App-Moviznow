import { Order, Role, CartItem } from '../types';

export interface MinimalOrder {
  id: string;                                                // Order ID
  amt: number;                                               // Amount in PKR
  type: 'membership' | 'content';                            // Order type
  status: 'pending' | 'approved' | 'declined' | 'cancelled'; // Order status
  cat: string;                                               // CreatedAt ISO string
  m?: number;                                                // Months (for membership)
  trx?: string;                                              // Transaction ID
  dt?: string;                                               // Payment Date & Time
  plan?: string;                                             // Plan name
  role?: Role;                                               // Target plan role
  items?: CartItem[];                                        // Purchased items
  acc?: string;                                              // Sender account title
  acc4?: string;                                             // Sender account last 4 digits
  bank?: string;                                             // Sender bank / wallet
  vb?: 'ai' | 'admin' | string;                              // Verified by
  aic?: 'high' | 'medium' | 'low' | 'none' | string;         // AI verification confidence
}

/**
 * Normalizes any order object (legacy verbose format or ultra-minimal short-key format)
 * into a standard `Order` interface.
 */
export function normalizeOrder(o: any, parentUser?: { uid?: string; displayName?: string; email?: string; role?: Role }): Order {
  if (!o) return o;

  const orderId = String(o.id || '');
  const amount = typeof o.amt === 'number' ? o.amt : (typeof o.amount === 'number' ? o.amount : Number(o.amt || o.amount) || 0);
  const type = (o.type === 'content' ? 'content' : 'membership') as 'membership' | 'content';
  const status = (o.status || o.st || 'pending') as 'pending' | 'approved' | 'declined' | 'cancelled';
  const createdAt = o.cat || o.createdAt || new Date().toISOString();
  
  const months = typeof o.m === 'number' ? o.m : (typeof o.months === 'number' ? o.months : undefined);
  const trxId = o.trx || o.trxId || '';
  const paymentDateTime = o.dt || o.pdt || o.paymentDateTime || '';
  const planName = o.plan || o.planName;
  const planRole = (o.role || o.planRole) as Role | undefined;
  const accountTitle = o.acc || o.accountTitle || '';
  const accountNumberLast4 = o.acc4 || o.accountNumberLast4 || '';
  const senderBank = o.bank || o.senderBank || '';
  const verifiedBy = o.vb === 'ai' ? 'AI Auto-Approval' : (o.vb || o.verifiedBy || '');
  const aiConfidence = o.aic || o.aiConfidence || '';

  // Never keep massive inline base64 images
  let paymentScreenshotUrl = o.paymentScreenshotUrl;
  if (paymentScreenshotUrl && paymentScreenshotUrl.startsWith('data:')) {
    paymentScreenshotUrl = undefined;
  }

  return {
    id: orderId,
    userId: o.userId || parentUser?.uid || '',
    userName: o.userName || parentUser?.displayName || (parentUser?.email ? parentUser.email.split('@')[0] : 'User'),
    userEmail: o.userEmail || parentUser?.email || '',
    userRole: o.userRole || parentUser?.role || 'user',
    type,
    amount,
    status,
    createdAt,
    months,
    planName,
    planRole,
    items: Array.isArray(o.items) ? o.items : undefined,
    trxId,
    accountTitle,
    accountNumberLast4,
    paymentDateTime,
    paymentScreenshotUrl,
    senderBank,
    matchedEmailId: o.matchedEmailId,
    matchedEmailSubject: o.matchedEmailSubject,
    matchedEmailSnippet: o.matchedEmailSnippet,
    matchedEmailDate: o.matchedEmailDate,
    verifiedBy,
    verifiedAt: o.verifiedAt,
    aiVerificationAttempted: o.aiVerificationAttempted || Boolean(o.aic || o.aiConfidence),
    aiVerificationReason: o.aiVerificationReason,
    aiConfidence,
    allowAutoApproval: o.allowAutoApproval,
    paymentMethodId: o.paymentMethodId,
    paymentMethodName: o.paymentMethodName,
  };
}

/**
 * Converts any order into the ultra-minimal short-key format (Option 1 with short keys from Option 2, no images).
 */
export function toMinimalOrder(o: any): MinimalOrder {
  if (!o) return o;

  const min: MinimalOrder = {
    id: String(o.id || ''),
    amt: typeof o.amt === 'number' ? o.amt : (typeof o.amount === 'number' ? o.amount : Number(o.amt || o.amount) || 0),
    type: o.type === 'content' ? 'content' : 'membership',
    status: (o.status || o.st || 'pending') as 'pending' | 'approved' | 'declined' | 'cancelled',
    cat: o.cat || o.createdAt || new Date().toISOString(),
  };

  const mVal = o.m !== undefined ? o.m : o.months;
  if (mVal !== undefined && mVal !== null) {
    min.m = Number(mVal);
  }

  const trxVal = o.trx || o.trxId;
  if (trxVal && String(trxVal).trim()) {
    min.trx = String(trxVal).trim();
  }

  const dtVal = o.dt || o.pdt || o.paymentDateTime;
  if (dtVal && String(dtVal).trim()) {
    min.dt = String(dtVal).trim();
  }

  const planVal = o.plan || o.planName;
  if (planVal) {
    min.plan = planVal;
  }

  const roleVal = o.role || o.planRole;
  if (roleVal) {
    min.role = roleVal;
  }

  if (Array.isArray(o.items) && o.items.length > 0) {
    min.items = o.items.map((it: any) => ({
      id: it.id,
      title: it.title,
      type: it.type,
      price: Number(it.price) || 0,
      seasonNumber: it.seasonNumber,
    }));
  }

  const accVal = o.acc || o.accountTitle;
  if (accVal && String(accVal).trim()) {
    min.acc = String(accVal).trim();
  }

  const acc4Val = o.acc4 || o.accountNumberLast4;
  if (acc4Val && String(acc4Val).trim()) {
    min.acc4 = String(acc4Val).trim().slice(-4);
  }

  const bankVal = o.bank || o.senderBank;
  if (bankVal && String(bankVal).trim()) {
    min.bank = String(bankVal).trim();
  }

  const vbVal = o.vb || o.verifiedBy;
  if (vbVal) {
    min.vb = (vbVal === 'AI Auto-Approval' || vbVal === 'AI Gemini Auto-Approval' || vbVal === 'ai') ? 'ai' : String(vbVal);
  }

  const aicVal = o.aic || o.aiConfidence;
  if (aicVal) {
    min.aic = aicVal;
  }

  // Explicitly NO base64 screenshots, NO verbose email snippets, NO duplicate user info
  return min;
}
