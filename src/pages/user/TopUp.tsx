import React, { useState, useEffect } from 'react';
import { useAuth, standardizePhone } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ArrowLeft, Copy, Check, Send, Loader2, Wallet, Smartphone, CreditCard, Banknote } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import AlertModal from '../../components/AlertModal';


import { motion } from 'framer-motion';
import PreviousOrders from '../../components/PreviousOrders';

import PaymentMethods from '../../components/PaymentMethods';

import { useSettings } from '../../contexts/SettingsContext';

export default function TopUp() {
  const { profile, updateUserProfileData } = useAuth();
  const { language, t } = useLanguage();
  const [whatsappNumber, setWhatsappNumber] = useState(profile?.phone || '');
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [months, setMonths] = useState(1);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [pendingMembershipOrder, setPendingMembershipOrder] = useState<any>(null);
  const [isCheckingPendingOrder, setIsCheckingPendingOrder] = useState(true);
  const [alertConfig, setAlertConfig] = useState<{isOpen: boolean; title: string; message: string;}>({ isOpen: false, title: '', message: '' });

  useEffect(() => {
    const checkPendingOrder = async () => {
      if (!profile?.uid) {
        setIsCheckingPendingOrder(false);
        return;
      }
      const pOrder = profile.orders?.find(o => o.status === 'pending' && o.type === 'membership');
      if (pOrder) {
        setPendingMembershipOrder(pOrder);
        setOrderId(pOrder.id);
        setConfirmed(true);
      }
      setIsCheckingPendingOrder(false);
    };
    checkPendingOrder();
  }, [profile?.orders, profile?.uid]);

  const isExtend = location.state?.isExtend;
  const isExpired = profile?.status === 'expired';

  const actionText = isExtend ? 'Extend' : (isExpired && profile?.role === 'user' ? 'Renew' : 'Get');

  const handleCopy = () => {
    navigator.clipboard.writeText(settings?.accountNumber || '03416286423');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

    const handleConfirm = async (): Promise<string | null> => {
    if (!profile) return null;
    if (!whatsappNumber || whatsappNumber.length < 10) {
      setAlertConfig({isOpen: true, title: t('Invalid Phone Number'), message: t('Please enter a valid WhatsApp number')});
      return null;
    }
    setLoading(true);
    try {
      const newOrderId = Math.floor(10000000 + Math.random() * 90000000).toString();

      const orderData = {
        id: newOrderId,
        userId: profile.uid,
        userName: profile.displayName || 'Unknown',
        userEmail: profile.email,
        userRole: profile.role,
        type: 'membership',
        amount: months * (settings?.membershipFee || 200),
        months,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      const { safeStorage } = await import('../../utils/safeStorage');
      const pendingOrdersStr = safeStorage.getItem("pending_orders_array") || "[]";
      const pendingOrders = JSON.parse(pendingOrdersStr);
      pendingOrders.push(orderData);
      safeStorage.setItem("pending_orders_array", JSON.stringify(pendingOrders));
      safeStorage.setItem("needs_user_sync", "true");

      await updateUserProfileData({ phone: whatsappNumber }, undefined, true);

      setOrderId(newOrderId);
      setConfirmed(true);
      return newOrderId;
    } catch (error) {
      console.error('Error creating order:', error);
      setAlertConfig({isOpen: true, title: t('Error'), message: t('Failed to create order. Please try again.')});
      return null;
    } finally {
      setLoading(false);
    }
  };

    const handleSendPaymentScreenshot = async () => {
    if (!profile) return;
    
    setLoading(true);
    try {
      let currentOrderId = orderId;
      if (!confirmed) {
          currentOrderId = await handleConfirm();
          if (!currentOrderId) { setLoading(false); return; }
      }
      
      const orders = profile.orders || [];
      const lastOrder = orders.length > 0 ? [...orders].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] : null;

      const message = `${t("Assalam O Alaikum! Admin")},\n\n${t("Name")}: ${profile?.displayName || t("Unknown")}\n${t("Email")}: ${profile?.email || "N/A"}\n${t("Phone")}: ${whatsappNumber || profile?.phone || "N/A"}\n${t("Role & Status")}: ${String(profile?.role || t("Unknown")).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}, ${String(profile?.status || t("Unknown")).replace(/\b\w/g, c => c.toUpperCase())}\n\n${t("Your message/question:")}\n${t("Please approve my membership top-up. Order ID:")} ${currentOrderId}\n${t("Months:")} ${lastOrder?.months || months}\n${t("Amount: Rs")} ${lastOrder?.amount || months * (settings?.membershipFee || 200)}`;
      
      const adminPhone = standardizePhone(settings?.supportNumber || '3363284466').replace('+', '');
      const whatsappUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(message)}`;
      
      window.open(whatsappUrl, '_blank');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white p-4 md:p-8 transition-colors duration-300"
    >
      <div className="max-w-md mx-auto">
        <button onClick={() => navigate('/')} className="flex items-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white mb-6 transition-all active:scale-95">
          <ArrowLeft className="w-5 h-5 mr-2" />
          {t('Back to Home')}
        </button>

        <h1 className="text-2xl font-bold mb-6">{t('Top Up Membership')}</h1>

        {isCheckingPendingOrder ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : pendingMembershipOrder ? (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-xl mb-6">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">
              {t('You have already a Pending Membership Order. Send Payment Screenshot OR Cancel it for New Order')}
            </p>
          </div>
        ) : (
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">{t('Membership Details')}</h2>
            <div className="flex items-center justify-between mb-4">
              <span>{t('Duration (Months)')}</span>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setMonths(Math.max(1, months - 1))}
                  className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-zinc-300 dark:hover:bg-zinc-700"
                >
                  -
                </button>
                <span className="text-xl font-bold">{months}</span>
                <button 
                  onClick={() => setMonths(months + 1)}
                  className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-zinc-300 dark:hover:bg-zinc-700"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center border-t border-zinc-200 dark:border-zinc-800 pt-4 mt-4">
              <span className="text-zinc-500 dark:text-zinc-400">{t('Total Amount')}</span>
              <span className="text-2xl font-bold text-red-500">Rs {months * (settings?.membershipFee || 200)}</span>
            </div>
          </div>
        )}

                {!profile?.phone && (
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-6 mb-6 shadow-2xl border border-zinc-200 dark:border-zinc-800/50">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-500" />
              {t('WhatsApp Number')}
            </h2>
            <input
              type="tel"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="e.g. 03001234567"
              className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none"
            />
          </div>
        )}

{settings?.isPaymentEnabled !== false && (
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-6 mb-6 shadow-2xl border border-zinc-200 dark:border-zinc-800/50">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-500" />
              {t('Payment Details')}
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-6 text-sm">
              {t('Please send the payment to the following account via any of these methods:')}
            </p>
            
            <PaymentMethods copied={copied} onCopy={handleCopy} />
          </div>
        )}

        <div className="text-center mb-6">
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">
            {settings?.isPaymentEnabled !== false ? t('After Payment Send Screenshot for Approval') : t('Submit your request for approval')}
          </p>
        </div>

        <button
          onClick={handleConfirm}
          disabled={loading || confirmed || !!pendingMembershipOrder}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 border border-white/20 shadow-lg mb-4"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : confirmed ? t('Confirmed') : t('Confirm Order')}
        </button>

        {settings?.isAdminContactEnabled !== false && (
          <button
            onClick={handleSendPaymentScreenshot}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 border border-white/20 shadow-lg"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            {loading ? t('Processing...') : (settings?.isPaymentEnabled !== false ? t('Send Payment Screenshot') : t('Contact Admin'))}
          </button>
        )}

        <PreviousOrders />
      </div>

      <AlertModal
        isOpen={alertConfig.isOpen}
        onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
        title={alertConfig.title}
        message={alertConfig.message}
      />
    </motion.div>
  );
}
