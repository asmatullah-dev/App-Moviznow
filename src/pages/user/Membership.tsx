import React, { useState, useEffect } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { 
  CheckCircle, 
  MessageCircle, 
  Crown, 
  Sparkles, 
  Zap, 
  Tv, 
  Film, 
  ShieldCheck, 
  ArrowRight, 
  Flame,
  Star,
  Gift,
  Check,
  Percent,
  TrendingUp,
  Award
} from 'lucide-react';
import { standardizePhone } from '../../contexts/AuthContext';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { useContent } from '../../contexts/ContentContext';
import { Content } from '../../types';
import { motion } from 'motion/react';

import { Header } from "../../components/Header";
import { ContactSupportButtons } from "../../components/ContactSupportButtons";
import { PageTransition } from "../../components/PageTransition";

export default function Membership() {
  const { settings } = useSettings();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { contentList, collections } = useContent();
  const [trendingMovies, setTrendingMovies] = useState<Content[]>([]);
  const appName = settings?.headerText || 'MovizNow';

  const handleSelectPlan = (planId: string) => {
    navigate('/top-up', { state: { planId } });
  };

  useEffect(() => {
    const trendingColl = collections.find(c => c.title.toLowerCase() === 'trending');
    if (trendingColl && trendingColl.contentIds) {
      const trending = trendingColl.contentIds
        .map(id => contentList.find(c => c.id === id))
        .filter((c): c is Content => !!c && c.type === 'movie');
      setTrendingMovies(trending);
    } else if (contentList.length > 0) {
      const fallback = contentList
        .filter(c => c.type === 'movie' && c.posterUrl)
        .sort(() => 0.5 - Math.random())
        .slice(0, 6);
      setTrendingMovies(fallback);
    }
  }, [contentList, collections]);

  const handleWhatsappClick = (plan: string, price: string) => {
    const adminPhone = standardizePhone(settings?.supportNumber || "3363284466").replace("+", "");
    const msg = `Assalam O Alaikum! I want to get the ${plan} plan for ${price}.`;
    window.open(`https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col relative overflow-hidden">
      <Helmet>
        <title>{appName} - {t("Membership")}</title>
      </Helmet>

      <Header showBackButton={true} />

      {/* Ambient Glows */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-r from-amber-600/15 via-purple-600/15 to-emerald-600/15 blur-[120px] pointer-events-none rounded-full animate-pulse" />
      <div className="absolute top-[45rem] -left-20 w-[400px] h-[400px] bg-emerald-500/15 blur-[100px] pointer-events-none rounded-full" />
      <div className="absolute top-[75rem] -right-20 w-[400px] h-[400px] bg-rose-500/15 blur-[100px] pointer-events-none rounded-full" />

      <PageTransition className="flex-1 w-full relative z-10">
        <main className="max-w-6xl mx-auto px-4 pt-6 pb-20 w-full space-y-16">
          
          {/* Hero Header */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden bg-gradient-to-br from-zinc-900/90 via-zinc-950/95 to-zinc-900/90 border border-amber-500/30 rounded-3xl p-6 sm:p-12 shadow-2xl backdrop-blur-2xl text-center space-y-5"
          >
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-80" />

            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-gradient-to-r from-amber-500/20 to-emerald-500/20 border border-amber-500/30 text-amber-300 shadow-inner">
              <Crown className="w-4 h-4 text-amber-400" />
              <span>{t("VIP Membership & Pricing")}</span>
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-tight max-w-3xl mx-auto">
              {t("Simple, honest pricing")}
            </h1>

            <p className="text-zinc-300 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
              {t("Pay per title, or join the group and get 6–7 fresh HD movies delivered every single day.")}
            </p>

            {/* Guarantees Ribbon */}
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 pt-4 text-xs sm:text-sm font-bold text-zinc-300">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Check className="w-4 h-4" /> {t("Instant Activation")}
              </span>
              <span className="flex items-center gap-1.5 text-amber-400">
                <Star className="w-4 h-4 fill-current" /> {t("Daily Fresh HD Uploads")}
              </span>
              <span className="flex items-center gap-1.5 text-purple-400">
                <ShieldCheck className="w-4 h-4" /> {t("No Hidden Fees")}
              </span>
            </div>
          </motion.div>

          {/* Basic User Plans (With Ads) - FIRST SECTION */}
          <div className="space-y-6">
            <div className="text-center space-y-2 max-w-2xl mx-auto">
              <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-sky-500/10 border border-sky-500/30 text-sky-400 shadow-sm">
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>{t("Basic User (With Ads)")}</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                {t("Basic User Plans")}
              </h2>
              <p className="text-xs sm:text-sm text-zinc-300">
                {t("Full access to our entire catalog of HD movies and web series with occasional ads at super budget-friendly prices.")}
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Basic 1 Month */}
              <motion.div 
                whileHover={{ y: -6 }}
                className="bg-gradient-to-b from-sky-950/40 via-zinc-900/90 to-zinc-950/95 border border-sky-500/30 hover:border-sky-400 rounded-3xl p-6 flex flex-col justify-between shadow-xl backdrop-blur-xl relative"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      {t("Entry Level")}
                    </span>
                    <span className="text-[10px] font-bold text-zinc-400">{t("With Ads")}</span>
                  </div>
                  <h3 className="text-xl font-extrabold text-white mb-1">{t("1 Month")}</h3>
                  <div className="text-3xl font-black text-sky-400 mb-1">{t("PKR 50")}</div>
                  <p className="text-zinc-500 mb-4 text-xs font-bold">{t("≈ PKR 50/month")}</p>
                  <p className="text-xs font-bold text-zinc-400 mb-5 min-h-[32px]">{t("Monthly starter plan")}</p>
                  
                  <ul className="space-y-3 mb-6 text-xs text-zinc-300">
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-sky-400 shrink-0" /> <span>{t("All movies & web series")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-sky-400 shrink-0" /> <span>{t("Full HD 1080p quality")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-sky-400 shrink-0" /> <span>{t("Supported by ads")}</span></li>
                  </ul>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSelectPlan('basic_1m')}
                  className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white py-3.5 rounded-2xl font-black transition-all text-xs shadow-md shadow-sky-500/25 tracking-wide uppercase cursor-pointer"
                >
                  {t("Join Basic Plan")}
                </motion.button>
              </motion.div>

              {/* Basic 3 Months */}
              <motion.div 
                whileHover={{ y: -6 }}
                className="bg-gradient-to-b from-sky-950/40 via-zinc-900/90 to-zinc-950/95 border border-sky-500/30 hover:border-sky-400 rounded-3xl p-6 flex flex-col justify-between shadow-xl backdrop-blur-xl relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 bg-sky-500 text-white text-[10px] font-black uppercase px-3.5 py-1 rounded-bl-xl shadow-md">
                  {t("Save 7%")}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      {t("Quarterly")}
                    </span>
                    <span className="text-[10px] font-bold text-zinc-400">{t("With Ads")}</span>
                  </div>
                  <h3 className="text-xl font-extrabold text-white mb-1">{t("3 Months")}</h3>
                  <div className="text-3xl font-black text-sky-400 mb-1">{t("PKR 140")}</div>
                  <p className="text-zinc-500 mb-4 text-xs font-bold">{t("≈ PKR 46/month")}</p>
                  <p className="text-xs font-bold text-zinc-300 mb-5 min-h-[32px]">
                    <span className="line-through text-zinc-500">{t("PKR 150")}</span> <span className="text-sky-400 font-bold">{t("Save PKR 10")}</span>
                  </p>
                  
                  <ul className="space-y-3 mb-6 text-xs text-zinc-300">
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-sky-400 shrink-0" /> <span>{t("All movies & web series")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-sky-400 shrink-0" /> <span>{t("Full HD 1080p quality")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-sky-400 shrink-0" /> <span>{t("Supported by ads")}</span></li>
                  </ul>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSelectPlan('basic_3m')}
                  className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white py-3.5 rounded-2xl font-black transition-all text-xs shadow-md shadow-sky-500/25 tracking-wide uppercase cursor-pointer"
                >
                  {t("Join Basic Plan")}
                </motion.button>
              </motion.div>

              {/* Basic 6 Months */}
              <motion.div 
                whileHover={{ y: -6 }}
                className="bg-gradient-to-b from-sky-950/40 via-zinc-900/90 to-zinc-950/95 border border-sky-500/30 hover:border-sky-400 rounded-3xl p-6 flex flex-col justify-between shadow-xl backdrop-blur-xl relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 bg-sky-500 text-white text-[10px] font-black uppercase px-3.5 py-1 rounded-bl-xl shadow-md">
                  {t("Save 13%")}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      {t("Semi-Annual")}
                    </span>
                    <span className="text-[10px] font-bold text-zinc-400">{t("With Ads")}</span>
                  </div>
                  <h3 className="text-xl font-extrabold text-white mb-1">{t("6 Months")}</h3>
                  <div className="text-3xl font-black text-sky-400 mb-1">{t("PKR 260")}</div>
                  <p className="text-zinc-500 mb-4 text-xs font-bold">{t("≈ PKR 43/month")}</p>
                  <p className="text-xs font-bold text-zinc-300 mb-5 min-h-[32px]">
                    <span className="line-through text-zinc-500">{t("PKR 300")}</span> <span className="text-sky-400 font-bold">{t("Save PKR 40")}</span>
                  </p>
                  
                  <ul className="space-y-3 mb-6 text-xs text-zinc-300">
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-sky-400 shrink-0" /> <span>{t("All movies & web series")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-sky-400 shrink-0" /> <span>{t("Full HD 1080p quality")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-sky-400 shrink-0" /> <span>{t("Supported by ads")}</span></li>
                  </ul>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSelectPlan('basic_6m')}
                  className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white py-3.5 rounded-2xl font-black transition-all text-xs shadow-md shadow-sky-500/25 tracking-wide uppercase cursor-pointer"
                >
                  {t("Join Basic Plan")}
                </motion.button>
              </motion.div>

              {/* Basic 1 Year - FEATURED BEST VALUE */}
              <motion.div 
                whileHover={{ y: -6 }}
                className="bg-gradient-to-b from-sky-950/60 via-zinc-900/90 to-zinc-950/95 border-2 border-sky-400 rounded-3xl p-6 flex flex-col justify-between shadow-2xl shadow-sky-500/20 backdrop-blur-xl relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 bg-gradient-to-r from-sky-500 to-blue-600 text-white text-[10px] font-black uppercase px-3.5 py-1 rounded-bl-xl shadow-md">
                  🔥 {t("Best Value • Save 17%")}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      {t("Annual Pass")}
                    </span>
                    <span className="text-[10px] font-bold text-zinc-400">{t("With Ads")}</span>
                  </div>
                  <h3 className="text-xl font-black text-white mb-1 flex items-center gap-1.5">
                    <span>{t("1 Year Basic")}</span>
                    <Zap className="w-4 h-4 text-sky-400 fill-current" />
                  </h3>
                  <div className="text-3xl font-black text-sky-400 mb-1">{t("PKR 500")}</div>
                  <p className="text-zinc-400 mb-4 text-xs font-bold">{t("≈ PKR 41/month")}</p>
                  <p className="text-xs font-bold text-zinc-300 mb-5 min-h-[32px]">
                    <span className="line-through text-zinc-500">{t("PKR 600")}</span> <span className="text-sky-300 font-bold bg-sky-500/20 px-2 py-0.5 rounded border border-sky-500/30">{t("Save PKR 100")}</span>
                  </p>
                  
                  <ul className="space-y-3 mb-6 text-xs text-zinc-200 font-medium">
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-sky-400 shrink-0" /> <span>{t("All movies & web series")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-sky-400 shrink-0" /> <span>{t("Full HD 1080p quality")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-sky-400 shrink-0" /> <span>{t("Supported by ads")}</span></li>
                  </ul>
                </div>

                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleSelectPlan('basic_1y')}
                  className="w-full bg-gradient-to-r from-sky-400 to-blue-600 hover:from-sky-300 hover:to-blue-500 text-white py-4 rounded-2xl font-black transition-all text-xs shadow-xl shadow-sky-500/30 tracking-wide uppercase cursor-pointer"
                >
                  {t("Join 1-Year Basic")}
                </motion.button>
              </motion.div>
            </div>
          </div>

          {/* Pay Per Title Section */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Film className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white">{t("Pay Per Title")}</h2>
                <p className="text-xs text-zinc-400">{t("Ideal if you just want specific movies or series on demand")}</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {/* Single Movie Card */}
              <motion.div 
                whileHover={{ y: -5 }}
                className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 border border-zinc-800/90 hover:border-emerald-500/50 rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-xl backdrop-blur-xl transition-all relative overflow-hidden group"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3.5 py-1 rounded-full border border-emerald-500/20">
                      {t("Single Title")}
                    </span>
                    <Film className="w-6 h-6 text-zinc-600 group-hover:text-emerald-400 transition-colors" />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-1">{t("Single Movie")}</h3>
                  <div className="text-4xl font-black text-emerald-400 mb-1 tracking-tight">
                    {t("PKR 50")}
                  </div>
                  <p className="text-xs font-bold text-zinc-500 mb-6">{t("one-time download")}</p>

                  <ul className="space-y-3.5 mb-8 text-xs sm:text-sm text-zinc-300">
                    <li className="flex items-center gap-3"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("Any movie in the catalog")}</span></li>
                    <li className="flex items-center gap-3"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("Full HD quality")}</span></li>
                    <li className="flex items-center gap-3"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("Delivered on WhatsApp")}</span></li>
                    <li className="flex items-center gap-3"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("Same-day delivery")}</span></li>
                  </ul>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleWhatsappClick('Single Movie', 'PKR 50')}
                  className="w-full bg-gradient-to-r from-zinc-800 via-zinc-800 to-zinc-900 hover:from-zinc-700 hover:to-zinc-800 text-white py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-2.5 border border-zinc-700/80 text-xs sm:text-sm shadow-md"
                >
                  <MessageCircle className="w-5 h-5 text-[#25D366] fill-current" />
                  <span>{t("Get on WhatsApp")}</span>
                </motion.button>
              </motion.div>

              {/* Web Series Season Card */}
              <motion.div 
                whileHover={{ y: -5 }}
                className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 border border-zinc-800/90 hover:border-purple-500/50 rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-xl backdrop-blur-xl transition-all relative overflow-hidden group"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-black uppercase tracking-wider text-purple-400 bg-purple-500/10 px-3.5 py-1 rounded-full border border-purple-500/20">
                      {t("Full Season")}
                    </span>
                    <Tv className="w-6 h-6 text-zinc-600 group-hover:text-purple-400 transition-colors" />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-1">{t("Web Series Season")}</h3>
                  <div className="text-4xl font-black text-emerald-400 mb-1 tracking-tight">
                    {t("PKR 100")}
                  </div>
                  <p className="text-xs font-bold text-zinc-500 mb-6">{t("per complete season")}</p>

                  <ul className="space-y-3.5 mb-8 text-xs sm:text-sm text-zinc-300">
                    <li className="flex items-center gap-3"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("All episodes in one pack")}</span></li>
                    <li className="flex items-center gap-3"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("Pristine HD quality")}</span></li>
                    <li className="flex items-center gap-3"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("Price may vary by size")}</span></li>
                    <li className="flex items-center gap-3"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("Priority delivery")}</span></li>
                  </ul>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleWhatsappClick('Web Series Season', 'PKR 100')}
                  className="w-full bg-gradient-to-r from-zinc-800 via-zinc-800 to-zinc-900 hover:from-zinc-700 hover:to-zinc-800 text-white py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-2.5 border border-zinc-700/80 text-xs sm:text-sm shadow-md"
                >
                  <MessageCircle className="w-5 h-5 text-[#25D366] fill-current" />
                  <span>{t("Get on WhatsApp")}</span>
                </motion.button>
              </motion.div>
            </div>
          </div>

          {/* Membership Group VIP Plans (100% Ad-Free) */}
          <div className="space-y-6 pt-4">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-rose-500/10 border border-rose-500/30 text-rose-400 shadow-sm">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t("100% Ad-Free • Save up to 44% with VIP Passes")}</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight flex items-center justify-center gap-2">
                <span>{t("VIP Membership (Without Ads)")}</span>
                <Crown className="w-7 h-7 text-amber-400 fill-amber-400/20 shrink-0" />
              </h2>
              <p className="text-xs sm:text-sm text-zinc-300 max-w-xl mx-auto">
                {t("Enjoy 100% ad-free streaming plus daily 6–7 HD movies & web series delivered inside the WhatsApp group. Longer plans unlock bigger discounts.")}
              </p>

              {/* Explicit VIP Without Ads Guarantee Callout */}
              <div className="bg-gradient-to-r from-emerald-500/10 via-amber-500/15 to-emerald-500/10 border border-emerald-500/40 rounded-2xl p-4 text-center max-w-2xl mx-auto shadow-lg backdrop-blur-md">
                <p className="text-xs sm:text-sm font-extrabold text-emerald-300 flex items-center justify-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>{t("VIP Guarantee: 100% Ad-Free Streaming (No Ads, No Interstitials, No Banners)")}</span>
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* 1 Month VIP */}
              <motion.div 
                whileHover={{ y: -6 }}
                className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 border border-zinc-800 hover:border-emerald-500/40 rounded-3xl p-6 flex flex-col justify-between shadow-xl backdrop-blur-xl relative"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-extrabold text-white">{t("1 Month VIP")}</h3>
                    <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {t("Without Ads")}
                    </span>
                  </div>
                  <div className="text-3xl font-black text-emerald-400 mb-1">{t("PKR 300")}</div>
                  <p className="text-zinc-500 mb-4 text-xs font-bold">{t("≈ PKR 300/month")}</p>
                  <p className="text-xs font-bold text-zinc-400 mb-5 min-h-[32px]">{t("Base monthly VIP rate")}</p>
                  
                  <ul className="space-y-3 mb-6 text-xs text-zinc-300">
                    <li className="flex items-center gap-2.5 font-bold text-emerald-400"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("100% Ad-Free (Without Ads)")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("Daily 6–7 HD movies")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("Latest web series")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("Priority WhatsApp support")}</span></li>
                  </ul>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSelectPlan('1m')}
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white py-3.5 rounded-2xl font-black transition-all text-xs shadow-md"
                >
                  {t("Join VIP Now")}
                </motion.button>
              </motion.div>

              {/* 3 Months VIP */}
              <motion.div 
                whileHover={{ y: -6 }}
                className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 border border-zinc-800 hover:border-emerald-500/40 rounded-3xl p-6 flex flex-col justify-between shadow-xl backdrop-blur-xl relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-black uppercase px-3.5 py-1 rounded-bl-xl shadow-md">
                  {t("Save 17%")}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-extrabold text-white">{t("3 Months VIP")}</h3>
                    <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {t("Without Ads")}
                    </span>
                  </div>
                  <div className="text-3xl font-black text-emerald-400 mb-1">{t("PKR 750")}</div>
                  <p className="text-zinc-500 mb-4 text-xs font-bold">{t("≈ PKR 250/month")}</p>
                  <p className="text-xs font-bold text-zinc-300 mb-5 min-h-[32px]">
                    <span className="line-through text-zinc-500">{t("PKR 900")}</span> <span className="text-emerald-400 font-bold">{t("Save PKR 150")}</span>
                  </p>
                  
                  <ul className="space-y-3 mb-6 text-xs text-zinc-300">
                    <li className="flex items-center gap-2.5 font-bold text-emerald-400"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("100% Ad-Free (Without Ads)")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("Daily 6–7 HD movies")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("Latest web series")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("Priority WhatsApp support")}</span></li>
                  </ul>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSelectPlan('3m')}
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white py-3.5 rounded-2xl font-black transition-all text-xs shadow-md"
                >
                  {t("Join VIP Now")}
                </motion.button>
              </motion.div>

              {/* 6 Months VIP - FEATURED HIGHLIGHT */}
              <motion.div 
                whileHover={{ y: -8 }}
                className="bg-gradient-to-b from-emerald-950/50 via-zinc-900/95 to-zinc-950/95 border-2 border-emerald-500 rounded-3xl p-6 flex flex-col justify-between shadow-2xl shadow-emerald-950/50 backdrop-blur-xl relative overflow-hidden transform lg:-translate-y-3"
              >
                <div className="absolute top-0 inset-x-0 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 text-white text-[10px] font-black uppercase py-1.5 text-center tracking-wider shadow-sm flex items-center justify-center gap-1">
                  <Zap className="w-3 h-3 fill-current" />
                  <span>{t("Most Popular • Save 22%")}</span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2 mt-4">
                    <h3 className="text-xl font-black text-white">{t("6 Months VIP")}</h3>
                    <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {t("Without Ads")}
                    </span>
                  </div>
                  <div className="text-3xl font-black text-emerald-400 mb-1">{t("PKR 1,400")}</div>
                  <p className="text-zinc-400 mb-4 text-xs font-bold">{t("≈ PKR 233/month")}</p>
                  <p className="text-xs font-bold text-zinc-300 mb-5 min-h-[32px]">
                    <span className="line-through text-zinc-500">{t("PKR 1,800")}</span> <span className="text-emerald-400 font-black">{t("Save PKR 400")}</span>
                  </p>
                  
                  <ul className="space-y-3 mb-6 text-xs text-zinc-100 font-medium">
                    <li className="flex items-center gap-2.5 font-bold text-emerald-400"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("100% Ad-Free (Without Ads)")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("Daily 6–7 HD movies")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("Latest web series")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> <span>{t("Priority WhatsApp support")}</span></li>
                  </ul>
                </div>

                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleSelectPlan('6m')}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white py-4 rounded-2xl font-black transition-all text-xs shadow-xl shadow-emerald-500/30"
                >
                  {t("Join VIP Now")}
                </motion.button>
              </motion.div>

              {/* 1 Year VIP */}
              <motion.div 
                whileHover={{ y: -6 }}
                className="bg-gradient-to-b from-amber-950/20 via-zinc-900/90 to-zinc-950/95 border-2 border-amber-500/50 hover:border-amber-400 rounded-3xl p-6 flex flex-col justify-between shadow-2xl shadow-amber-500/10 backdrop-blur-xl relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] sm:text-xs font-black uppercase px-4 py-1.5 rounded-bl-xl shadow-lg tracking-wider flex items-center gap-1">
                  <span>🔥 {t("Most Popular • Save 28%")}</span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                      <span>{t("1 Year VIP")}</span>
                      <Crown className="w-5 h-5 text-amber-400 fill-amber-400/20" />
                    </h3>
                    <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {t("Without Ads")}
                    </span>
                  </div>
                  <div className="text-3xl font-black text-amber-400 mb-1">{t("PKR 2,600")}</div>
                  <p className="text-zinc-400 mb-4 text-xs font-bold">{t("≈ PKR 217/month")}</p>
                  <p className="text-xs font-bold text-zinc-300 mb-5 min-h-[32px] flex items-center gap-2">
                    <span className="line-through text-zinc-500">{t("PKR 3,600")}</span> 
                    <span className="bg-amber-500/20 text-amber-300 px-2.5 py-0.5 rounded-md font-black border border-amber-500/30">{t("Save PKR 1,000")}</span>
                  </p>
                  
                  <ul className="space-y-3 mb-6 text-xs text-zinc-300">
                    <li className="flex items-center gap-2.5 font-bold text-amber-400"><CheckCircle className="w-4 h-4 text-amber-400 shrink-0" /> <span>{t("100% Ad-Free (Without Ads)")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-amber-400 shrink-0" /> <span>{t("Daily 6–7 HD movies")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-amber-400 shrink-0" /> <span>{t("Latest web series")}</span></li>
                    <li className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-amber-400 shrink-0" /> <span>{t("Priority WhatsApp support")}</span></li>
                  </ul>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSelectPlan('1y')}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white py-3.5 rounded-2xl font-black transition-all text-xs shadow-lg shadow-amber-500/25 tracking-wide"
                >
                  {t("Join 1-Year VIP")}
                </motion.button>
              </motion.div>
            </div>

            {/* 2 Years VIP Mega Banner */}
            <motion.div 
              whileHover={{ scale: 1.01 }}
              className="bg-gradient-to-r from-zinc-950 via-purple-950/60 to-zinc-950 border-2 border-purple-500/60 hover:border-purple-400 rounded-3xl p-6 sm:p-10 max-w-4xl mx-auto shadow-2xl shadow-purple-500/20 backdrop-blur-xl relative overflow-hidden mt-8"
            >
              <div className="absolute top-0 right-0 bg-gradient-to-r from-rose-600 via-purple-600 to-amber-500 text-white text-[10px] sm:text-xs font-black uppercase px-4 py-1.5 rounded-bl-xl shadow-lg tracking-wider flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 fill-current" />
                <span>{t("👑 Mega Saver VIP • Save 44%")}</span>
              </div>

              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="space-y-2 text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-2">
                    <span className="text-[10px] font-black uppercase px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                      ✨ {t("100% Ad-Free (Without Ads)")}
                    </span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-black text-white flex items-center justify-center md:justify-start gap-2">
                    <span className="bg-gradient-to-r from-white via-purple-200 to-amber-200 bg-clip-text text-transparent">{t("2 Years VIP Pass")}</span>
                    <Sparkles className="w-6 h-6 text-amber-400 fill-amber-400/30" />
                  </h3>
                  <div className="flex items-baseline justify-center md:justify-start gap-2">
                    <span className="text-3xl sm:text-4xl font-black text-purple-300">{t("PKR 4,000")}</span>
                    <span className="text-xs text-zinc-400 font-bold">{t("≈ PKR 167/month")}</span>
                  </div>
                  <p className="text-xs font-bold text-zinc-300 flex items-center justify-center md:justify-start gap-2">
                    <span className="line-through text-zinc-500">{t("PKR 7,200")}</span> 
                    <span className="bg-rose-500/20 text-rose-300 px-2.5 py-0.5 rounded-md font-black border border-rose-500/30">{t("Save PKR 3,200")}</span>
                  </p>
                </div>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSelectPlan('2y')}
                  className="bg-gradient-to-r from-rose-600 via-purple-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl shadow-purple-600/30 text-xs sm:text-sm shrink-0 w-full md:w-auto tracking-wider uppercase"
                >
                  {t("Join 2-Year VIP Pass")}
                </motion.button>
              </div>
            </motion.div>
          </div>

          {/* Feature Badges Grid */}
          <div className="bg-gradient-to-r from-zinc-900/90 via-zinc-950/90 to-zinc-900/90 rounded-3xl p-6 border border-zinc-800/90 grid grid-cols-2 md:grid-cols-4 gap-4 text-center shadow-inner mt-8">
            <div className="p-3">
              <Film className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
              <p className="font-extrabold text-sm text-white">{t("Daily 6–7 Movies")}</p>
              <p className="text-[11px] text-zinc-400">{t("Fresh HD catalog")}</p>
            </div>
            <div className="p-3">
              <Tv className="w-6 h-6 text-purple-400 mx-auto mb-2" />
              <p className="font-extrabold text-sm text-white">{t("Latest Web Series")}</p>
              <p className="text-[11px] text-zinc-400">{t("Full seasonal releases")}</p>
            </div>
            <div className="p-3">
              <ShieldCheck className="w-6 h-6 text-teal-400 mx-auto mb-2" />
              <p className="font-extrabold text-sm text-white">{t("1080p HD Quality")}</p>
              <p className="text-[11px] text-zinc-400">{t("Zero compression loss")}</p>
            </div>
            <div className="p-3">
              <MessageCircle className="w-6 h-6 text-[#25D366] mx-auto mb-2" />
              <p className="font-extrabold text-sm text-white">{t("Priority Support")}</p>
              <p className="text-[11px] text-zinc-400">{t("Dedicated WhatsApp care")}</p>
            </div>
          </div>

          {/* Trending Movies Grid */}
          {trendingMovies.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                  <Flame className="w-6 h-6 text-rose-500 animate-pulse" />
                  <span>{t("Trending Movies")}</span>
                </h2>
                <Link to="/?type=movie" className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
                  <span>{t("View All")}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                {trendingMovies.map(movie => (
                  <Link 
                    key={movie.id} 
                    to={`/${movie.id}`} 
                    className="group relative rounded-2xl overflow-hidden aspect-[2/3] block bg-zinc-900 border border-zinc-800/80 shadow-md hover:border-emerald-500/50 transition-all duration-300 hover:shadow-xl"
                  >
                    <img 
                      src={movie.posterUrl} 
                      alt={movie.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                      <p className="text-white font-bold text-xs line-clamp-2 leading-tight">{movie.title}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Support Section */}
          <div className="mt-12 border-t border-zinc-800/80 pt-8">
            <ContactSupportButtons />
          </div>
        </main>
      </PageTransition>
    </div>
  );
}
