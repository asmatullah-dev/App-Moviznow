import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Helmet } from 'react-helmet';
import { Star, Edit, Trash2, MessageSquare, ArrowLeft, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { fetchReviewsFromChunks, saveReviewToChunk, deleteReviewFromChunk } from '../../utils/chunkUtils';
import { safeStorage } from '../../utils/safeStorage';
import ConfirmModal from '../../components/ConfirmModal';

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

import { Header } from "../../components/Header";
import { ContactSupportButtons } from "../../components/ContactSupportButtons";
import { PageTransition } from "../../components/PageTransition";

// Use the same keys as chunkUtils.ts for consistency
const CACHE_KEY = 'cached_reviews_data';

export default function Reviews() {
  const { t } = useLanguage();
  const { profile, updateUserProfileData } = useAuth();
  const [city, setCity] = useState('');
  const { settings } = useSettings();
  const appName = settings?.headerText || 'MovizNow';
  const navigate = useNavigate();
  
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [reviewIdToDelete, setReviewIdToDelete] = useState<string | null>(null);

  const totalReviews = reviews.length;
  const averageRating = totalReviews > 0 
    ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / totalReviews).toFixed(1) 
    : "0.0";
  
  useEffect(() => {
    const loadReviews = async () => {
      // 1. Synchronously load from cache first for truly immediate display
      try {
        const cachedData = safeStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setReviews(parsed);
            setLoading(false); // Hide spinner if we have meaningful cached data
            if (profile?.uid && parsed.some((r: any) => r.userId === profile.uid || (profile.email && r.userEmail === profile.email))) {
              safeStorage.setItem('has_rated', 'true');
            }
          }
        }
      } catch (e) {
        console.error("Failed to load cached reviews:", e);
      }

      // 2. Fetch fresh data from Firestore
      setSyncing(true);
      try {
        const data = await fetchReviewsFromChunks(true);
        if (data) {
          setReviews(data);
          if (profile?.uid && data.some((r: any) => r.userId === profile.uid || (profile.email && r.userEmail === profile.email))) {
            safeStorage.setItem('has_rated', 'true');
          }
        }
      } catch (e) {
        console.error("Failed to load reviews from Firestore:", e);
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    };
    loadReviews();
  }, [profile?.uid, profile?.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return alert('Please login to review');
    if (!text.trim()) return;
    
    const userReviewsCount = reviews.filter(r => r.userId === profile.uid).length;
    if (userReviewsCount >= 2) {
      return alert('You can only post up to 2 reviews.');
    }
    
    setSubmitting(true);
    // Update user city if provided
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
      text,
      date: new Date().toISOString(),
      city: profile.city || city.trim() || undefined
    };
    
    try {
      await saveReviewToChunk(newReview);
      const updatedReviews = [newReview, ...reviews];
      setReviews(updatedReviews);
      safeStorage.setItem(CACHE_KEY, JSON.stringify(updatedReviews));
      safeStorage.setItem('has_rated', 'true');

      // Grant +5 days extension reward if not already claimed
      if (profile && !profile.reviewRewardClaimed) {
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
          if (!profile.status || ['expired', 'pending'].includes(profile.status.toLowerCase())) {
            updates.status = 'active';
          }
          await updateUserProfileData(updates);
          sessionStorage.setItem('reviewRewardClaimed', 'true');
        } catch (err) {
          console.error("Failed to extend membership for review", err);
        }
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

  const isAdminOrOwner = profile?.role === 'admin' || profile?.role === 'owner';

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col transition-colors duration-300">
      <Helmet>
        <title>{appName} - {t("Reviews")}</title>
      </Helmet>

      <Header showBackButton={true} />
      
      <PageTransition className="flex-1 w-full">
        <main className="max-w-3xl mx-auto px-4 mt-8 pb-12 w-full">
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight flex items-center justify-center gap-3">
            {t("User Reviews")}
            {syncing && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-medium"
              >
                <Loader2 className="w-3 h-3 animate-spin" />
                {t("Syncing...")}
              </motion.div>
            )}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            {t("See what others are saying about %APP_NAME%").replace("%APP_NAME%", appName)}
          </p>

          <div className="flex items-center justify-center gap-2 mt-4">
            <div className="text-4xl font-bold">{averageRating}</div>
            <div className="flex flex-col items-start gap-1">
              <div className="flex">
                {[1, 2, 3, 4, 5].map(star => (
                  <Star key={`avg-star-${star}`} className={`w-5 h-5 ${star <= Math.round(Number(averageRating)) ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-300 dark:text-zinc-700'}`} />
                ))}
              </div>
              <span className="text-xs text-zinc-500">{t("Based on %COUNT% reviews").replace("%COUNT%", totalReviews.toString())}</span>
            </div>
          </div>
        </div>

        {profile && reviews.filter(r => r.userId === profile.uid).length < 2 && (
          <form onSubmit={handleSubmit} className="bg-zinc-50 dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 mb-12">
            <h3 className="font-bold text-lg mb-4">{t("Write a Review")}</h3>
            <div className="flex gap-2 mb-4">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-1 focus:outline-none"
                >
                  <Star className={`w-8 h-8 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-300 dark:text-zinc-700'}`} />
                </button>
              ))}
            </div>
            {!profile.city && (
              <div className="mb-4">
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={t("Your City (Optional)")}
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-white"
                />
              </div>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("Share your experience...")}
              className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-4 text-zinc-900 dark:text-white"
              required
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={submitting}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-8 rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageSquare className="w-5 h-5" />} 
              {submitting ? t("Submitting...") : t("Submit Review")}
            </button>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {reviews.map(review => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={review.id}
                className="bg-white dark:bg-zinc-950 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="font-bold text-lg">
                      {review.userName}
                      {review.city && <span className="text-zinc-500 font-normal text-sm ml-2">({review.city})</span>}
                    </div>
                    <div className="text-xs text-zinc-500">{new Date(review.date).toLocaleDateString()}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star key={star} className={`w-4 h-4 ${star <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-300 dark:text-zinc-700'}`} />
                      ))}
                    </div>
                    {isAdminOrOwner && (
                      <button
                        onClick={() => openDeleteModal(review.id)}
                        className="text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 p-2 rounded-full transition-colors"
                        title={t("Delete Review")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {review.text}
                </p>
              </motion.div>
            ))}
            {reviews.length === 0 && (
               <div className="text-center py-12 text-zinc-500">{t("No reviews yet. Be the first to review!")}</div>
            )}
          </div>
        )}

        <div className="mt-12 border-t border-zinc-200 dark:border-zinc-800 pt-8">
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
