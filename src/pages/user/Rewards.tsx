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
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, getDocs, limit, doc, getDoc, writeBatch, increment } from 'firebase/firestore';
import { db } from '../../firebase';
import { safeStorage } from '../../utils/safeStorage';
import { Header } from '../../components/Header';

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
  const { t } = useLanguage();
  const { isInstalled, isInstallable, installApp } = usePWA();
  const [copied, setCopied] = useState(false);
  const hasRated = safeStorage.getItem('has_rated') === 'true';
  const [referredCount, setReferredCount] = useState<number>(() => {
    const cached = safeStorage.getItem('referral_stats_count');
    return cached ? parseInt(cached) : 0;
  });
  const [activatedCount, setActivatedCount] = useState<number>(() => {
    const cached = safeStorage.getItem('referral_stats_activated');
    return cached ? parseInt(cached) : 0;
  });
  const [referredUsersList, setReferredUsersList] = useState<any[]>(() => {
    const cached = safeStorage.getItem('referral_users_list');
    return cached ? JSON.parse(cached) : [];
  });
  const [isLoadingStats, setIsLoadingStats] = useState(() => {
    const cached = safeStorage.getItem('referral_users_list');
    return !cached;
  });

  const referralLink = `${window.location.origin}/?ref=${profile?.referralCode || ''}`;

  const showNotificationTask = !profile?.notificationRewardClaimed && ('Notification' in window ? Notification.permission !== 'granted' : true);
  const showInstallTask = !profile?.pwaRewardClaimed && !isInstalled && isInstallable;
  const showReviewTask = !profile?.reviewRewardClaimed && !hasRated;

  const getBadge = (count: number) => {
    if (count >= 50) return { name: t('Diamond Referrer'), icon: Crown, color: 'text-blue-400', bg: 'bg-blue-400/10', next: null };
    if (count >= 25) return { name: t('Platinum Referrer'), icon: Trophy, color: 'text-zinc-400', bg: 'bg-zinc-400/10', next: 50 };
    if (count >= 10) return { name: t('Gold Referrer'), icon: Star, color: 'text-amber-400', bg: 'bg-amber-400/10', next: 25 };
    if (count >= 5) return { name: t('Silver Referrer'), icon: Medal, color: 'text-slate-400', bg: 'bg-slate-400/10', next: 10 };
    if (count >= 1) return { name: t('Bronze Referrer'), icon: Award, color: 'text-orange-400', bg: 'bg-orange-400/10', next: 5 };
    return { name: t('Newcomer'), icon: Users, color: 'text-zinc-500', bg: 'bg-zinc-500/10', next: 1 };
  };

  useEffect(() => {
    // Generate referral code on mount if missing
    if (profile && !profile.referralCode) {
      const newCode = getReferralCodeForUid(profile.uid);
      updateUserProfileData({ referralCode: newCode }).catch(console.error);
    }
  }, [profile?.referralCode, profile?.uid]);

  const currentBadge = getBadge(referredCount);

  const fetchReferralStats = async () => {
    if (!profile?.uid) return;

    try {
      // 1. Get referral document for the current user (using unified doc)
      const refDoc = await getDoc(doc(db, 'referral', 'all'));
      let myJoins: any[] = [];
      if (refDoc.exists()) {
        const joins = refDoc.data()?.joins || {};
        // Filter joins by current user's uid as inviterUid
        myJoins = Object.values(joins).filter((j: any) => j.inviterUid === profile.uid);
      }

      // If the referral document is empty, fallback to users collection query for migration
      if (myJoins.length === 0) {
        const q = query(
          collection(db, 'users'),
          where('referredBy', '==', profile.uid),
          limit(500)
        );
        const snap = await getDocs(q);
        
        // Let's migrate these existing referrals to /referral/all
        if (!snap.empty) {
          const batch = writeBatch(db);
          const migratedJoins: any = {};
          
          snap.docs.forEach(docSnap => {
            const data = docSnap.data();
            const uid = docSnap.id;
            const isPaid = (data.orders && data.orders.length > 0) || data.activationRewardClaimed;
            
            const joinRecord = {
              uid,
              code: profile.referralCode || 'UNKNOWN',
              inviterUid: profile.uid,
              displayName: data.displayName || data.email || 'User',
              email: data.email || '',
              status: isPaid ? 'paid' : 'login',
              createdAt: data.createdAt || new Date().toISOString(),
              signupClaimed: data.signupRewardClaimed || false,
              activationClaimed: data.activationRewardClaimed || false
            };
            
            migratedJoins[uid] = joinRecord;
          });
          
          batch.set(doc(db, 'referral', 'all'), {
            codes: {
              [profile.uid]: profile.referralCode || 'UNKNOWN'
            },
            codeToUid: {
              [profile.referralCode || 'UNKNOWN']: profile.uid
            },
            joins: migratedJoins,
            stats: {
              [profile.uid]: {
                totalJoined: snap.size,
                totalPaid: snap.docs.filter(d => (d.data().orders && d.data().orders.length > 0) || d.data().activationRewardClaimed).length
              }
            }
          }, { merge: true });

          await batch.commit();
          myJoins = Object.values(migratedJoins);
        }
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

      // Update state and cache
      setReferredCount(myJoins.length);
      setActivatedCount(activated);
      setReferredUsersList(sortedUsers);

      safeStorage.setItem('referral_stats_count', myJoins.length.toString());
      safeStorage.setItem('referral_stats_activated', activated.toString());
      safeStorage.setItem('referral_users_list', JSON.stringify(sortedUsers));
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
      
      // Calculate new expiry date
      let baseDate = new Date();
      if (profile.expiryDate && profile.expiryDate !== 'Lifetime') {
        const currentExp = new Date(profile.expiryDate);
        if (currentExp > baseDate) {
          baseDate = currentExp;
        }
      }
      baseDate.setDate(baseDate.getDate() + 5);
      const newExpiryStr = baseDate.toISOString();
      
      const userUpdates: any = {
        expiryDate: newExpiryStr
      };
      userUpdates.status = 'active';
      
      // Update inviter's profile in users collection
      batch.update(doc(db, 'users', profile.uid), userUpdates);
      
      // Update claim status in the user's referral document
      const claimField = type === 'signup' ? 'signupClaimed' : 'activationClaimed';
      batch.set(doc(db, 'referral', 'all'), {
        joins: {
          [joinedUid]: {
            [claimField]: true
          }
        }
      }, { merge: true });
      
      await batch.commit();
      
      // Update local profile state
      await updateUserProfileData(userUpdates);
      
      // Refresh statistics & list
      await fetchReferralStats();
      
      triggerConfetti();
    } catch (e) {
      console.error("Failed to claim reward:", e);
    }
  };

  useEffect(() => {
    fetchReferralStats();
  }, [profile?.uid]);

  const triggerConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#10b981', '#34d399', '#ffffff']
    });
  };

  useEffect(() => {
    // Check if a reward was just claimed in this session
    const justClaimedNotification = sessionStorage.getItem('notificationRewardClaimed');
    const justClaimedPWA = sessionStorage.getItem('pwaRewardClaimed');
    const justClaimedReview = sessionStorage.getItem('reviewRewardClaimed');
    
    if (justClaimedNotification || justClaimedPWA || justClaimedReview) {
      triggerConfetti();
      sessionStorage.removeItem('notificationRewardClaimed');
      sessionStorage.removeItem('pwaRewardClaimed');
      sessionStorage.removeItem('reviewRewardClaimed');
    }
  }, []);

  const claimReviewReward = async () => {
    if (!profile?.uid || profile.reviewRewardClaimed) return;
    try {
      let baseDate = new Date();
      if (profile.expiryDate && profile.expiryDate !== 'Lifetime') {
        const currentExp = new Date(profile.expiryDate);
        if (currentExp > baseDate) {
          baseDate = currentExp;
        }
      }
      baseDate.setDate(baseDate.getDate() + 5);
      const updates: any = {
        reviewRewardClaimed: true,
        expiryDate: baseDate.toISOString()
      };
      updates.status = 'active';
      await updateUserProfileData(updates);
      sessionStorage.setItem('reviewRewardClaimed', 'true');
      safeStorage.setItem('has_rated', 'true');
      triggerConfetti();
    } catch (e) {
      console.error("Failed to claim review reward:", e);
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
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        sessionStorage.setItem('notificationRewardClaimed', 'true');
        // App.tsx RewardsManager will handle the actual reward claim
        window.location.reload();
      }
    }
  };

  const handleCopyLink = handleCopy;

  const ensureReferralCode = async () => {
    if (!profile) return null;
    
    console.log('ensureReferralCode called, current profile.referralCode:', profile.referralCode);
    
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
          text: t('Get 5 days of premium membership for free on MovizNow!'),
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
      if (!code) return; // Need a code to write the document properly

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
    const text = encodeURIComponent(`${t('Get 5 days of premium membership for free on MovizNow!')}\n${currentLink}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareTelegram = async () => {
    const code = await ensureReferralCode();
    const currentLink = code ? `${window.location.origin}/?ref=${code}` : referralLink;
    trackShareClick('telegram');
    const text = encodeURIComponent(t('Get 5 days of premium membership for free on MovizNow!'));
    window.open(`https://t.me/share/url?url=${encodeURIComponent(currentLink)}&text=${text}`, '_blank');
  };

  const stats = [
    {
      label: t('Signups'),
      value: isLoadingStats ? '...' : referredCount,
      icon: Users,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10'
    },
    {
      label: t('Paid Members'),
      value: isLoadingStats ? '...' : activatedCount,
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10'
    },
    {
      label: t('Total Days'),
      value: (referredCount * 5) + (activatedCount * 5) + (profile?.pwaRewardClaimed ? 3 : 0) + (profile?.notificationRewardClaimed ? 3 : 0) + (profile?.reviewRewardClaimed ? 5 : 0),
      icon: Clock,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10'
    }
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white pb-20 transition-colors duration-300">
      <Header showBackButton={true} />

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Title Section */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <Gift className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold">{t('Rewards & Referrals')}</h1>
          </div>
          
          {/* Badge */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${currentBadge.bg} ${currentBadge.color} border border-current/10`}>
            <currentBadge.icon className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">{currentBadge.name}</span>
          </div>
        </div>

        {/* Badge Progress */}
        {!isLoadingStats && currentBadge.next && (
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('Next Goal')}</span>
              <span className="text-xs font-bold text-emerald-500">{referredCount} / {currentBadge.next} {t('Referrals')}</span>
            </div>
            <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${(referredCount / currentBadge.next) * 100}%` }}
                className="h-full bg-emerald-500 rounded-full"
              />
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl p-4 flex flex-col items-center text-center border border-zinc-200 dark:border-zinc-800"
            >
              <div className={`w-10 h-10 rounded-full ${stat.bg} ${stat.color} flex items-center justify-center mb-3`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div className="text-lg font-bold">{stat.value}</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Main Referral Card */}
        <section className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl shadow-emerald-500/20">
          <div className="relative z-10">
            <h2 className="text-2xl font-bold mb-2">{t('Refer & Earn')}</h2>
            <p className="text-emerald-50/80 text-sm mb-8 max-w-[200px]">
              {t('Invite friends and both of you get 5 days of premium instantly!')}
            </p>
            
          <div className="flex flex-col gap-3">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between border border-white/20">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider opacity-60 font-bold">{t('Your Code')}</span>
                <span className="font-mono text-xl font-bold">{profile?.referralCode || '------'}</span>
              </div>
              <button 
                onClick={handleCopy}
                className="w-10 h-10 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                {copied ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button 
                onClick={handleCopyLink}
                className="bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors border border-white/10"
              >
                <Copy className="w-4 h-4" />
                {t('Link')}
              </button>
              <button 
                onClick={shareWhatsApp}
                className="bg-[#25D366] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-[#25D366]/90 transition-colors shadow-lg shadow-[#25D366]/20"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </button>
              <button 
                onClick={shareTelegram}
                className="bg-[#0088cc] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-[#0088cc]/90 transition-colors shadow-lg shadow-[#0088cc]/20"
              >
                <Send className="w-4 h-4" />
                Telegram
              </button>
            </div>

            <button 
              onClick={handleShare}
              className="w-full bg-white text-emerald-600 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-emerald-50 transition-colors shadow-lg md:hidden"
            >
              <Share2 className="w-5 h-5" />
              {t('Native Share')}
            </button>
          </div>
          </div>

          {/* Decorative elements */}
          <div className="absolute top-[-20px] right-[-20px] w-40 h-40 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-[-40px] left-[-40px] w-60 h-60 bg-emerald-400/20 rounded-full blur-3xl" />
          <TrendingUp className="absolute right-8 top-8 w-24 h-24 text-white/10 rotate-12" />
        </section>

        {/* Empty State / Invitation Illustration */}
        {!isLoadingStats && referredCount === 0 && (
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 flex flex-col items-center text-center gap-4">
            <div className="space-y-2">
              <h3 className="text-lg font-bold">{t('Invite your first friend')}</h3>
              <p className="text-sm text-zinc-500 max-w-[260px] mx-auto">
                {t('Sharing is caring! Invite your friends to join MovizNow and unlock exclusive rewards together.')}
              </p>
            </div>
            <button 
              onClick={handleShare}
              className="mt-2 flex items-center gap-2 text-emerald-500 font-bold text-sm hover:underline"
            >
              {t('Start Sharing Now')}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tasks Section */}
        {(showNotificationTask || showInstallTask || showReviewTask) && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold px-1">{t('One-Time Rewards')}</h3>
            
            <div className="space-y-3">
              {/* Notification Task */}
              {showNotificationTask && (
                <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                      <Bell className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm">{t('Enable Notifications')}</h4>
                        <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          +3 Days
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">{t('Stay updated with latest content')}</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleEnableNotifications}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:scale-105 transition-transform flex items-center gap-2 shadow-sm"
                  >
                    {t('Enable (+3 Days)')}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* PWA Task */}
              {showInstallTask && (
                <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                      <Download className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm">{t('Install App')}</h4>
                        <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          +3 Days
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">{t('Better experience on home screen')}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      installApp();
                      sessionStorage.setItem('pwaRewardClaimed', 'true');
                    }}
                    disabled={isInstalled}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:scale-105 transition-transform flex items-center gap-2 disabled:opacity-50 shadow-sm"
                  >
                    {isInstalled ? t('Installed') : t('Install (+3 Days)')}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Review Task */}
              {showReviewTask && (
                <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                      <MessageCircle className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm">{t('Submit a Review')}</h4>
                        <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          +5 Days
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">{t('Rate our app & share feedback')}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => navigate('/reviews')}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:scale-105 transition-transform flex items-center gap-2 shadow-sm"
                  >
                    {t('Write Review (+5 Days)')}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Referral Activity */}
        {!isLoadingStats && referredUsersList.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold px-1 flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-500" />
              {t('Recent Referral Activity')}
            </h3>
            
            <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {referredUsersList.map((user, i) => (
                  <motion.div 
                    key={user.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:bg-white dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        user.isActivated ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
                      }`}>
                        {(user.displayName || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold truncate text-zinc-800 dark:text-zinc-200">
                          {user.displayName || 'User'}
                        </span>
                        <span className="text-[10px] text-zinc-400 mt-0.5">
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : t('Recently')}
                          {' • '}
                          <span className={`font-semibold ${user.status === 'paid' ? 'text-emerald-500' : 'text-zinc-500'}`}>
                            {user.status === 'paid' ? t('Paid User') : t('Login')}
                          </span>
                          {user.code && (
                            <>
                              {' • '}
                              <span className="text-zinc-500">{t('Code')}: <span className="font-mono">{user.code}</span></span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                    
                    {/* Rewards Controls */}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 justify-end">
                      {/* 1. Signup Reward */}
                      <div className="flex items-center gap-2">
                        {!user.signupClaimed ? (
                          <button
                            onClick={() => claimReward(user.id, 'signup')}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
                          >
                            <Gift className="w-3.5 h-3.5" />
                            {t('Claim Signup (+5 Days)')}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-md border border-emerald-100 dark:border-emerald-900/30">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            {t('Signup Claimed (+5)')}
                          </span>
                        )}
                      </div>

                      {/* 2. Activation Reward */}
                      <div className="flex items-center gap-2">
                        {user.isActivated ? (
                          !user.activationClaimed ? (
                            <button
                              onClick={() => claimReward(user.id, 'activation')}
                              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
                            >
                              <Crown className="w-3.5 h-3.5" />
                              {t('Claim Activation (+5 Days)')}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-md border border-emerald-100 dark:border-emerald-900/30">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              {t('Activation Claimed (+5)')}
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] text-zinc-400 italic bg-zinc-100 dark:bg-zinc-800/80 px-2 py-1 rounded-md">
                            {t('Pending activation for +5 days')}
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
        <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 border-dashed">
          <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            {t('How it works')}
          </h4>
          <ul className="space-y-2.5">
            <li className="text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-2">
              <span className="text-emerald-500 font-bold">•</span>
              <span><strong className="text-zinc-800 dark:text-zinc-200">{t('Referral Signup (+5 Days)')}:</strong> {t('Share your link/code with friends to get 5 days extension for every friend who joins.')}</span>
            </li>
            <li className="text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-2">
              <span className="text-emerald-500 font-bold">•</span>
              <span><strong className="text-zinc-800 dark:text-zinc-200">{t('Referral Activation (+5 Days)')}:</strong> {t('Get an extra 5 days extension when your referred friend purchases a membership.')}</span>
            </li>
            {showInstallTask && (
              <li className="text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-2">
                <span className="text-emerald-500 font-bold">•</span>
                <span><strong className="text-zinc-800 dark:text-zinc-200">{t('Install App (+3 Days)')}:</strong> {t('Install our PWA app on your home screen for a 3 days membership extension.')}</span>
              </li>
            )}
            {showNotificationTask && (
              <li className="text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-2">
                <span className="text-emerald-500 font-bold">•</span>
                <span><strong className="text-zinc-800 dark:text-zinc-200">{t('Enable Notifications (+3 Days)')}:</strong> {t('Enable push notifications to stay updated and get a 3 days membership extension.')}</span>
              </li>
            )}
            {showReviewTask && (
              <li className="text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-2">
                <span className="text-emerald-500 font-bold">•</span>
                <span><strong className="text-zinc-800 dark:text-zinc-200">{t('Submit a Review (+5 Days)')}:</strong> {t('Write a review and rate our app to get a free 5 days membership extension.')}</span>
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
