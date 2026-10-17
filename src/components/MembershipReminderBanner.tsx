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
  const [isPopupOpen, setIsPopupOpen] = useState(false);

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

  // Pop-up modal after 2500ms on app mount for non-active users
  useEffect(() => {
    // Wait until auth resolution completes
    if (loading || authLoading) return;

    // Only for logged-in non-active non-staff users
    if (!profile || !profile.uid || hasActiveMembership || isStaff) return;

    // If dismissed in this session, do not re-open automatically
    if (sessionStorage.getItem('membership_popup_dismissed') === 'true') return;

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
    }, 2500);

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

  const handleClosePopup = () => {
    setIsPopupOpen(false);
    sessionStorage.setItem('membership_popup_dismissed', 'true');
  };

  const handleOpenPopup = () => {
    setIsPopupOpen(true);
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

  const currentPlans = (selectedTier === 'vip' ? VIP_PLANS : BASIC_PLANS).slice(0, 3);

  return (
    <>
      {/* Floating Pill Trigger (shows when modal is closed, never pushes down the header) */}
      {!isPopupOpen && (
        <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-[999]">
          <button
            onClick={handleOpenPopup}
            className="group flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold text-xs sm:text-sm shadow-xl shadow-amber-500/25 ring-2 ring-amber-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <Crown className="w-4 h-4 text-zinc-950 animate-bounce" />
            <span>
              {isTrialExpired
                ? t('Trial Expired - Renew')
                : isMembershipExpired
                ? t('Membership Expired - Renew')
                : isPending
                ? t('Activate Membership')
                : t('Buy Membership')}
            </span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      )}

      {/* MEMBERSHIP POP-UP MODAL (SHOWS AS MODAL POP UP, NOT ABOVE HEADER) */}
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
                    ? t('Renew now to continue watching')
                    : isMembershipExpired
                    ? t('Renew now to continue watching')
                    : isPending
                    ? t('Activate your account with a VIP or Basic pass')
                    : t('Get a Membership Pass to unlock movies & series')}
                </h2>

                <p className="text-xs sm:text-sm text-zinc-400 max-w-md">
                  {isTrialExpired
                    ? t('Your free trial has expired. Choose a pass below to continue watching.')
                    : isMembershipExpired
                    ? t('Your membership has expired. Choose a pass below to renew.')
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
                    <span>VIP Plans</span>
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
                    <span>Basic Plans</span>
                  </button>
                </div>
              </div>

              {/* Plans Row (1, 3 & 6 Months) */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 relative z-10">
                {currentPlans.map((plan) => {
                  const Icon = plan.icon;
                  const isVipTier = plan.planRole === 'vip';

                  return (
                    <div
                      key={plan.id}
                      onClick={() => handleSelectPlan(plan)}
                      className={`group relative flex flex-col justify-between p-2.5 sm:p-3.5 rounded-2xl cursor-pointer border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                        plan.saveBadge
                          ? isVipTier
                            ? 'bg-gradient-to-b from-amber-500/15 via-zinc-900 to-zinc-900 border-amber-500/50 shadow-lg shadow-amber-500/10'
                            : 'bg-gradient-to-b from-emerald-500/15 via-zinc-900 to-zinc-900 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                          : 'bg-zinc-900/80 hover:bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <div
                          className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0 ${
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
                        <h4 className="text-[11px] sm:text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                          {plan.name}
                        </h4>
                        <div className="mt-1 flex items-baseline gap-1">
                          <span className="text-sm sm:text-base font-black text-white">{formatPrice(plan.price)}</span>
                          <span className="text-[10px] text-zinc-400">({plan.months}m)</span>
                        </div>
                        <div className="text-[9px] sm:text-[10px] text-zinc-400 mt-0.5">
                          Rs {plan.perMonth}/mo
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] sm:text-[11px] font-bold text-zinc-300 group-hover:text-white">
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
