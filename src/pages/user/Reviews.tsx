import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Helmet } from 'react-helmet';
import { 
  Star, 
  Trash2, 
  MessageSquare, 
  Loader2, 
  Sparkles, 
  Gift, 
  CheckCircle2, 
  MapPin, 
  ShieldCheck, 
  UserCheck, 
  TrendingUp, 
  Filter, 
  Zap 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { fetchReviewsFromChunks, saveReviewToChunk, deleteReviewFromChunk } from '../../utils/chunkUtils';
import { safeStorage } from '../../utils/safeStorage';
import ConfirmModal from '../../components/ConfirmModal';
import { Header } from "../../components/Header";
import { ContactSupportButtons } from "../../components/ContactSupportButtons";
import { PageTransition } from "../../components/PageTransition";
import confetti from 'canvas-confetti';

interface Review {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  text: string;
  date: string;
  city?: string;
  userEmail?: string;
}

const CACHE_KEY = 'cached_reviews_data';

export default function Reviews() {
  const { t, language } = useLanguage();
  const { user, profile, loading: authProfileLoading, authLoading, updateUserProfileData } = useAuth();
  const [city, setCity] = useState('');
  const { settings } = useSettings();
  const appName = settings?.headerText || 'MovizNow';
  const navigate = useNavigate();
  
  const isLoggedIn = Boolean(user || profile?.uid);
  
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filterRating, setFilterRating] = useState<number | 'all' | 'mine'>('all');
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [reviewIdToDelete, setReviewIdToDelete] = useState<string | null>(null);

  const totalReviews = reviews.length;
  const averageRating = useMemo(() => {
    if (totalReviews === 0) return "5.0";
    const sum = reviews.reduce((acc, curr) => acc + (curr.rating || 5), 0);
    return (sum / totalReviews).toFixed(1);
  }, [reviews, totalReviews]);

  // Rating Distribution breakdown
  const ratingCounts = useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(r => {
      const star = Math.min(5, Math.max(1, Math.round(r.rating || 5)));
      counts[star as keyof typeof counts] = (counts[star as keyof typeof counts] || 0) + 1;
    });
    return counts;
  }, [reviews]);

  useEffect(() => {
    const loadReviews = async () => {
      try {
        const cachedData = safeStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setReviews(parsed);
            setLoading(false);
            if (profile?.uid && parsed.some((r: any) => r.userId === profile.uid || (profile.email && r.userEmail === profile.email))) {
              safeStorage.setItem('has_rated', 'true');
            }
          }
        }
      } catch (e) {
        console.error("Failed to load cached reviews:", e);
      }

      setSyncing(true);
      try {
        const data = await fetchReviewsFromChunks(false, false);
        if (data) {
          setReviews(data);
          if (profile?.uid && data.some((r: any) => r.userId === profile.uid || (profile.email && r.userEmail === profile.email))) {
            safeStorage.setItem('has_rated', 'true');
          }
        }
      } catch (e) {
        console.error("Failed to load reviews:", e);
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    };
    loadReviews();
  }, [profile?.uid, profile?.email, authLoading, authProfileLoading]);

  const triggerConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#f43f5e', '#a855f7', '#f59e0b', '#10b981']
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return navigate('/login');
    if (!text.trim()) return;
    
    const userReviewsCount = reviews.filter(r => r.userId === profile.uid).length;
    if (userReviewsCount >= 2) {
      return alert(t('You have submitted the maximum allowed 2 reviews per account. Thank you for your feedback!'));
    }
    
    setSubmitting(true);
    if (city.trim() && !profile.city) {
      try {
        await updateUserProfileData({ city: city.trim() });
      } catch (err) {
        console.error("Failed to update city", err);
      }
    }

    const newReview: Review = {
      id: Date.now().toString(),
      userId: profile.uid || Date.now().toString(),
      userName: profile.displayName || profile.phone || 'User',
      rating,
      text: text.trim(),
      date: new Date().toISOString(),
      city: profile.city || city.trim() || undefined
    };
    
    try {
      await saveReviewToChunk(newReview);
      
      // After saving, sync with Firestore to ensure we have the latest server state
      // This fulfills the "sync with Firestore only when logged in user submits" requirement
      const updatedReviews = await fetchReviewsFromChunks(true, true);
      setReviews(updatedReviews);
      safeStorage.setItem(CACHE_KEY, JSON.stringify(updatedReviews));
      safeStorage.setItem('has_rated', 'true');

      // Grant +5 days extension reward if not already claimed
      if (profile && !profile.reviewRewardClaimed) {
        try {
          let baseDate = new Date();
          if (profile.expiryDate && profile.expiryDate !== 'Lifetime') {
            const parts = profile.expiryDate.split('T')[0].split('-');
            if (parts.length === 3) {
              const expDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59, 999);
              if (expDate > baseDate) baseDate = expDate;
            }
          }
          baseDate.setDate(baseDate.getDate() + 5);
          const dateStr = baseDate.toISOString().split('T')[0];
          const updates: any = {
            reviewRewardClaimed: true,
            expiryDate: `${dateStr}T23:59:59.999Z`
          };
          if (profile.expiryDate !== 'Lifetime') {
            updates.status = 'active';
          }
          await updateUserProfileData(updates);
          sessionStorage.setItem('reviewRewardClaimed', 'true');
          triggerConfetti();
        } catch (err) {
          console.error("Failed to extend membership for review", err);
        }
      } else {
        triggerConfetti();
      }

      if ((window as any).triggerSyncUserData) {
        (window as any).triggerSyncUserData('review_made');
      }

      setText('');
      setRating(5);
      setCity('');
    } catch (e) {
      alert('Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const openDeleteModal = (id: string) => {
    setReviewIdToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!reviewIdToDelete) return;
    
    try {
      await deleteReviewFromChunk(reviewIdToDelete);
      const updatedReviews = reviews.filter(r => r.id !== reviewIdToDelete);
      setReviews(updatedReviews);
      safeStorage.setItem(CACHE_KEY, JSON.stringify(updatedReviews));
      if (profile?.uid && !updatedReviews.some(r => r.userId === profile.uid || (profile.email && r.userEmail === profile.email))) {
        safeStorage.removeItem('has_rated');
      }
      setIsDeleteModalOpen(false);
      setReviewIdToDelete(null);
    } catch (e) {
      alert('Failed to delete review');
      throw e;
    }
  };

  const filteredReviews = useMemo(() => {
    if (filterRating === 'all') return reviews;
    if (filterRating === 'mine') return reviews.filter(r => r.userId === profile?.uid);
    return reviews.filter(r => Math.round(r.rating) === filterRating);
  }, [reviews, filterRating, profile?.uid]);

  const isAdminOrOwner = profile?.role === 'admin' || profile?.role === 'owner';
  const myReviewsCount = profile ? reviews.filter(r => r.userId === profile.uid).length : 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col relative overflow-hidden">
      <Helmet>
        <title>{appName} - {t("User Reviews")}</title>
      </Helmet>

      <Header showBackButton={true} />

      {/* Ambient Lighting Background */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-full max-w-6xl h-96 bg-gradient-to-r from-amber-600/15 via-rose-600/15 to-purple-600/15 blur-3xl pointer-events-none rounded-full" />
      <div className="absolute top-[28rem] right-0 w-80 h-80 bg-rose-500/10 blur-3xl pointer-events-none rounded-full" />
      <div className="absolute top-[45rem] left-0 w-80 h-80 bg-amber-500/10 blur-3xl pointer-events-none rounded-full" />
      
      <PageTransition className="flex-1 w-full relative z-10">
        <main className="max-w-4xl mx-auto px-4 pt-6 pb-16 w-full space-y-8">
          
          {/* Hero Ratings Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900/90 via-zinc-950/90 to-zinc-900/90 border border-rose-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
              
              {/* Left Column: Title & Subtitle */}
              <div className="space-y-3 text-center md:text-left flex-1" dir={language === 'ur' ? 'rtl' : 'ltr'}>
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-gradient-to-r from-amber-500/20 to-rose-500/20 border border-amber-500/30 text-amber-300">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t("Reviews & Ratings")}</span>
                  {syncing && (
                    <span className="flex items-center gap-1 text-[11px] text-zinc-400 ml-2">
                      <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                      {t("Syncing...")}
                    </span>
                  )}
                </div>

                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight">
                  {t("User Reviews")}
                </h1>
                
                <p className="text-zinc-300 text-xs sm:text-sm max-w-lg leading-relaxed">
                  {t("See what others are saying about %APP_NAME%").replace("%APP_NAME%", appName)}
                </p>

                {/* Reward Callout Pill */}
                {profile && !profile.reviewRewardClaimed && (
                  <div className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-500/15 via-amber-500/15 to-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold animate-pulse">
                    <Gift className="w-4 h-4 text-amber-400" />
                    <span>🎁 {t("Submit a Review (+5 Days)")} - {t("Get 5 Days Free Basic Access!")}</span>
                  </div>
                )}
              </div>

              {/* Right Column: Rating Score Card & Distribution */}
              <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-6 shadow-inner w-full md:w-auto shrink-0">
                {/* Score Number Badge */}
                <div className="flex flex-col items-center justify-center text-center pr-0 sm:pr-6 sm:border-r sm:border-zinc-800 w-full sm:w-auto">
                  <div className="text-5xl font-black text-white tracking-tighter flex items-center gap-1">
                    <span>{averageRating}</span>
                    <Star className="w-8 h-8 fill-amber-400 text-amber-400 animate-pulse" />
                  </div>
                  <div className="flex gap-1 mt-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star 
                        key={`hero-star-${star}`} 
                        className={`w-4 h-4 ${star <= Math.round(Number(averageRating)) ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'}`} 
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-bold text-zinc-400 mt-1.5">
                    {t("Based on %COUNT% reviews").replace("%COUNT%", totalReviews.toString())}
                  </span>
                </div>

                {/* Rating Distribution Bars */}
                <div className="space-y-1.5 w-full sm:w-44">
                  {[5, 4, 3, 2, 1].map(num => {
                    const count = ratingCounts[num as keyof typeof ratingCounts] || 0;
                    const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
                    return (
                      <div key={`dist-${num}`} className="flex items-center gap-2 text-xs">
                        <span className="font-bold text-zinc-400 w-3">{num}</span>
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-amber-400 to-rose-500 rounded-full transition-all duration-500" 
                            style={{ width: `${pct}%` }} 
                          />
                        </div>
                        <span className="text-[10px] text-zinc-500 w-6 text-right font-mono">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>

          {/* Not Logged In Banner */}
          {!isLoggedIn && !authLoading && !authProfileLoading && (
            <div className="bg-gradient-to-r from-rose-950/60 via-purple-950/50 to-amber-950/60 border border-rose-500/30 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
              <div className="space-y-1 text-center sm:text-left" dir={language === 'ur' ? 'rtl' : 'ltr'}>
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <Gift className="w-5 h-5 text-amber-400" />
                  <h3 className="font-extrabold text-base sm:text-lg text-white">{t("Write a Review")}</h3>
                </div>
                <p className="text-xs sm:text-sm text-zinc-300">
                  {t("Log in to your account to post a review and get +5 Days free membership!")}
                </p>
              </div>
              <button
                onClick={() => navigate('/login')}
                className="bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold py-3 px-6 rounded-xl transition-all shrink-0 text-xs sm:text-sm shadow-lg shadow-rose-600/25 active:scale-95 w-full sm:w-auto"
              >
                {t("Log In to Review")}
              </button>
            </div>
          )}

          {/* Max Reviews Reached Alert */}
          {profile && myReviewsCount >= 2 && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl text-center text-xs sm:text-sm text-emerald-300 font-bold flex items-center justify-center gap-2 shadow-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>{t("You have submitted the maximum allowed 2 reviews per account. Thank you for your feedback!")}</span>
            </div>
          )}

          {/* Review Submission Form */}
          {profile && myReviewsCount < 2 && (
            <motion.form 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleSubmit} 
              className="bg-gradient-to-b from-zinc-900/95 to-zinc-950/95 border border-rose-500/30 rounded-3xl p-6 sm:p-7 shadow-2xl backdrop-blur-md relative overflow-hidden space-y-5"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div>
                  <h3 className="font-extrabold text-lg sm:text-xl text-white flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-rose-400" />
                    <span>{t("Write a Review")}</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {t("Share your honest experience and earn 5 days of free Basic access!")}
                  </p>
                </div>
                {!profile.reviewRewardClaimed && (
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-md animate-bounce">
                    +5 {t('Days')} Basic
                  </span>
                )}
              </div>

              {/* Star Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 block">
                  {t("Overall Rating")}
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map(star => {
                    const activeRating = hoverRating || rating;
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="p-1.5 hover:scale-125 transition-transform focus:outline-none"
                      >
                        <Star 
                          className={`w-8 h-8 sm:w-9 sm:h-9 transition-colors ${
                            star <= activeRating 
                              ? 'fill-amber-400 text-amber-400 filter drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' 
                              : 'text-zinc-700 hover:text-zinc-500'
                          }`} 
                        />
                      </button>
                    );
                  })}
                  <span className="text-sm font-extrabold text-amber-400 ml-2 font-mono">
                    {hoverRating || rating} / 5
                  </span>
                </div>
              </div>

              {/* Optional City Input */}
              {!profile.city && (
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 block">
                    {t("Your City (Optional)")}
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Lahore, Karachi, Rawalpindi"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500 text-white text-sm placeholder:text-zinc-600"
                    />
                  </div>
                </div>
              )}

              {/* Review Text */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 block">
                  {t("Review Text")}
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t("Share your experience...")}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500 text-white text-sm placeholder:text-zinc-600 leading-relaxed"
                  required
                  disabled={submitting}
                />
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  disabled={submitting || !text.trim()}
                  className="bg-gradient-to-r from-rose-600 via-purple-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold py-3.5 px-8 rounded-xl transition-all flex items-center gap-2.5 disabled:opacity-50 shadow-xl shadow-rose-600/30 text-sm active:scale-95"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{t("Submitting...")}</span>
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-5 h-5" />
                      <span>{t("Submit Review (+5 Days)")}</span>
                    </>
                  )}
                </button>
              </div>
            </motion.form>
          )}

          {/* Filters Bar */}
          <div className="flex items-center justify-between flex-wrap gap-3 border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-300">
                {t("Reviews")} ({filteredReviews.length})
              </span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {(['all', 5, 4, 3, 'mine'] as const).map(option => {
                if (option === 'mine' && !profile) return null;
                const isActive = filterRating === option;
                let label = option === 'all' ? t('All') : option === 'mine' ? t('My Reviews') : `${option} ★`;
                return (
                  <button
                    key={`filter-${option}`}
                    onClick={() => setFilterRating(option)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all shrink-0 ${
                      isActive 
                        ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-md' 
                        : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reviews List */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
              <span className="text-xs font-bold text-zinc-500">{t("Loading...")}</span>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {filteredReviews.map((review, i) => {
                  const initials = (review.userName || 'U').charAt(0).toUpperCase();
                  const isMyReview = profile && review.userId === profile.uid;

                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: i * 0.04 }}
                      key={review.id}
                      className={`p-5 sm:p-6 rounded-2xl border transition-all shadow-lg backdrop-blur-md relative ${
                        isMyReview 
                          ? 'bg-gradient-to-b from-rose-950/30 via-zinc-900/90 to-zinc-950/90 border-rose-500/40 shadow-rose-950/30' 
                          : 'bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border-zinc-800/80 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-500 via-purple-500 to-amber-500 flex items-center justify-center text-white font-black text-sm shadow-md shrink-0 border border-white/20">
                            {initials}
                          </div>

                          <div dir={language === 'ur' ? 'rtl' : 'ltr'}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-white text-sm sm:text-base">
                                {review.userName}
                              </span>
                              {isMyReview && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  {t("My Review")}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                <ShieldCheck className="w-3 h-3 text-amber-400" />
                                {t("Verified Member")}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400">
                              {review.city && (
                                <span className="flex items-center gap-1 text-zinc-300 font-medium">
                                  <MapPin className="w-3 h-3 text-rose-400" />
                                  {review.city}
                                </span>
                              )}
                              {review.city && <span>•</span>}
                              <span>{new Date(review.date).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        {/* Rating Stars & Controls */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex items-center gap-0.5 bg-zinc-950/80 px-2.5 py-1 rounded-lg border border-zinc-800">
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star 
                                key={`rev-star-${review.id}-${star}`} 
                                className={`w-3.5 h-3.5 ${star <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'}`} 
                              />
                            ))}
                            <span className="text-xs font-bold text-amber-400 ml-1 font-mono">{review.rating}</span>
                          </div>

                          {isAdminOrOwner && (
                            <button
                              onClick={() => openDeleteModal(review.id)}
                              className="text-zinc-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                              title={t("Delete Review")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Review Content */}
                      <p className="text-zinc-200 text-xs sm:text-sm leading-relaxed pl-1 sm:pl-13 font-normal" dir={language === 'ur' ? 'rtl' : 'ltr'}>
                        "{review.text}"
                      </p>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {filteredReviews.length === 0 && (
                <div className="text-center py-16 bg-zinc-900/50 rounded-3xl border border-zinc-800/80 p-8 space-y-3">
                  <MessageSquare className="w-10 h-10 text-zinc-600 mx-auto" />
                  <p className="text-zinc-400 text-sm font-medium">
                    {t("No reviews yet. Be the first to review!")}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Support Section */}
          <div className="mt-12 border-t border-zinc-800/80 pt-8">
            <ContactSupportButtons />
          </div>
        </main>
      </PageTransition>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        title={t("Delete Review")}
        message={t("Are you sure you want to delete this review? This action cannot be undone.")}
        onConfirm={handleDelete}
        onCancel={() => {
          setIsDeleteModalOpen(false);
          setReviewIdToDelete(null);
        }}
        confirmText={t("Delete")}
        cancelText={t("Cancel")}
      />
    </div>
  );
}
