import React, { useState, useEffect } from 'react';
import { useAuth, standardizePhone } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ArrowLeft, Copy, Check, Send, Loader2, Wallet, Smartphone, CreditCard, Banknote, Sparkles, CheckCircle2, Plus, Minus, Clock, Zap, Crown, Gem, ShieldCheck, Flame, PartyPopper } from 'lucide-react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import AlertModal from '../../components/AlertModal';
import { NotificationMenu } from '../../components/NotificationMenu';
import { UserProfileMenu } from '../../components/UserProfileMenu';
import { CartButton } from '../../components/CartButton';
import { AdminButtons } from '../../components/AdminButtons';
import PaymentVerificationForm from '../../components/PaymentVerificationForm';

import { motion, AnimatePresence } from 'framer-motion';
import PreviousOrders from '../../components/PreviousOrders';

import PaymentMethods from '../../components/PaymentMethods';

import { useSettings } from '../../contexts/SettingsContext';

import { Role } from '../../types';

const VIP_PLANS = [
  { id: '1m', name: '1 Month (VIP Ad-Free)', months: 1, price: 300, perMonth: 300, planRole: 'vip' as Role, headerBadge: '', saveBadge: '', popular: false, icon: Zap },
  { id: '3m', name: '3 Months (VIP Ad-Free)', months: 3, price: 750, perMonth: 250, planRole: 'vip' as Role, headerBadge: '', saveBadge: 'Save 17%', popular: false, icon: Sparkles },
  { id: '6m', name: '6 Months (VIP Ad-Free)', months: 6, price: 1400, perMonth: 233, planRole: 'vip' as Role, headerBadge: '', saveBadge: 'Save 22%', popular: false, icon: ShieldCheck },
  { id: '1y', name: '1 Year (VIP Ad-Free)', months: 12, price: 2600, perMonth: 216, planRole: 'vip' as Role, headerBadge: '🔥 Most Popular', saveBadge: 'Save 28%', popular: true, icon: Crown },
  { id: '2y', name: '2 Years (VIP Ad-Free)', months: 24, price: 4000, perMonth: 166, planRole: 'vip' as Role, headerBadge: '👑 Mega VIP', saveBadge: 'Save 44%', popular: false, icon: Gem },
];

const BASIC_PLANS = [
  { id: 'basic_1m', name: '1 Month (Basic With Ads)', months: 1, price: 50, perMonth: 50, planRole: 'basic' as Role, headerBadge: '📺 Rs 50/mo', saveBadge: 'With Ads', popular: true, icon: Zap },
  { id: 'basic_3m', name: '3 Months (Basic With Ads)', months: 3, price: 140, perMonth: 46, planRole: 'basic' as Role, headerBadge: '', saveBadge: 'Save 7%', popular: false, icon: Sparkles },
  { id: 'basic_6m', name: '6 Months (Basic With Ads)', months: 6, price: 260, perMonth: 43, planRole: 'basic' as Role, headerBadge: '', saveBadge: 'Save 13%', popular: false, icon: ShieldCheck },
  { id: 'basic_1y', name: '1 Year (Basic With Ads)', months: 12, price: 500, perMonth: 41, planRole: 'basic' as Role, headerBadge: '🔥 Best Value', saveBadge: 'Save 17%', popular: false, icon: Crown },
];

const ALL_MEMBERSHIP_PLANS = [...VIP_PLANS, ...BASIC_PLANS];

export default function TopUp() {
  const { profile, updateUserProfileData, refreshProfile } = useAuth();
  const { language, t } = useLanguage();
  const [whatsappNumber, setWhatsappNumber] = useState(profile?.phone || '');
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedTier, setSelectedTier] = useState<'vip' | 'basic'>('vip');
  const [selectedPlanId, setSelectedPlanId] = useState('1m');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<any>(null);
  const [wasAutoApproved, setWasAutoApproved] = useState(false);
  const [pendingMembershipOrder, setPendingMembershipOrder] = useState<any>(null);
  const [isCheckingPendingOrder, setIsCheckingPendingOrder] = useState(true);
  const [alertConfig, setAlertConfig] = useState<{isOpen: boolean; title: string; message: string;}>({ isOpen: false, title: '', message: '' });

  const currentPlans = selectedTier === 'vip' ? VIP_PLANS : BASIC_PLANS;
  const activePlan = ALL_MEMBERSHIP_PLANS.find(p => p.id === selectedPlanId) || currentPlans[0];

  useEffect(() => {
    const statePlan = location.state?.planId;
    const searchParams = new URLSearchParams(location.search);
    const queryPlan = searchParams.get('plan');
    const targetPlan = statePlan || queryPlan;
    if (targetPlan && ALL_MEMBERSHIP_PLANS.some(p => p.id === targetPlan)) {
      setSelectedPlanId(targetPlan);
      if (BASIC_PLANS.some(p => p.id === targetPlan)) {
        setSelectedTier('basic');
      } else {
        setSelectedTier('vip');
      }
    }
  }, [location]);

  useEffect(() => {
    refreshProfile(true);
  }, [refreshProfile]);

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
      } else {
        setPendingMembershipOrder(null);
        setConfirmed(false);
      }
      setIsCheckingPendingOrder(false);
    };
    checkPendingOrder();
  }, [profile?.orders, profile?.uid]);

  const isExtend = location.state?.isExtend;
  const isExpired = profile?.status === 'expired';

  const actionText = isExtend ? 'Extend' : (isExpired && profile?.role === 'user' ? 'Renew' : 'Get');

  const handleOrderFinished = (order: any, isAutoApproved: boolean) => {
    setCompletedOrder(order);
    setWasAutoApproved(isAutoApproved);
    setOrderId(order.id);
    setConfirmed(true);
    if (!isAutoApproved) {
      setPendingMembershipOrder(order);
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
              {t('Select your plan duration, send payment, and submit for instant AI auto-approval.')}
            </p>
          </div>
        </div>

        {/* Completion Celebration Card */}
        {completedOrder && wasAutoApproved && (
          <div className="bg-emerald-500/10 border-2 border-emerald-500/40 p-6 rounded-3xl mb-6 text-center space-y-4 shadow-xl">
            <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs uppercase tracking-wider mb-2">
                ⚡ AI Auto-Approved
              </span>
              <h3 className="text-2xl font-black text-zinc-900 dark:text-white">
                🎉 Order Approved Instantly!
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1 max-w-md mx-auto">
                Your payment was verified securely with the bank. Your {activePlan.name} membership is now active!
              </p>
            </div>
            <div className="p-3 bg-white/80 dark:bg-black/40 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-600 dark:text-zinc-300 flex items-center justify-between">
              <span>Order #{completedOrder.id}</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">Rs. {completedOrder.amount}</span>
            </div>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-extrabold py-3.5 rounded-2xl shadow-lg shadow-emerald-500/20 text-sm cursor-pointer"
            >
              Start Watching Now 🍿
            </button>
          </div>
        )}

        {isCheckingPendingOrder ? (
          <div className="flex justify-center items-center h-40 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : pendingMembershipOrder && !wasAutoApproved ? (
          <div className="bg-amber-500/10 border border-amber-500/20 p-5 rounded-3xl mb-6 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-extrabold text-sm text-amber-700 dark:text-amber-300">{t('Pending Order Active')}</h4>
              <p className="text-amber-800/90 dark:text-amber-200/90 text-xs mt-0.5 font-medium leading-relaxed">
                Order #{pendingMembershipOrder.id} ({pendingMembershipOrder.planName || 'Membership'}) is pending admin review.
              </p>
            </div>
          </div>
        ) : !wasAutoApproved && (
          <>
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 mb-6 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-black flex items-center gap-2 text-zinc-900 dark:text-white">
                  <Crown className="w-5 h-5 text-amber-500 fill-amber-500/20" />
                  <span>{t('Membership Plans')}</span>
                </h2>
                <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {activePlan.name}
                </span>
              </div>

              {/* Plan Tier Switcher: VIP Ad-Free vs Basic With Ads */}
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-zinc-100/80 dark:bg-zinc-950/80 rounded-2xl mb-5 border border-zinc-200/80 dark:border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTier('vip');
                    if (!VIP_PLANS.some(p => p.id === selectedPlanId)) {
                      setSelectedPlanId('1m');
                    }
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-black text-xs sm:text-sm transition-all cursor-pointer ${
                    selectedTier === 'vip'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <Crown className="w-4 h-4" />
                  <span>VIP User (Ad-Free)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTier('basic');
                    if (!BASIC_PLANS.some(p => p.id === selectedPlanId)) {
                      setSelectedPlanId('basic_1m');
                    }
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-black text-xs sm:text-sm transition-all cursor-pointer ${
                    selectedTier === 'basic'
                      ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  <span>Basic User (Rs 50/mo)</span>
                </button>
              </div>

              <div className="space-y-3.5 mb-6">
                {currentPlans.map((plan) => {
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

                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`relative w-full text-left p-3.5 sm:p-4 rounded-2xl border transition-all active:scale-[0.99] cursor-pointer ${cardStyle}`}
                    >
                      <div className="flex items-center gap-2.5 sm:gap-3">
                        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 transition-all ${iconBoxStyle}`}>
                          <PlanIcon className="w-5 h-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                              <span className="font-black text-sm sm:text-base text-zinc-900 dark:text-white">
                                {plan.name}
                              </span>
                              {plan.headerBadge && (
                                <span className="text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-full inline-flex items-center uppercase tracking-wider shrink-0 shadow-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                                  {plan.headerBadge}
                                </span>
                              )}
                            </div>

                            <span className="text-sm sm:text-base font-black shrink-0 whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                              Rs. {plan.price.toLocaleString()}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                              Rs. {plan.perMonth} <span className="text-[10px] font-normal">/ {t('month')}</span>
                            </p>
                            {plan.saveBadge && (
                              <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap inline-flex items-center bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
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

            {/* Payment & Verification Form with Gemini AI Auto-Approval */}
            <PaymentVerificationForm
              orderType="membership"
              amount={activePlan.price}
              planName={activePlan.name}
              planRole={activePlan.planRole}
              months={activePlan.months}
              onOrderCompleted={handleOrderFinished}
            />
          </>
        )}

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
