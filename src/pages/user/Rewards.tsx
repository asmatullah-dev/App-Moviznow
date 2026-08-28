import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { useAuth, ensureSingleAndValidReferralCode } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePWA } from '../../contexts/PWAContext';
import { 
  Gift, 
  Share2, 
  Bell, 
  Download, 
  CheckCircle2, 
  Copy, 
  Users, 
  Clock,
  ArrowRight,
  TrendingUp,
  Send,
  MessageCircle,
  Award,
  Trophy,
  Star,
  Medal,
  Crown,
  Zap,
  Sparkles,
  Loader2,
  Calendar,
  CalendarDays,
  ShieldCheck,
  X,
  Sliders
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, getDocs, limit, doc, getDoc, writeBatch, increment } from 'firebase/firestore';
import { db } from '../../firebase';
import { safeStorage } from '../../utils/safeStorage';
import { Header } from '../../components/Header';
import { fetchReviewsFromChunks } from '../../utils/chunkUtils';

const getReferralCodeForUid = (uid: string) => {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    const char = uid.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).toUpperCase().padStart(6, 'X').substring(0, 6);
};

export default function Rewards() {
  const navigate = useNavigate();
  const { profile, updateUserProfileData } = useAuth();
  const { t, language } = useLanguage();
  const { isInstalled, isInstallable, installApp } = usePWA();
  const [copied, setCopied] = useState(false);
  const [hasRatedState, setHasRatedState] = useState<boolean>(safeStorage.getItem('has_rated') === 'true');
  const [claimingReview, setClaimingReview] = useState(false);
  const [claimingNotification, setClaimingNotification] = useState(false);
  const [referredCount, setReferredCount] = useState<number>(0);
  const [activatedCount, setActivatedCount] = useState<number>(0);
  const [referredUsersList, setReferredUsersList] = useState<any[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const referralLink = `${window.location.origin}/?ref=${profile?.referralCode || ''}`;

  const showNotificationTask = !profile?.notificationRewardClaimed && ('Notification' in window ? Notification.permission !== 'granted' : true);
  const showInstallTask = !profile?.pwaRewardClaimed && !isInstalled && isInstallable;
  const showReviewTask = !profile?.reviewRewardClaimed && !hasRatedState;

  // Unclaimed calculation
  const unclaimedSignups = referredUsersList.filter(u => !u.signupClaimed);
  const unclaimedActivations = referredUsersList.filter(u => u.isActivated && !u.activationClaimed);
  const unclaimedReview = !profile?.reviewRewardClaimed;
  const unclaimedNotification = !profile?.notificationRewardClaimed;
  const unclaimedPWA = !profile?.pwaRewardClaimed;

  const totalUnclaimedDays = (unclaimedSignups.length * 10) + 
    (unclaimedActivations.length * 10) + 
    (unclaimedReview ? 10 : 0) + 
    (unclaimedNotification ? 6 : 0) + 
    (unclaimedPWA ? 6 : 0);

  const hasUnclaimedRewards = totalUnclaimedDays > 0;

  const getBadge = (count: number) => {
    if (count >= 50) return { name: t('Diamond Referrer'), icon: Crown, color: 'text-cyan-400', bg: 'bg-cyan-500/20 border-cyan-500/40', next: null };
    if (count >= 25) return { name: t('Platinum Referrer'), icon: Trophy, color: 'text-purple-300', bg: 'bg-purple-500/20 border-purple-500/40', next: 50 };
    if (count >= 10) return { name: t('Gold Referrer'), icon: Star, color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/40', next: 25 };
    if (count >= 5) return { name: t('Silver Referrer'), icon: Medal, color: 'text-rose-300', bg: 'bg-rose-500/20 border-rose-500/40', next: 10 };
    if (count >= 1) return { name: t('Bronze Referrer'), icon: Award, color: 'text-orange-400', bg: 'bg-orange-500/20 border-orange-500/40', next: 5 };
    return { name: t('Newcomer'), icon: Users, color: 'text-zinc-400', bg: 'bg-zinc-800 border-zinc-700', next: 1 };
  };

  useEffect(() => {
    if (profile && !profile.referralCode) {
      const newCode = getReferralCodeForUid(profile.uid);
      updateUserProfileData({ referralCode: newCode }).catch(console.error);
    }
  }, [profile?.referralCode, profile?.uid]);

  const currentBadge = getBadge(referredCount);

  const fetchReferralStats = async (force: boolean = false) => {
    if (!profile?.uid) return;

    const cacheTimeKey = `referral_stats_time_${profile.uid}`;
    const lastFetchTime = parseInt(safeStorage.getItem(cacheTimeKey) || '0', 10);
    const now = Date.now();
    const hasCachedList = !!safeStorage.getItem(`referral_users_list_${profile.uid}`);

    // If fetched within 15 minutes and we already have cached data, skip network read
    if (!force && hasCachedList && (now - lastFetchTime < 15 * 60 * 1000)) {
      setIsLoadingStats(false);
      return;
    }

    try {
      const refDoc = await getDoc(doc(db, 'referral', 'all'));
      let myJoins: any[] = [];
      if (refDoc.exists()) {
        const joins = refDoc.data()?.joins || {};
        myJoins = Object.values(joins).filter((j: any) => j.inviterUid === profile.uid);
      }

      const users: any[] = [];
      let activated = 0;

      myJoins.forEach((data: any) => {
        const isActivated = data.status === 'paid' || data.activationClaimed;
        users.push({
          id: data.uid,
          email: data.email,
          displayName: data.displayName,
          status: data.status,
          code: data.code,
          createdAt: data.createdAt,
          signupClaimed: data.signupClaimed || false,
          activationClaimed: data.activationClaimed || false,
          isActivated
        });
        if (isActivated) {
          activated++;
        }
      });

      const sortedUsers = users.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      setReferredCount(myJoins.length);
      setActivatedCount(activated);
      setReferredUsersList(sortedUsers);

      if (profile?.uid) {
        safeStorage.setItem(`referral_stats_count_${profile.uid}`, myJoins.length.toString());
        safeStorage.setItem(`referral_stats_activated_${profile.uid}`, activated.toString());
        safeStorage.setItem(`referral_users_list_${profile.uid}`, JSON.stringify(sortedUsers));
        safeStorage.setItem(`referral_stats_time_${profile.uid}`, Date.now().toString());
      }
    } catch (e) {
      console.error("Error fetching referral stats:", e);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const claimReward = async (joinedUid: string, type: 'signup' | 'activation') => {
    if (!profile?.uid) return;
    
    try {
      const batch = writeBatch(db);
      
      let baseDate = new Date();
      if (profile.expiryDate && profile.expiryDate !== 'Lifetime') {
        const currentExp = new Date(profile.expiryDate);
        if (currentExp > baseDate) {
          baseDate = currentExp;
        }
      }
      baseDate.setDate(baseDate.getDate() + 10);
      const newExpiryStr = baseDate.toISOString();
      
      const userUpdates: any = {
        expiryDate: newExpiryStr,
        status: 'active'
      };

      if (['user', 'trial', 'selected_content', ''].includes(profile.role || '')) {
        userUpdates.role = 'basic';
      }
      
      batch.update(doc(db, 'users', profile.uid), userUpdates);
      
      const nowTime = Date.now();
      batch.set(doc(db, 'chunk_meta', 'versions'), {
        users: {
          [profile.uid]: nowTime
        }
      }, { merge: true });

      const claimField = type === 'signup' ? 'signupClaimed' : 'activationClaimed';
      batch.set(doc(db, 'referral', 'all'), {
        joins: {
          [joinedUid]: {
            [claimField]: true
          }
        }
      }, { merge: true });
      
      await batch.commit();

      safeStorage.setItem(`profile_version_${profile.uid}`, nowTime.toString());
      try {
        const { updateChunkMetaLocalCache } = await import('../../utils/chunkMeta');
        updateChunkMetaLocalCache({ users: { [profile.uid]: nowTime } });
      } catch (e) {}
      
      await updateUserProfileData(userUpdates);
      await fetchReferralStats(true);
      triggerConfetti();
    } catch (e) {
      console.error("Failed to claim reward:", e);
    }
  };


  useEffect(() => {
    safeStorage.removeItem('referral_stats_count');
    safeStorage.removeItem('referral_stats_activated');
    safeStorage.removeItem('referral_users_list');

    if (!profile?.uid) {
      setReferredCount(0);
      setActivatedCount(0);
      setReferredUsersList([]);
      setIsLoadingStats(false);
      return;
    }

    const countCached = safeStorage.getItem(`referral_stats_count_${profile.uid}`);
    const actCached = safeStorage.getItem(`referral_stats_activated_${profile.uid}`);
    const listCached = safeStorage.getItem(`referral_users_list_${profile.uid}`);

    setReferredCount(countCached ? parseInt(countCached) : 0);
    setActivatedCount(actCached ? parseInt(actCached) : 0);
    if (listCached) {
      try {
        setReferredUsersList(JSON.parse(listCached));
        setIsLoadingStats(false);
      } catch (e) {
        setReferredUsersList([]);
        setIsLoadingStats(true);
      }
    } else {
      setReferredUsersList([]);
      setIsLoadingStats(true);
    }

    fetchReferralStats();
  }, [profile?.uid]);

  const triggerConfetti = () => {
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#f43f5e', '#a855f7', '#f59e0b', '#ffffff']
    });
  };

  useEffect(() => {
    const justClaimedNotification = sessionStorage.getItem('notificationRewardClaimed');
    const justClaimedPWA = sessionStorage.getItem('pwaRewardClaimed');
    const justClaimedReview = sessionStorage.getItem('reviewRewardClaimed');
    
    if (justClaimedNotification || justClaimedPWA || justClaimedReview) {
      triggerConfetti();
      sessionStorage.removeItem('notificationRewardClaimed');
      sessionStorage.removeItem('pwaRewardClaimed');
      sessionStorage.removeItem('reviewRewardClaimed');
    }

    if (profile?.uid) {
      try {
        const cachedStr = safeStorage.getItem('cached_reviews_data');
        if (cachedStr) {
          const allReviews = JSON.parse(cachedStr);
          if (allReviews && Array.isArray(allReviews)) {
            const userHasReviewed = allReviews.some((r: any) =>
              r.userId === profile.uid || (profile.email && r.userEmail === profile.email)
            );
            if (userHasReviewed) {
              safeStorage.setItem('has_rated', 'true');
              setHasRatedState(true);
            } else {
              safeStorage.removeItem('has_rated');
              setHasRatedState(false);
            }
          }
        }
      } catch (e) {}
    }
  }, [profile?.uid, profile?.email]);

  const claimReviewReward = async () => {
    if (!profile?.uid || profile.reviewRewardClaimed || claimingReview) return;
    setClaimingReview(true);
    try {
      // Use cached/static reviews without forcing a Firestore sync
      const allReviews = await fetchReviewsFromChunks();
      const userHasReviewed = allReviews?.some((r: any) => 
        r.userId === profile.uid || (profile.email && r.userEmail === profile.email)
      );

      if (!userHasReviewed) {
        safeStorage.removeItem('has_rated');
        setHasRatedState(false);
        alert(t('You have not submitted a review yet. Please write a review first to get +10 Days free Basic access!'));
        navigate('/reviews');
        return;
      }

      let baseDate = new Date();
      if (profile.expiryDate && profile.expiryDate !== 'Lifetime') {
        const currentExp = new Date(profile.expiryDate);
        if (currentExp > baseDate) {
          baseDate = currentExp;
        }
      }
      baseDate.setDate(baseDate.getDate() + 10);
      const updates: any = {
        reviewRewardClaimed: true,
        expiryDate: baseDate.toISOString(),
        status: 'active'
      };
      if (['user', 'trial', 'selected_content', ''].includes(profile.role || '')) {
        updates.role = 'basic';
      }
      await updateUserProfileData(updates);
      sessionStorage.setItem('reviewRewardClaimed', 'true');
      safeStorage.setItem('has_rated', 'true');
      setHasRatedState(true);
      triggerConfetti();
    } catch (e) {
      console.error("Failed to claim review reward:", e);
      alert(t("Failed to claim review reward. Please try again."));
    } finally {
      setClaimingReview(false);
    }
  };

  const handleCopy = async () => {
    const code = await ensureReferralCode();
    const currentLink = code ? `${window.location.origin}/?ref=${code}` : referralLink;
    
    navigator.clipboard.writeText(currentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEnableNotifications = async () => {
    if (!profile?.uid || profile.notificationRewardClaimed || claimingNotification) return;
    
    if (!('Notification' in window)) {
      alert(t('Push notifications are not supported in this browser/device. Please allow notifications in a supported browser to claim.'));
      return;
    }

    setClaimingNotification(true);
    try {
      let permission = Notification.permission;
      if (permission !== 'granted') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        alert(t('Please allow notifications permission in your browser to claim this reward.'));
        return;
      }
      
      let baseDate = new Date();
      if (profile.expiryDate && profile.expiryDate !== 'Lifetime') {
        const currentExp = new Date(profile.expiryDate);
        if (currentExp > baseDate) baseDate = currentExp;
      }
      baseDate.setDate(baseDate.getDate() + 6);
      const updates: any = {
        notificationRewardClaimed: true,
        expiryDate: baseDate.toISOString()
      };
      if (profile.status !== 'suspended') {
        updates.status = 'active';
      }
      if (['user', 'trial', 'selected_content', ''].includes(profile.role || '')) {
        updates.role = 'basic';
      }
      await updateUserProfileData(updates);
      sessionStorage.setItem('notificationRewardClaimed', 'true');
      triggerConfetti();
    } catch (e) {
      console.error("Failed to claim notification reward:", e);
      alert(t("Failed to claim notification reward. Please try again."));
    } finally {
      setClaimingNotification(false);
    }
  };

  const handleClaimPWA = async () => {
    if (!profile?.uid || profile.pwaRewardClaimed) return;
    if (!isInstalled) {
      installApp();
      return;
    }
    try {
      let baseDate = new Date();
      if (profile.expiryDate && profile.expiryDate !== 'Lifetime') {
        const currentExp = new Date(profile.expiryDate);
        if (currentExp > baseDate) baseDate = currentExp;
      }
      baseDate.setDate(baseDate.getDate() + 6);
      const updates: any = {
        pwaRewardClaimed: true,
        expiryDate: baseDate.toISOString()
      };
      if (profile.status !== 'suspended') {
        updates.status = 'active';
      }
      if (['user', 'trial', 'selected_content', ''].includes(profile.role || '')) {
        updates.role = 'basic';
      }
      await updateUserProfileData(updates);
      triggerConfetti();
    } catch (e) {
      console.error("Failed to claim PWA reward:", e);
    }
  };

  const handleCopyLink = handleCopy;

  const ensureReferralCode = async () => {
    if (!profile) return null;
    
    try {
      const code = await ensureSingleAndValidReferralCode(profile.uid, profile.referralCode);
      if (code !== profile.referralCode) {
        await updateUserProfileData({ referralCode: code });
      }
      return code;
    } catch (e) {
      console.error('Failed to reconcile or save referral code:', e);
      if (!profile.referralCode) {
        const fallbackCode = getReferralCodeForUid(profile.uid);
        try {
          await updateUserProfileData({ referralCode: fallbackCode });
          return fallbackCode;
        } catch (err) {
          console.error('Fallback save code failed:', err);
          return null;
        }
      }
      return profile.referralCode;
    }
  };

  const handleShare = async () => {
    const code = await ensureReferralCode();
    const currentLink = code ? `${window.location.origin}/?ref=${code}` : referralLink;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: t('Join MovizNow'),
          text: t('Get 10 days of free Basic membership on MovizNow!'),
          url: currentLink,
        });
      } catch (err) {
        console.error('Share failed:', err);
      }
    } else {
      navigator.clipboard.writeText(currentLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const trackShareClick = async (platform: string) => {
    if (!profile) return;
    const key = `clicks_${platform}`;

    try {
      const { doc, setDoc, increment } = await import('firebase/firestore');
      
      const code = await ensureReferralCode();
      if (!code) return;

      await setDoc(doc(db, 'referral', 'all'), {
        codes: {
          [profile.uid]: code
        },
        codeToUid: {
          [code]: profile.uid
        },
        stats: {
          [profile.uid]: {
            [key]: increment(1),
            total_clicks: increment(1),
            lastUpdated: new Date().toISOString()
          }
        }
      }, { merge: true });
    } catch (e) {
      console.error("Failed to track share click", e);
    }
  };

  const shareWhatsApp = async () => {
    const code = await ensureReferralCode();
    const currentLink = code ? `${window.location.origin}/?ref=${code}` : referralLink;
    trackShareClick('whatsapp');
    const text = encodeURIComponent(`${t('Get 10 days of free Basic membership on MovizNow!')}\n${currentLink}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareTelegram = async () => {
    const code = await ensureReferralCode();
    const currentLink = code ? `${window.location.origin}/?ref=${code}` : referralLink;
    trackShareClick('telegram');
    const text = encodeURIComponent(t('Get 10 days of free Basic membership on MovizNow!'));
    window.open(`https://t.me/share/url?url=${encodeURIComponent(currentLink)}&text=${text}`, '_blank');
  };

  const stats = [
    {
      label: t('Signups'),
      value: isLoadingStats ? '...' : referredCount,
      icon: Users,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10 border-purple-500/20'
    },
    {
      label: t('Paid Members'),
      value: isLoadingStats ? '...' : activatedCount,
      icon: CheckCircle2,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20'
    },
    {
      label: t('Total Days'),
      value: (referredCount * 10) + (activatedCount * 10) + (profile?.pwaRewardClaimed ? 6 : 0) + (profile?.notificationRewardClaimed ? 6 : 0) + (profile?.reviewRewardClaimed ? 10 : 0),
      icon: Clock,
      color: 'text-rose-400',
      bg: 'bg-rose-500/10 border-rose-500/20'
    }
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24 relative overflow-hidden">
      <Header showBackButton={true} />

      {/* Ambient Decorative Background Glows */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-r from-rose-600/15 via-purple-600/15 to-amber-600/15 blur-3xl pointer-events-none rounded-full" />
      <div className="absolute top-96 right-0 w-80 h-80 bg-rose-500/10 blur-3xl pointer-events-none rounded-full" />
      <div className="absolute top-[30rem] left-0 w-80 h-80 bg-amber-500/10 blur-3xl pointer-events-none rounded-full" />

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8 relative z-10">
        {/* Title Section */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-gradient-to-br from-rose-500 to-amber-500 rounded-2xl shadow-lg shadow-rose-500/25 text-white">
              <Gift className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400 tracking-wider uppercase mb-0.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>MovizNow Rewards</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">{t('Rewards & Referrals')}</h1>
            </div>
          </div>
          
          {/* Badge */}
          <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full ${currentBadge.bg} ${currentBadge.color} border shadow-md shrink-0`}>
            <currentBadge.icon className="w-4 h-4" />
            <span className="text-xs font-extrabold uppercase tracking-wider">{currentBadge.name}</span>
          </div>
        </div>

        {/* Badge Progress */}
        {!isLoadingStats && currentBadge.next && (
          <div className="bg-gradient-to-r from-zinc-900/90 via-zinc-900/80 to-zinc-900/90 border border-rose-500/20 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-md">
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                {t('Next Goal')}
              </span>
              <span className="text-xs font-extrabold text-amber-400">
                {referredCount} / {currentBadge.next} {t('Referrals')}
              </span>
            </div>
            <div className="h-2.5 w-full bg-zinc-800/80 rounded-full overflow-hidden p-0.5 border border-zinc-700/50">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (referredCount / currentBadge.next) * 100)}%` }}
                className="h-full bg-gradient-to-r from-rose-500 via-purple-500 to-amber-500 rounded-full shadow-lg shadow-rose-500/30"
              />
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 rounded-2xl p-3.5 sm:p-4 flex flex-col items-center text-center border border-zinc-800/80 hover:border-rose-500/30 transition-all shadow-lg backdrop-blur-md"
            >
              <div className={`w-10 h-10 rounded-xl ${stat.bg} ${stat.color} border flex items-center justify-center mb-2.5 shadow-inner`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">{stat.value}</div>
              <div className="text-[10px] sm:text-xs text-zinc-400 uppercase tracking-wider font-bold mt-0.5">{stat.label}</div>
            </motion.div>
          ))}
        </div>


        {/* Main Hero Referral Card */}
        <section className="relative overflow-hidden bg-gradient-to-br from-rose-950/80 via-purple-950/70 to-amber-950/80 border border-rose-500/40 rounded-3xl p-6 sm:p-8 text-white shadow-2xl shadow-rose-950/50 backdrop-blur-xl">
          {/* Ambient Glow Effects inside Card */}
          <div className="absolute -top-16 -right-16 w-56 h-56 bg-rose-500/25 blur-3xl rounded-full pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-amber-500/25 blur-3xl rounded-full pointer-events-none" />

          <div className="relative z-10 space-y-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-rose-500/20 border border-rose-500/30 text-rose-300">
                <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span>+10 {t('Days')} Basic {t('Per Friend')}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                {t('Refer & Earn')}
              </h2>
              <p className="text-zinc-200 text-xs sm:text-sm leading-relaxed max-w-lg">
                {t('Invite friends to MovizNow and unlock 10 days of free Basic access for both of you!')}
              </p>
            </div>
            
            <div className="flex flex-col gap-3.5">
              {/* Referral Code Box */}
              <div className="bg-zinc-950/70 border border-rose-500/30 rounded-2xl p-4 flex items-center justify-between shadow-inner backdrop-blur-md">
                <div className="flex flex-col" dir={language === 'ur' ? 'rtl' : 'ltr'}>
                  <span className="text-[10px] uppercase tracking-wider text-rose-300 font-extrabold">{t('Your Code')}</span>
                  <span className="font-mono text-xl sm:text-2xl font-black text-amber-300 tracking-wider">{profile?.referralCode || '------'}</span>
                </div>
                <button 
                  onClick={handleCopy}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 transition-all shadow-md active:scale-95"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                      <span>{t('Copied!')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>{t('Copy Code')}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Share Options */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button 
                  onClick={handleCopyLink}
                  className="bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-100 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all text-xs sm:text-sm active:scale-95"
                >
                  <Copy className="w-4 h-4 text-rose-400" />
                  <span>{t('Copy Link')}</span>
                </button>
                <button 
                  onClick={shareWhatsApp}
                  className="bg-[#25D366] text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-[#22c35e] transition-all text-xs sm:text-sm shadow-lg shadow-[#25D366]/20 active:scale-95"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>WhatsApp</span>
                </button>
                <button 
                  onClick={shareTelegram}
                  className="bg-[#0088cc] text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-[#0077b3] transition-all text-xs sm:text-sm shadow-lg shadow-[#0088cc]/20 active:scale-95"
                >
                  <Send className="w-4 h-4" />
                  <span>Telegram</span>
                </button>
              </div>

              <button 
                onClick={handleShare}
                className="w-full bg-gradient-to-r from-rose-600 via-purple-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold py-3.5 sm:py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-rose-600/30 text-sm sm:text-base active:scale-95 mt-1"
              >
                <Share2 className="w-5 h-5" />
                <span>{t('Invite & Earn 10 Days Free')}</span>
              </button>
            </div>
          </div>

          <TrendingUp className="absolute right-6 top-6 w-28 h-28 text-white/5 rotate-12 pointer-events-none" />
        </section>

        {/* Empty State / Invitation Illustration */}
        {!isLoadingStats && referredCount === 0 && (
          <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border border-rose-500/20 rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center gap-4 shadow-lg backdrop-blur-md">
            <div className="p-4 bg-gradient-to-br from-rose-500/20 to-amber-500/20 rounded-full border border-rose-500/30 text-amber-400">
              <Users className="w-8 h-8" />
            </div>
            <div className="space-y-1.5" dir={language === 'ur' ? 'rtl' : 'ltr'}>
              <h3 className="text-lg font-extrabold text-white">{t('Invite your first friend')}</h3>
              <p className="text-xs sm:text-sm text-zinc-300 max-w-sm mx-auto leading-relaxed">
                {t('Sharing is caring! Invite your friends to join MovizNow and unlock exclusive rewards together.')}
              </p>
            </div>
            <button 
              onClick={handleShare}
              className="mt-1 flex items-center gap-2 text-rose-400 hover:text-rose-300 font-extrabold text-xs sm:text-sm transition-colors group"
            >
              <span>{t('Start Sharing Now')}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform rtl:group-hover:-translate-x-1" />
            </button>
          </div>
        )}

        {/* Tasks Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
              <Gift className="w-5 h-5 text-amber-400" />
              <span>{t('One-Time Rewards')}</span>
            </h3>
            <span className="text-xs font-bold text-amber-400/90 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
              🎁 Bonus Basic Days
            </span>
          </div>
          
          <div className="space-y-3">
            {/* Review Task */}
            <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border border-zinc-800/90 hover:border-amber-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-md backdrop-blur-md">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 shadow-inner">
                  <Star className="w-6 h-6 fill-amber-400/20" />
                </div>
                <div className="space-y-0.5" dir={language === 'ur' ? 'rtl' : 'ltr'}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-sm text-white">{t('Submit a Review')}</h4>
                    <span className="text-[10px] font-extrabold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
                      +10 {t('Days')} Basic
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">{t('Rate our app & share feedback')}</p>
                </div>
              </div>
              {profile?.reviewRewardClaimed ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20 self-start sm:self-auto">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  {t('Claimed (+10 Days)')}
                </span>
              ) : (
                <button 
                  onClick={() => {
                    if (hasRatedState) {
                      claimReviewReward();
                    } else {
                      navigate('/reviews');
                    }
                  }}
                  disabled={claimingReview}
                  className="bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-rose-600/20 active:scale-95 disabled:opacity-50 self-stretch sm:self-auto"
                >
                  {claimingReview ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t('Verifying...')}</span>
                    </>
                  ) : (
                    <>
                      <span>{hasRatedState ? t('Claim Reward (+10 Days)') : t('Write Review (+10 Days)')}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Notification Task */}
            <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border border-zinc-800/90 hover:border-purple-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-md backdrop-blur-md">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-rose-500/20 border border-purple-500/30 text-purple-400 flex items-center justify-center shrink-0 shadow-inner">
                  <Bell className="w-6 h-6" />
                </div>
                <div className="space-y-0.5" dir={language === 'ur' ? 'rtl' : 'ltr'}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-sm text-white">{t('Enable Notifications')}</h4>
                    <span className="text-[10px] font-extrabold text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-full border border-purple-500/30">
                      +6 {t('Days')} Basic
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">{t('Stay updated with latest content')}</p>
                </div>
              </div>
              {profile?.notificationRewardClaimed ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20 self-start sm:self-auto">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  {t('Claimed (+6 Days)')}
                </span>
              ) : (
                <button 
                  onClick={handleEnableNotifications}
                  disabled={claimingNotification}
                  className="bg-gradient-to-r from-purple-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-purple-600/20 active:scale-95 disabled:opacity-50 self-stretch sm:self-auto"
                >
                  {claimingNotification ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t('Enabling...')}</span>
                    </>
                  ) : (
                    <>
                      <span>{'Notification' in window && Notification.permission === 'granted' ? t('Claim Reward (+6 Days)') : t('Enable (+6 Days)')}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>

            {/* PWA Task */}
            <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border border-zinc-800/90 hover:border-rose-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-md backdrop-blur-md">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500/20 to-amber-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0 shadow-inner">
                  <Download className="w-6 h-6" />
                </div>
                <div className="space-y-0.5" dir={language === 'ur' ? 'rtl' : 'ltr'}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-sm text-white">{t('Install App')}</h4>
                    <span className="text-[10px] font-extrabold text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded-full border border-rose-500/30">
                      +6 {t('Days')} Basic
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">{t('Better experience on home screen')}</p>
                </div>
              </div>
              {profile?.pwaRewardClaimed ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20 self-start sm:self-auto">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  {t('Claimed (+6 Days)')}
                </span>
              ) : (
                <button 
                  onClick={handleClaimPWA}
                  className="bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-rose-600/20 active:scale-95 self-stretch sm:self-auto"
                >
                  <span>{isInstalled ? t('Claim Reward (+6 Days)') : t('Install (+6 Days)')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Recent Referral Activity */}
        {!isLoadingStats && referredUsersList.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-extrabold text-white px-1 flex items-center gap-2">
              <Clock className="w-5 h-5 text-rose-400" />
              <span>{t('Recent Referral Activity')}</span>
            </h3>
            
            <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border border-zinc-800 rounded-2xl overflow-hidden shadow-lg backdrop-blur-md">
              <div className="divide-y divide-zinc-800/80">
                {referredUsersList.map((user, i) => (
                  <motion.div 
                    key={user.id}
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                        user.isActivated ? 'bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-md' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      }`}>
                        {(user.displayName || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col min-w-0" dir={language === 'ur' ? 'rtl' : 'ltr'}>
                        <span className="text-sm font-bold truncate text-white">
                          {user.displayName || 'User'}
                        </span>
                        <span className="text-[10px] text-zinc-400 mt-0.5">
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : t('Recently')}
                          {' • '}
                          <span className={`font-extrabold ${user.status === 'paid' ? 'text-amber-400' : 'text-zinc-400'}`}>
                            {user.status === 'paid' ? t('Paid Member') : t('Login')}
                          </span>
                          {user.code && (
                            <>
                              {' • '}
                              <span className="text-zinc-400">{t('Code')}: <span className="font-mono text-rose-300">{user.code}</span></span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                    
                    {/* Rewards Controls */}
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                      {/* 1. Signup Reward */}
                      <div className="flex items-center gap-2">
                        {!user.signupClaimed ? (
                          <button
                            onClick={() => claimReward(user.id, 'signup')}
                            className="bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold text-xs px-3 py-1.5 rounded-lg shadow-md active:scale-95 transition-all flex items-center gap-1.5"
                          >
                            <Gift className="w-3.5 h-3.5" />
                            <span>{t('Claim Signup (+10 Days)')}</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-md border border-emerald-800/40">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{t('Signup Claimed (+10)')}</span>
                          </span>
                        )}
                      </div>

                      {/* 2. Activation Reward */}
                      <div className="flex items-center gap-2">
                        {user.isActivated ? (
                          !user.activationClaimed ? (
                            <button
                              onClick={() => claimReward(user.id, 'activation')}
                              className="bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-extrabold text-xs px-3 py-1.5 rounded-lg shadow-md active:scale-95 transition-all flex items-center gap-1.5"
                            >
                              <Crown className="w-3.5 h-3.5 text-amber-300" />
                              <span>{t('Claim Activation (+10 Days)')}</span>
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-950/40 px-2.5 py-1 rounded-md border border-amber-800/40">
                              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                              <span>{t('Activation Claimed (+10)')}</span>
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] text-zinc-400 italic bg-zinc-800/80 px-2 py-1 rounded-md border border-zinc-700/50">
                            {t('Pending activation for +10 days')}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Information Section */}
        <div className="bg-gradient-to-b from-zinc-900/70 to-zinc-950/70 rounded-2xl p-5 sm:p-6 border border-rose-500/20 border-dashed backdrop-blur-md">
          <h4 className="font-extrabold text-sm mb-3 flex items-center gap-2 text-rose-300">
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
            <span>{t('How it works')}</span>
          </h4>
          <ul className="space-y-2.5" dir={language === 'ur' ? 'rtl' : 'ltr'}>
            <li className="text-xs text-zinc-300 flex items-start gap-2">
              <span className="text-amber-400 font-bold">•</span>
              <span><strong className="text-white">{t('Referral Signup (+10 Days)')}:</strong> {t('Share your link/code with friends to get 10 days extension for every friend who joins.')}</span>
            </li>
            <li className="text-xs text-zinc-300 flex items-start gap-2">
              <span className="text-amber-400 font-bold">•</span>
              <span><strong className="text-white">{t('Referral Activation (+10 Days)')}:</strong> {t('Get an extra 10 days extension when your referred friend purchases a membership.')}</span>
            </li>
            {showInstallTask && (
              <li className="text-xs text-zinc-300 flex items-start gap-2">
                <span className="text-rose-400 font-bold">•</span>
                <span><strong className="text-white">{t('Install App (+6 Days)')}:</strong> {t('Install our PWA app on your home screen for a 6 days membership extension.')}</span>
              </li>
            )}
            {showNotificationTask && (
              <li className="text-xs text-zinc-300 flex items-start gap-2">
                <span className="text-purple-400 font-bold">•</span>
                <span><strong className="text-white">{t('Enable Notifications (+6 Days)')}:</strong> {t('Enable push notifications to stay updated and get a 6 days membership extension.')}</span>
              </li>
            )}
            {showReviewTask && (
              <li className="text-xs text-zinc-300 flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span><strong className="text-white">{t('Submit a Review (+10 Days)')}:</strong> {t('Write a review and rate our app to get a free 10 days membership extension.')}</span>
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

