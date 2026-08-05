import React, { useState, useEffect } from 'react';
import { useAuth, standardizePhone } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ArrowLeft, Copy, Check, Send, Loader2, Wallet, Smartphone, CreditCard, Banknote, Sparkles, CheckCircle2, Plus, Minus, Clock, Zap, Crown, Gem, ShieldCheck, Flame } from 'lucide-react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import AlertModal from '../../components/AlertModal';
import { NotificationMenu } from '../../components/NotificationMenu';
import { UserProfileMenu } from '../../components/UserProfileMenu';
import { CartButton } from '../../components/CartButton';
import { AdminButtons } from '../../components/AdminButtons';

import { motion } from 'framer-motion';
import PreviousOrders from '../../components/PreviousOrders';

import PaymentMethods from '../../components/PaymentMethods';

import { useSettings } from '../../contexts/SettingsContext';

const MEMBERSHIP_PLANS = [
  { id: '1m', name: '1 Month', months: 1, price: 300, perMonth: 300, headerBadge: '', saveBadge: '', popular: false, icon: Zap },
  { id: '3m', name: '3 Months', months: 3, price: 750, perMonth: 250, headerBadge: '', saveBadge: 'Save 17%', popular: false, icon: Sparkles },
  { id: '6m', name: '6 Months', months: 6, price: 1400, perMonth: 233, headerBadge: '', saveBadge: 'Save 22%', popular: false, icon: ShieldCheck },
  { id: '1y', name: '1 Year', months: 12, price: 2600, perMonth: 216, headerBadge: '🔥 Most Popular', saveBadge: 'Save 28%', popular: true, icon: Crown },
  { id: '2y', name: '2 Years', months: 24, price: 4000, perMonth: 166, headerBadge: '👑 Mega VIP', saveBadge: 'Save 44%', popular: false, icon: Gem },
];

export default function TopUp() {
  const { profile, updateUserProfileData } = useAuth();
  const { language, t } = useLanguage();
  const [whatsappNumber, setWhatsappNumber] = useState(profile?.phone || '');
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedPlanId, setSelectedPlanId] = useState('1m');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [pendingMembershipOrder, setPendingMembershipOrder] = useState<any>(null);
  const [isCheckingPendingOrder, setIsCheckingPendingOrder] = useState(true);
  const [alertConfig, setAlertConfig] = useState<{isOpen: boolean; title: string; message: string;}>({ isOpen: false, title: '', message: '' });

  const activePlan = MEMBERSHIP_PLANS.find(p => p.id === selectedPlanId) || MEMBERSHIP_PLANS[0];

  useEffect(() => {
    const statePlan = location.state?.planId;
    const searchParams = new URLSearchParams(location.search);
    const queryPlan = searchParams.get('plan');
    const targetPlan = statePlan || queryPlan;
    if (targetPlan && MEMBERSHIP_PLANS.some(p => p.id === targetPlan)) {
      setSelectedPlanId(targetPlan);
    }
  }, [location]);

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
        amount: activePlan.price,
        months: activePlan.months,
        planName: activePlan.name,
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

      const planLabel = lastOrder?.planName || activePlan.name;
      const planMonths = lastOrder?.months || activePlan.months;
      const planAmount = lastOrder?.amount || activePlan.price;

      const message = `${t("Assalam O Alaikum! Admin")},\n\n${t("Name")}: ${profile?.displayName || t("Unknown")}\n${t("Email")}: ${profile?.email || "N/A"}\n${t("Phone")}: ${whatsappNumber || profile?.phone || "N/A"}\n${t("Role & Status")}: ${String(profile?.role || t("Unknown")).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}, ${String(profile?.status || t("Unknown")).replace(/\b\w/g, c => c.toUpperCase())}\n\n${t("Your message/question:")}\n${t("Please approve my membership top-up. Order ID:")} ${currentOrderId}\n${t("Plan:")} ${planLabel}\n${t("Duration:")} ${planMonths} ${t("Months")}\n${t("Amount: Rs")} ${planAmount}`;
      
      const adminPhone = standardizePhone(settings?.supportNumber || '3363284466').replace('+', '');
      const whatsappUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(message)}`;
      
      window.open(whatsappUrl, '_blank');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col transition-colors duration-300">
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 transition-colors duration-300">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/')} 
              className="p-2 -ml-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-all active:scale-95 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
                <Wallet className="w-4 h-4" />
              </div>
              <h1 className="text-lg font-extrabold text-zinc-900 dark:text-white">{t('Top Up Membership')}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationMenu />
            <AdminButtons profile={profile} />
            <CartButton />
            <UserProfileMenu />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        {/* Banner */}
        <div className="relative mb-6 rounded-3xl overflow-hidden bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 p-6 text-white shadow-xl shadow-emerald-500/10">
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-bold tracking-wider uppercase mb-2 text-emerald-100">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('Instant Membership Access')}</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight">{actionText} {t('Your Subscription')}</h2>
            <p className="text-emerald-100/90 text-xs sm:text-sm mt-1 max-w-md font-medium">
              {t('Select your plan duration, send payment, and submit for instant verification.')}
            </p>
          </div>
        </div>

        {isCheckingPendingOrder ? (
          <div className="flex justify-center items-center h-40 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : pendingMembershipOrder ? (
          <div className="bg-amber-500/10 border border-amber-500/20 p-5 rounded-3xl mb-6 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-extrabold text-sm text-amber-700 dark:text-amber-300">{t('Pending Order Active')}</h4>
              <p className="text-amber-800/90 dark:text-amber-200/90 text-xs mt-0.5 font-medium leading-relaxed">
                {t('You already have a Pending Membership Order. Send payment screenshot or cancel it to place a new order.')}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 mb-6 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-black flex items-center gap-2 text-zinc-900 dark:text-white">
                <Crown className="w-5 h-5 text-amber-500 fill-amber-500/20" />
                <span>{t('Membership Plans')}</span>
              </h2>
              <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {activePlan.name}
              </span>
            </div>

            <div className="space-y-3.5 mb-6">
              {MEMBERSHIP_PLANS.map((plan) => {
                const isSelected = selectedPlanId === plan.id;
                const PlanIcon = plan.icon;
                const is1Y = plan.id === '1y';
                const is2Y = plan.id === '2y';

                let cardStyle = 'bg-zinc-50/80 dark:bg-zinc-950/60 border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700';
                if (isSelected) {
                  if (is2Y) {
                    cardStyle = 'bg-gradient-to-r from-rose-950/50 via-purple-950/60 to-amber-950/40 border-purple-500 ring-2 ring-purple-500/40 shadow-xl shadow-purple-500/20';
                  } else if (is1Y) {
                    cardStyle = 'bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 dark:from-amber-950/50 dark:via-orange-950/40 dark:to-amber-950/30 border-amber-500 ring-2 ring-amber-500/40 shadow-lg shadow-amber-500/20';
                  } else {
                    cardStyle = 'bg-gradient-to-r from-emerald-50 via-teal-50/50 to-emerald-50/20 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-emerald-950/20 border-emerald-500 ring-2 ring-emerald-500/30 shadow-md shadow-emerald-500/10';
                  }
                } else {
                  if (is2Y) {
                    cardStyle = 'bg-gradient-to-r from-rose-500/5 via-purple-500/10 to-amber-500/5 dark:bg-purple-950/20 border-transparent shadow-sm';
                  } else if (is1Y) {
                    cardStyle = 'bg-amber-500/5 dark:bg-amber-950/20 border-transparent shadow-sm';
                  }
                }

                let iconBoxStyle = 'bg-zinc-200/70 dark:bg-zinc-800/70 text-zinc-500 dark:text-zinc-400';
                if (isSelected || is1Y || is2Y) {
                  if (is2Y) {
                    iconBoxStyle = 'bg-gradient-to-tr from-rose-600 via-purple-600 to-amber-500 text-white shadow-md shadow-purple-500/30';
                  } else if (is1Y) {
                    iconBoxStyle = 'bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/30';
                  } else {
                    iconBoxStyle = 'bg-gradient-to-tr from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/25';
                  }
                }

                let badgeStyle = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
                if (is2Y) {
                  badgeStyle = 'bg-gradient-to-r from-rose-600 via-purple-600 to-amber-500 text-white font-black border-0 shadow-md shadow-purple-500/25';
                } else if (is1Y) {
                  badgeStyle = 'bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black border-0 shadow-sm shadow-amber-500/25';
                }

                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`relative w-full text-left p-3.5 sm:p-4 rounded-2xl border transition-all active:scale-[0.99] cursor-pointer ${cardStyle}`}
                  >
                    <div className="flex items-center justify-between gap-2.5 sm:gap-3">
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                        {/* Icon Box */}
                        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 transition-all ${iconBoxStyle}`}>
                          <PlanIcon className="w-5 h-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          {/* Row 1: Plan Title + Header Tag (Most Popular / Mega VIP next to 1 Year / 2 Years) */}
                          <div className="flex items-center gap-1.5 min-w-0 flex-nowrap">
                            <span className="font-black text-sm sm:text-base text-zinc-900 dark:text-white whitespace-nowrap">
                              {plan.name}
                            </span>
                            {plan.headerBadge && (
                              <span className={`text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-full inline-flex items-center uppercase tracking-wider shrink-0 shadow-sm ${
                                is2Y
                                  ? 'bg-gradient-to-r from-rose-600 via-purple-600 to-amber-500 text-white'
                                  : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                              }`}>
                                {plan.headerBadge}
                              </span>
                            )}
                          </div>

                          {/* Row 2: Subtext: Per month price */}
                          <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mt-0.5">
                            Rs. {plan.perMonth} <span className="text-[10px] font-normal">/ {t('month')}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 ml-auto">
                        <div className="text-right flex flex-col items-end">
                          <span className={`text-sm sm:text-base font-black block whitespace-nowrap ${
                            is2Y
                              ? 'text-purple-600 dark:text-purple-300'
                              : is1Y
                              ? 'text-amber-600 dark:text-amber-400'
                              : isSelected
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-zinc-900 dark:text-white'
                          }`}>
                            Rs. {plan.price.toLocaleString()}
                          </span>
                          {plan.saveBadge && (
                            <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap mt-0.5 inline-block ${
                              is2Y
                                ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30'
                                : is1Y
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            }`}>
                              {plan.saveBadge}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between items-center border-t border-zinc-200/80 dark:border-zinc-800/80 pt-4">
              <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">{t('Total Amount')}</span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">Rs. {activePlan.price.toLocaleString()}</span>
            </div>
          </div>
        )}

        {!profile?.phone && (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 mb-6 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm">
            <h2 className="text-base font-extrabold mb-3 flex items-center gap-2 text-zinc-900 dark:text-white">
              <Smartphone className="w-4 h-4 text-emerald-500" />
              {t('WhatsApp Number')}
            </h2>
            <input
              type="tel"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="e.g. 03001234567"
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
            />
          </div>
        )}

        {settings?.isPaymentEnabled !== false && (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 mb-6 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm">
            <h2 className="text-base font-extrabold mb-2 flex items-center gap-2 text-zinc-900 dark:text-white">
              <Wallet className="w-4 h-4 text-emerald-500" />
              {t('Payment Details')}
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-5 text-xs font-medium">
              {t('Please send the payment to the following account via any of these methods:')}
            </p>
            
            <PaymentMethods copied={copied} onCopy={handleCopy} />
          </div>
        )}

        <div className="text-center mb-6">
          <p className="text-zinc-500 dark:text-zinc-400 text-xs font-medium">
            {settings?.isPaymentEnabled !== false ? t('After Payment Send Screenshot for Approval') : t('Submit your request for approval')}
          </p>
        </div>

        <div className="space-y-3 mb-8">
          <button
            onClick={handleConfirm}
            disabled={loading || confirmed || !!pendingMembershipOrder}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50 shadow-lg shadow-blue-500/20 text-sm cursor-pointer"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : confirmed ? <CheckCircle2 className="w-5 h-5" /> : null}
            <span>{loading ? t('Processing...') : confirmed ? t('Order Confirmed') : t('Confirm Order')}</span>
          </button>

          {settings?.isAdminContactEnabled !== false && (
            <button
              onClick={handleSendPaymentScreenshot}
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50 shadow-lg shadow-emerald-500/20 text-sm cursor-pointer"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              <span>{loading ? t('Processing...') : (settings?.isPaymentEnabled !== false ? t('Send Payment Screenshot') : t('Contact Admin'))}</span>
            </button>
          )}
        </div>

        <PreviousOrders />
      </main>

      <AlertModal
        isOpen={alertConfig.isOpen}
        onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
        title={alertConfig.title}
        message={alertConfig.message}
      />
    </div>
  );
}
