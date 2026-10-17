import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown,
  Zap,
  Sparkles,
  ShieldCheck,
  Gem,
  X,
  ArrowRight,
  ChevronRight,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isStaffMember } from '../utils/roleUtils';
import { VIP_PLANS, BASIC_PLANS, formatPrice, MembershipPlan } from '../data/membershipPlans';
import {
  modalBackdropAnimation,
  modalContainerAnimation,
  modalGpuStyle,
} from '../utils/modalAnimations';

export const MembershipReminderBanner: React.FC = () => {
  const { profile, user, loading, authLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedTier, setSelectedTier] = useState<'vip' | 'basic'>('vip');
  const [isDismissed, setIsDismissed] = useState(false);
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  // Check if session dismissed for banner
  useEffect(() => {
    const dismissedSession = sessionStorage.getItem('membership_reminder_dismissed');
    if (dismissedSession === 'true') {
      setIsDismissed(true);
    }
  }, []);

  // Determine membership eligibility
  const isRoleMember = profile?.role === 'vip' || profile?.role === 'basic' || profile?.role === 'trial';
  const isStatusActive = profile?.status === 'active';
  const isExpiredByDate = profile?.expiryDate ? new Date(profile.expiryDate).getTime() < Date.now() : false;
  const hasActiveMembership = isRoleMember && isStatusActive && !isExpiredByDate;

  const isStaff = isStaffMember(profile, user);
  const isTrial = profile?.role === 'trial' || Boolean((profile as any)?.trialActivated);
  const isExpired = profile?.status === 'expired' || isExpiredByDate;
  const isTrialExpired = isTrial && (isExpired || !hasActiveMembership);
  const isMembershipExpired = !isTrial && isExpired;
  const isPending = profile?.status === 'pending';

  // Timed pop-up modal after 5000ms - 8000ms on app mount (using 6000ms) - shows every time app opens
  useEffect(() => {
    // Wait until auth resolution completes
    if (loading || authLoading) return;

    // Only for logged-in non-active non-staff users
    if (!profile || !profile.uid || hasActiveMembership || isStaff) return;

    const timer = setTimeout(() => {
      const currentPath = window.location.pathname;
      const excluded =
        currentPath.startsWith('/admin') ||
        currentPath === '/login' ||
        currentPath === '/top-up' ||
        currentPath === '/maintenance' ||
        currentPath === '/install' ||
        currentPath === '/app' ||
        currentPath === '/unsubscribe';

      if (!excluded) {
        setIsPopupOpen(true);
      }
    }, 6000);

    return () => clearTimeout(timer);
  }, [profile, hasActiveMembership, isStaff, loading, authLoading]);

  // Do not show banner on specific pages where it would interfere
  const pathname = location.pathname;
  if (
    pathname.startsWith('/admin') ||
    pathname === '/login' ||
    pathname === '/top-up' ||
    pathname === '/maintenance' ||
    pathname === '/install' ||
    pathname === '/app'
  ) {
    return null;
  }

  // Prevent flicker during initial auth loading
  if (loading || authLoading) {
    return null;
  }

  // Only show for logged in users
  if (!profile || !profile.uid) {
    return null;
  }

  // Do not show for staff / admin users
  if (isStaff) {
    return null;
  }

  // If user already has an active membership, do not show reminder
  if (hasActiveMembership) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('membership_reminder_dismissed', 'true');
  };

  const handleReopen = () => {
    setIsDismissed(false);
    sessionStorage.removeItem('membership_reminder_dismissed');
  };

  const handleClosePopup = () => {
    setIsPopupOpen(false);
  };

  const handleSelectPlan = (plan: MembershipPlan) => {
    setIsPopupOpen(false);
    navigate('/top-up', {
      state: {
        planId: plan.id,
        tier: plan.planRole,
        isExtend: false,
      },
    });
  };

  const currentPlans = selectedTier === 'vip' ? VIP_PLANS : BASIC_PLANS;

  return (
    <>
      {/* 1. TOP BANNER OR COLLAPSED FLOATING PILL */}
      {isDismissed ? (
        <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-[999]">
          <button
            onClick={handleReopen}
            className="group flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold text-xs sm:text-sm shadow-xl shadow-amber-500/25 ring-2 ring-amber-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <Crown className="w-4 h-4 text-zinc-950 animate-bounce" />
            <span>
              {isTrialExpired
                ? t('Your Trial expired renew now')
                : isMembershipExpired
                ? t('Your membership expired')
                : t('Buy Membership')}
            </span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="relative z-30 w-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 border-b border-amber-500/30 text-white shadow-2xl overflow-hidden"
          >
            {/* Ambient Top Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-gradient-to-r from-amber-500/15 via-emerald-500/15 to-amber-500/15 blur-3xl pointer-events-none" />

            <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3.5 sm:py-5">
              {/* Header Row: Status badge, Title & Dismiss */}
              <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4">
                <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 shadow-lg shadow-amber-500/10">
                    {isExpired ? <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5" /> : <Crown className="w-4 h-4 sm:w-5 sm:h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-md border ${
                          isTrialExpired
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                            : isMembershipExpired
                            ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                            : isPending
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                            : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        }`}
                      >
                        {isTrialExpired
                          ? t('Trial Expired')
                          : isMembershipExpired
                          ? t('Membership Expired')
                          : isPending
                          ? t('Pending Activation')
                          : t('Membership Reminder')}
                      </span>
                      <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                        {isTrialExpired
                          ? t('Your Trial expired renew now')
                          : isMembershipExpired
                          ? t('Your membership expired')
                          : isPending
                          ? t('Activate your account with a VIP or Basic pass')
                          : t('Get a Membership Pass to unlock movies & series')}
                      </h3>
                    </div>
                    <p className="text-xs text-zinc-400 hidden sm:block mt-0.5">
                      {isTrialExpired
                        ? t('Your free Trial has expired. Please get Membership to continue watching.')
                        : isMembershipExpired
                        ? t('Your membership has expired. Please renew to continue watching.')
                        : t('Choose between full-access VIP (with offline WhatsApp group & HD streaming) or budget-friendly Basic plan.')}
                    </p>
                  </div>
                </div>

                {/* Actions: View Details & Dismiss */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <button
                    onClick={() => navigate('/membership')}
                    className="hidden md:inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 hover:text-white transition-colors"
                  >
                    <span>{t('View All Benefits')}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="p-1.5 sm:p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
                    title={t('Close')}
                    aria-label={t('Close')}
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>
              </div>

              {/* Tier Tabs: VIP vs Basic */}
              <div className="flex items-center justify-between gap-3 mb-3 sm:mb-4">
                <div className="inline-flex p-1 rounded-xl bg-zinc-900 border border-zinc-800/90 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setSelectedTier('vip')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                      selectedTier === 'vip'
                        ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 shadow-md shadow-amber-500/20'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>VIP Plans (5)</span>
                    <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-black/20">All-Inclusive</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTier('basic')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                      selectedTier === 'basic'
                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/20'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Basic Plans (4)</span>
                    <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-black/20">From Rs 100</span>
                  </button>
                </div>

                <button
                  onClick={() => navigate('/membership')}
                  className="md:hidden text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1"
                >
                  <span>{t('All Benefits')}</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              {/* Plans Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 overflow-x-auto pb-1">
                {currentPlans.map((plan) => {
                  const Icon = plan.icon;
                  const isVipTier = plan.planRole === 'vip';

                  return (
                    <div
                      key={plan.id}
                      onClick={() => handleSelectPlan(plan)}
                      className={`group relative flex flex-col justify-between p-3 sm:p-3.5 rounded-xl cursor-pointer border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                        plan.popular
                          ? isVipTier
                            ? 'bg-gradient-to-b from-amber-500/15 via-zinc-900 to-zinc-900 border-amber-500/50 shadow-lg shadow-amber-500/10'
                            : 'bg-gradient-to-b from-emerald-500/15 via-zinc-900 to-zinc-900 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                          : 'bg-zinc-900/80 hover:bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      {/* Top Header Badge */}
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isVipTier
                              ? 'bg-amber-500/20 text-amber-400 group-hover:bg-amber-500 group-hover:text-zinc-950'
                              : 'bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white'
                          } transition-colors`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        {plan.saveBadge && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                            {plan.saveBadge}
                          </span>
                        )}
                        {plan.popular && !plan.saveBadge && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300">
                            Popular
                          </span>
                        )}
                      </div>

                      {/* Plan Duration & Price */}
                      <div>
                        <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                          {plan.name}
                        </h4>
                        <div className="mt-1 flex items-baseline gap-1">
                          <span className="text-base sm:text-lg font-black text-white">{formatPrice(plan.price)}</span>
                          <span className="text-[10px] text-zinc-400">({plan.months}m)</span>
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          Rs {plan.perMonth}/mo
                        </div>
                      </div>

                      {/* Action Arrow */}
                      <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-bold text-zinc-300 group-hover:text-white">
                        <span>{t('Choose Plan')}</span>
                        <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* 2. TIMED POP-UP MODAL (SHOWS AFTER 5000-8000ms ON APP MOUNT) */}
      <AnimatePresence>
        {isPopupOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
            {/* Default Backdrop Animation */}
            <motion.div
              {...modalBackdropAnimation}
              onClick={handleClosePopup}
              className="fixed inset-0 bg-black/85 backdrop-blur-md"
            />
            {/* Default Modal Container Animation */}
            <motion.div
              {...modalContainerAnimation}
              style={modalGpuStyle}
              className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden z-10 p-5 sm:p-7 my-auto"
            >
              {/* Ambient Header Glow */}
              <div
                className={`absolute top-0 inset-x-0 h-32 blur-3xl pointer-events-none opacity-40 ${
                  isTrialExpired
                    ? 'bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-700'
                    : isMembershipExpired
                    ? 'bg-gradient-to-r from-rose-600 via-amber-600 to-rose-700'
                    : 'bg-gradient-to-r from-amber-500 via-emerald-500 to-amber-600'
                }`}
              />

              <button
                onClick={handleClosePopup}
                type="button"
                className="absolute top-4 right-4 p-2 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800/80 transition-colors z-20 cursor-pointer"
                aria-label={t('Close')}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center text-center mb-4 relative z-10">
                <div
                  className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border flex items-center justify-center shadow-xl mb-3 ${
                    isTrialExpired
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-amber-500/10'
                      : isMembershipExpired
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-400 shadow-rose-500/10'
                      : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-emerald-500/10'
                  }`}
                >
                  {isTrialExpired ? (
                    <Clock className="w-7 h-7 sm:w-8 sm:h-8" />
                  ) : isMembershipExpired ? (
                    <RefreshCw className="w-7 h-7 sm:w-8 sm:h-8" />
                  ) : (
                    <Crown className="w-7 h-7 sm:w-8 sm:h-8" />
                  )}
                </div>

                {/* Badge */}
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider mb-2 border ${
                    isTrialExpired
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : isMembershipExpired
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                      : isPending
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  }`}
                >
                  <span>
                    {isTrialExpired
                      ? t('Trial Expired')
                      : isMembershipExpired
                      ? t('Membership Expired')
                      : isPending
                      ? t('Pending Activation')
                      : t('Membership Reminder')}
                  </span>
                </div>

                {/* Headline */}
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-1.5">
                  {isTrialExpired
                    ? t('Your Trial expired renew now')
                    : isMembershipExpired
                    ? t('Your membership expired')
                    : isPending
                    ? t('Activate your account with a VIP or Basic pass')
                    : t('Get a Membership Pass to unlock movies & series')}
                </h2>

                <p className="text-xs sm:text-sm text-zinc-400 max-w-md">
                  {isTrialExpired
                    ? t('Your free Trial has expired. Please get Membership to continue watching.')
                    : isMembershipExpired
                    ? t('Your membership has expired. Please renew to continue watching.')
                    : t('Choose a VIP or Basic plan below to unlock unlimited streaming, HD playback, and downloads.')}
                </p>
              </div>

              {/* Tier Switcher Tabs */}
              <div className="flex items-center justify-center mb-4 relative z-10">
                <div className="inline-flex p-1 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setSelectedTier('vip')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                      selectedTier === 'vip'
                        ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 shadow-md shadow-amber-500/20'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Crown className="w-4 h-4" />
                    <span>VIP Plans (5)</span>
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-black/20">All-Inclusive</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTier('basic')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                      selectedTier === 'basic'
                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/20'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Zap className="w-4 h-4" />
                    <span>Basic Plans (4)</span>
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-black/20">From Rs 100</span>
                  </button>
                </div>
              </div>

              {/* Plans Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[290px] overflow-y-auto pr-1 pb-1 relative z-10">
                {currentPlans.map((plan) => {
                  const Icon = plan.icon;
                  const isVipTier = plan.planRole === 'vip';

                  return (
                    <div
                      key={plan.id}
                      onClick={() => handleSelectPlan(plan)}
                      className={`group relative flex flex-col justify-between p-3 rounded-2xl cursor-pointer border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                        plan.popular
                          ? isVipTier
                            ? 'bg-gradient-to-b from-amber-500/15 via-zinc-900 to-zinc-900 border-amber-500/50 shadow-lg shadow-amber-500/10'
                            : 'bg-gradient-to-b from-emerald-500/15 via-zinc-900 to-zinc-900 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                          : 'bg-zinc-900/80 hover:bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isVipTier
                              ? 'bg-amber-500/20 text-amber-400 group-hover:bg-amber-500 group-hover:text-zinc-950'
                              : 'bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white'
                          } transition-colors`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        {plan.saveBadge && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                            {plan.saveBadge}
                          </span>
                        )}
                        {plan.popular && !plan.saveBadge && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300">
                            Popular
                          </span>
                        )}
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                          {plan.name}
                        </h4>
                        <div className="mt-1 flex items-baseline gap-1">
                          <span className="text-sm sm:text-base font-black text-white">{formatPrice(plan.price)}</span>
                          <span className="text-[10px] text-zinc-400">({plan.months}m)</span>
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          Rs {plan.perMonth}/mo
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-bold text-zinc-300 group-hover:text-white">
                        <span>{t('Select')}</span>
                        <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="mt-4 pt-4 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 relative z-10">
                <button
                  type="button"
                  onClick={() => {
                    handleClosePopup();
                    navigate('/membership');
                  }}
                  className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <Crown className="w-3.5 h-3.5" />
                  <span>{t('View All Plan Features & Benefits')}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleClosePopup}
                  className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors py-1 px-3 cursor-pointer"
                >
                  {t('Maybe Later')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
