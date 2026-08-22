import React, { useState, useRef } from 'react';
import { 
  Check, 
  Copy, 
  Upload, 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  CreditCard, 
  Calendar, 
  Clock,
  User, 
  Hash, 
  Building2, 
  Image as ImageIcon,
  X,
  Zap,
  Send
} from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth, standardizePhone } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import PaymentMethods from './PaymentMethods';
import AlertModal from './AlertModal';

interface PaymentVerificationFormProps {
  orderType: 'membership' | 'content';
  amount: number;
  planName?: string;
  planRole?: string;
  months?: number;
  items?: any[];
  onOrderCompleted: (order: any, isAutoApproved: boolean) => void;
  disabled?: boolean;
}

export default function PaymentVerificationForm({
  orderType,
  amount,
  planName,
  planRole = 'vip',
  months = 1,
  items = [],
  onOrderCompleted,
  disabled = false,
}: PaymentVerificationFormProps) {
  const { profile, refreshProfile, updateUserProfileData } = useAuth();
  const { settings } = useSettings();
  const { t } = useLanguage();

  // Helper for initial date and time
  const getInitialDateTime = () => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return {
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`
    };
  };

  const initialDt = getInitialDateTime();

  // Form Fields
  const [trxId, setTrxId] = useState('');
  const [accountTitle, setAccountTitle] = useState(profile?.displayName || '');
  const [accountNumberLast4, setAccountNumberLast4] = useState('');
  const [paymentDate, setPaymentDate] = useState(initialDt.date);
  const [paymentTime, setPaymentTime] = useState(initialDt.time);
  const [senderBank, setSenderBank] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState(profile?.phone || '');

  // Screenshot Upload State
  const [screenshotData, setScreenshotData] = useState<string | null>(null);
  const [isScanningScreenshot, setIsScanningScreenshot] = useState(false);
  const [ocrSuccess, setOcrSuccess] = useState(false);
  const [ocrMessage, setOcrMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Verification & Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationStep, setVerificationStep] = useState<'idle' | 'ocr' | 'gmail_match' | 'finalizing'>('idle');
  const [verificationAttempt, setVerificationAttempt] = useState(1);
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });

  // Helper to optimize large images before sending for OCR
  const processImageForOCR = (file: File): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1600;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const optimizedBase64 = canvas.toDataURL('image/jpeg', 0.85);
            resolve({ base64: optimizedBase64, mimeType: 'image/jpeg' });
          } else {
            resolve({ base64: e.target?.result as string, mimeType: file.type || 'image/jpeg' });
          }
        };
        img.onerror = () => {
          resolve({ base64: e.target?.result as string, mimeType: file.type || 'image/jpeg' });
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Handle image upload & AI OCR with Gemini
  const handleImageSelected = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAlertConfig({
        isOpen: true,
        title: t('Invalid File'),
        message: t('Please upload an image file (PNG, JPG, or JPEG)'),
      });
      return;
    }

    setIsScanningScreenshot(true);
    setOcrSuccess(false);
    setOcrMessage('');

    try {
      const { base64, mimeType } = await processImageForOCR(file);
      setScreenshotData(base64);

      const response = await fetch('/api/orders/ocr-payment-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
        }),
      });

      const data = await response.json();
      if (data.success && data.extracted) {
        const ext = data.extracted;
        let detectedAny = false;

        if (ext.trxId) {
          setTrxId(ext.trxId);
          detectedAny = true;
        }
        if (ext.accountTitle) {
          setAccountTitle(ext.accountTitle);
          detectedAny = true;
        }
        if (ext.accountNumberLast4) {
          setAccountNumberLast4(ext.accountNumberLast4);
          detectedAny = true;
        }
        if (ext.date) {
          setPaymentDate(ext.date);
          detectedAny = true;
        }
        if (ext.time) {
          setPaymentTime(ext.time);
          detectedAny = true;
        }
        if (!ext.date && ext.dateTime) {
          const dtMatch = ext.dateTime.match(/(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
          if (dtMatch) {
            setPaymentDate(dtMatch[1]);
            setPaymentTime(dtMatch[2]);
            detectedAny = true;
          }
        }
        if (ext.senderBank) {
          setSenderBank(ext.senderBank);
          detectedAny = true;
        }

        if (detectedAny) {
          setOcrSuccess(true);
          setOcrMessage(t('Payment details recognized automatically by AI!'));
        } else {
          setOcrMessage(t('Could not extract all details automatically. Please verify or fill in manually.'));
        }
      } else {
        setOcrMessage(t('Could not extract all details automatically. Please verify or fill in manually.'));
      }
    } catch (err) {
      console.error('Failed to run Gemini OCR:', err);
      setOcrMessage(t('Image attached. Please fill or check the payment fields.'));
    } finally {
      setIsScanningScreenshot(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          handleImageSelected(file);
          break;
        }
      }
    }
  };

  const handleRemoveScreenshot = () => {
    setScreenshotData(null);
    setOcrSuccess(false);
    setOcrMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Submit Order & Run AI Gmail Auto-Approval
  const handleSubmitAndVerify = async () => {
    if (!profile) {
      setAlertConfig({
        isOpen: true,
        title: t('Authentication Required'),
        message: t('Please sign in to proceed with your order.'),
      });
      return;
    }

    if (!trxId.trim()) {
      setAlertConfig({
        isOpen: true,
        title: t('Missing Transaction ID'),
        message: t('Please enter the Transaction ID (TID / Ref ID) from your payment receipt.'),
      });
      return;
    }

    if (!accountTitle.trim()) {
      setAlertConfig({
        isOpen: true,
        title: t('Missing Account Title'),
        message: t('Please enter the sender Account Title (Name) used for the transfer.'),
      });
      return;
    }

    if (!accountNumberLast4.trim() || accountNumberLast4.trim().length < 2) {
      setAlertConfig({
        isOpen: true,
        title: t('Missing Account Digits'),
        message: t('Please enter the last 4 digits of your account/wallet number.'),
      });
      return;
    }

    setIsSubmitting(true);
    setVerificationStep('gmail_match');

    try {
      // Check if admin gmail token is cached in local/session
      const cachedGmailToken = sessionStorage.getItem('admin_gmail_oauth_token') || undefined;

      const orderPayload = {
        userId: profile.uid,
        userName: profile.displayName || accountTitle || 'Member',
        userEmail: profile.email || '',
        userRole: profile.role || 'user',
        phone: whatsappNumber !== profile.phone ? whatsappNumber : undefined,
        verificationAttempt,
        type: orderType,
        planRole,
        amount: Number(amount) || 0,
        months: orderType === 'membership' ? months : undefined,
        planName: orderType === 'membership' ? planName : undefined,
        items: orderType === 'content' ? items : undefined,
        trxId: trxId.trim(),
        accountTitle: accountTitle.trim(),
        accountNumberLast4: accountNumberLast4.trim().slice(-4),
        paymentDateTime: `${paymentDate || ''} ${paymentTime || ''}`.trim(),
        paymentScreenshotUrl: screenshotData || undefined,
        senderBank: senderBank.trim() || undefined,
        gmailToken: cachedGmailToken,
      };

      const response = await fetch('/api/orders/verify-and-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      const result = await response.json();

      if (!result.success) {
        if (result.needsRetry) {
          setVerificationAttempt(prev => prev + 1);
          setAlertConfig({
            isOpen: true,
            title: t('Verification Failed'),
            message: result.reason + ' ' + t('Please check your details and try again.'),
          });
          return;
        }
        throw new Error(result.error || 'Failed to verify order');
      }

      // Refresh auth profile to sync new membership status / active content
      if ((window as any).triggerSyncUserData) {
        await (window as any).triggerSyncUserData('order_confirmed');
      }
      if ((window as any).triggerRefreshAppData) {
        await (window as any).triggerRefreshAppData('manual');
      } else {
        await refreshProfile(true);
      }

      onOrderCompleted(result.order, !!result.autoApproved);
    } catch (error: any) {
      console.error('Order verification error:', error);
      setAlertConfig({
        isOpen: true,
        title: t('Order Submission Notice'),
        message: error.message || t('Failed to process order. Please try again or contact support.'),
      });
    } finally {
      setIsSubmitting(false);
      setVerificationStep('idle');
    }
  };

  return (
    <div className="space-y-6" onPaste={handlePaste}>
      {/* 1. Payment Methods */}
      {settings?.isPaymentEnabled !== false && (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-6 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-extrabold flex items-center gap-2 text-zinc-900 dark:text-white">
              <CreditCard className="w-4 h-4 text-emerald-500" />
              <span>{t('Send Payment To')}</span>
            </h3>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
              Rs. {amount.toLocaleString()}
            </span>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mb-4">
            {t('Transfer the exact amount to any of our official accounts below:')}
          </p>

          <PaymentMethods 
            copied={false} 
            onCopy={(text) => {
              if (text) navigator.clipboard.writeText(text);
            }} 
          />
        </div>
      )}

      {/* 2. Payment Screenshot & Gemini AI Auto-Scan */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-6 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-extrabold flex items-center gap-2 text-zinc-900 dark:text-white">
            <ImageIcon className="w-4 h-4 text-emerald-500" />
            <span>{t('Payment Screenshot')}</span>
          </h3>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Sparkles className="w-3 h-3" />
            <span>AI Auto-Fill</span>
          </span>
        </div>
        <p className="text-zinc-500 dark:text-zinc-400 text-xs mb-4">
          {t('Upload or paste your transfer receipt. AI will automatically scan and fill all details.')}
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageSelected(file);
          }}
        />

        {!screenshotData ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl p-6 text-center cursor-pointer transition-all bg-zinc-50/50 dark:bg-zinc-950/50 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/10 group"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform">
              <Upload className="w-6 h-6" />
            </div>
            <div className="text-sm font-extrabold text-zinc-900 dark:text-white mb-1">
              {t('Click to Upload Screenshot')}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {t('Supports PNG, JPG, JPEG or Paste from Clipboard (Ctrl+V)')}
            </p>
          </div>
        ) : (
          <div className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-950 p-2">
            <div className="relative max-h-56 overflow-hidden rounded-xl flex items-center justify-center bg-black/40">
              <img
                src={screenshotData}
                alt="Receipt Preview"
                className="max-h-56 object-contain rounded-lg"
              />
              <button
                type="button"
                onClick={handleRemoveScreenshot}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-black text-white transition-colors cursor-pointer"
                title="Remove image"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isScanningScreenshot && (
              <div className="mt-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                <span>AI is extracting Transaction ID, Account Name & Timestamp...</span>
              </div>
            )}

            {ocrSuccess && (
              <div className="mt-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{ocrMessage || t('Details successfully extracted!')}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Transaction Details Form (Auto-filled by AI & Editable) */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-6 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold flex items-center gap-2 text-zinc-900 dark:text-white">
            <Hash className="w-4 h-4 text-emerald-500" />
            <span>{t('Transaction Confirmation Details')}</span>
          </h3>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
            {t('All fields required')}
          </span>
        </div>

        {/* Row 1: Transaction ID & Sender Bank */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-emerald-500" />
              <span>{t('Transaction ID (TID / Ref #)')}</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={trxId}
              onChange={(e) => setTrxId(e.target.value)}
              placeholder="e.g. 2458910284"
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm font-semibold font-mono text-zinc-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>{t('Sender Bank / App')}</span>
            </label>
            <input
              type="text"
              value={senderBank}
              onChange={(e) => setSenderBank(e.target.value)}
              placeholder="e.g. EasyPaisa, JazzCash, SadaPay"
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-zinc-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
            />
          </div>
        </div>

        {/* Row 2: Account Title & Last 4 Digits */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-emerald-500" />
              <span>{t('Sender Account Title (Name)')}</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={accountTitle}
              onChange={(e) => setAccountTitle(e.target.value)}
              placeholder="e.g. Muhammad Ali"
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-zinc-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-emerald-500" />
              <span>{t('Account Number (Last 4 Digits)')}</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              maxLength={4}
              value={accountNumberLast4}
              onChange={(e) => setAccountNumberLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="e.g. 6423"
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm font-semibold font-mono text-zinc-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
            />
          </div>
        </div>

        {/* Row 3: Calendar Date & Time Picker */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-500" />
              <span>{t('Payment Date')}</span>
              <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-zinc-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-500" />
              <span>{t('Payment Time')}</span>
              <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="time"
                value={paymentTime}
                onChange={(e) => setPaymentTime(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-zinc-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Action Button with Real-time AI Verification Status */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleSubmitAndVerify}
          disabled={disabled || isSubmitting || isScanningScreenshot}
          className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-50 shadow-xl shadow-emerald-500/20 text-sm sm:text-base cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>
                {verificationStep === 'gmail_match' 
                  ? 'AI verifying transaction securely with bank...' 
                  : 'Processing Order...'}
              </span>
            </>
          ) : (
            <>
              <Zap className="w-5 h-5 text-amber-300 fill-amber-300" />
              <span>{verificationAttempt >= 3 ? t('Submit for Manual Verification') : t('Confirm Order & Verify with AI')}</span>
            </>
          )}
        </button>

        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          ⚡ {t('Orders matching bank receipts are approved immediately by AI.')}
        </p>
      </div>

      <AlertModal
        isOpen={alertConfig.isOpen}
        onClose={() => setAlertConfig((prev) => ({ ...prev, isOpen: false }))}
        title={alertConfig.title}
        message={alertConfig.message}
      />
    </div>
  );
}
