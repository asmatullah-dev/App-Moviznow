import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
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
  MessageCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { Header } from '../../components/Header';

export default function Rewards() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const { isInstalled, isInstallable, installApp } = usePWA();
  const [copied, setCopied] = useState(false);
  const [referredCount, setReferredCount] = useState(0);
  const [activatedCount, setActivatedCount] = useState(0);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const referralLink = `${window.location.origin}/?ref=${profile?.referralCode || ''}`;

  const showNotificationTask = 'Notification' in window && Notification.permission !== 'granted';
  const showInstallTask = isInstallable || isInstalled;

  useEffect(() => {
    const fetchReferralStats = async () => {
      if (!profile?.uid) return;
      try {
        const q = query(
          collection(db, 'users'),
          where('referredBy', '==', profile.uid),
          limit(500)
        );
        const snap = await getDocs(q);
        setReferredCount(snap.size);
        
        let activated = 0;
        snap.docs.forEach(doc => {
          const data = doc.data();
          // Count as activated if they have orders or activation reward was claimed for them
          if ((data.orders && data.orders.length > 0) || data.activationRewardClaimed) {
            activated++;
          }
        });
        setActivatedCount(activated);
      } catch (e) {
        console.error("Error fetching referral stats:", e);
      } finally {
        setIsLoadingStats(false);
      }
    };
    fetchReferralStats();
  }, [profile?.uid]);

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEnableNotifications = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        // App.tsx RewardsManager will handle the actual reward claim
        window.location.reload();
      }
    }
  };

  const handleCopyLink = handleCopy;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: t('Join MovizNow'),
          text: t('Get 5 days of premium membership for free on MovizNow!'),
          url: referralLink,
        });
      } catch (err) {
        console.error('Share failed:', err);
      }
    } else {
      handleCopyLink();
    }
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(`${t('Get 5 days of premium membership for free on MovizNow!')}\n${referralLink}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareTelegram = () => {
    const text = encodeURIComponent(t('Get 5 days of premium membership for free on MovizNow!'));
    window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${text}`, '_blank');
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
      value: (referredCount * 5) + (activatedCount * 5) + (profile?.pwaRewardClaimed ? 3 : 0) + (profile?.notificationRewardClaimed ? 3 : 0),
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
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            <Gift className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-bold">{t('Rewards & Referrals')}</h1>
        </div>
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

        {/* Tasks Section */}
        {(showNotificationTask || showInstallTask) && (
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
                      <h4 className="font-bold text-sm">{t('Enable Notifications')}</h4>
                      <p className="text-xs text-zinc-500">{t('Stay updated with latest content')}</p>
                    </div>
                  </div>
                  {profile?.notificationRewardClaimed ? (
                    <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs bg-emerald-500/10 px-3 py-1.5 rounded-full">
                      <CheckCircle2 className="w-4 h-4" />
                      {t('Claimed')}
                    </div>
                  ) : (
                    <button 
                      onClick={handleEnableNotifications}
                      className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2 rounded-xl text-xs font-bold hover:scale-105 transition-transform flex items-center gap-2"
                    >
                      {t('Enable')}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
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
                      <h4 className="font-bold text-sm">{t('Install App')}</h4>
                      <p className="text-xs text-zinc-500">{t('Better experience on home screen')}</p>
                    </div>
                  </div>
                  {profile?.pwaRewardClaimed ? (
                    <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs bg-emerald-500/10 px-3 py-1.5 rounded-full">
                      <CheckCircle2 className="w-4 h-4" />
                      {t('Claimed')}
                    </div>
                  ) : (
                    <button 
                      onClick={() => installApp()}
                      disabled={isInstalled}
                      className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2 rounded-xl text-xs font-bold hover:scale-105 transition-transform flex items-center gap-2 disabled:opacity-50"
                    >
                      {isInstalled ? t('Installed') : t('Install')}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Information Section */}
        <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 border-dashed">
          <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            {t('How it works')}
          </h4>
          <ul className="space-y-2">
            {[
              t('Share your unique link or code with friends.'),
              t('Both you and your friend get 5 days of premium instantly when they sign up!'),
              t('Get another 5 days for yourself when your friend activates their membership.'),
              t('Membership is extended automatically from your current expiry.')
            ].map((text, i) => (
              <li key={i} className="text-xs text-zinc-500 flex gap-2">
                <span className="text-zinc-400 font-bold">•</span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
