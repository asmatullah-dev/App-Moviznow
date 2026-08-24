import React, { useState, useEffect } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { 
  CheckCircle, 
  XCircle, 
  PlayCircle, 
  MessageCircle, 
  Sparkles, 
  Zap, 
  ShieldCheck, 
  Film, 
  Flame, 
  ArrowRight,
  ShieldAlert,
  Smartphone,
  Tv,
  Download,
  Lock,
  Star
} from 'lucide-react';
import { standardizePhone } from '../../contexts/AuthContext';
import { Helmet } from 'react-helmet';
import { useContent } from '../../contexts/ContentContext';
import { Link } from 'react-router-dom';
import { Content } from '../../types';
import { motion } from 'motion/react';

import { Header } from "../../components/Header";
import { ContactSupportButtons } from "../../components/ContactSupportButtons";
import { PageTransition } from "../../components/PageTransition";

export default function FreeMovies() {
  const { settings } = useSettings();
  const { t } = useLanguage();
  const { contentList, collections } = useContent();
  const [trendingMovies, setTrendingMovies] = useState<Content[]>([]);
  const appName = settings?.headerText || 'MovizNow';

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

  const handleWhatsappClick = () => {
    const adminPhone = standardizePhone(settings?.supportNumber || "3416286423").replace("+", "");
    const msg = `Assalam O Alaikum! I want to get a movie for PKR 50.`;
    window.open(`https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const steps = [
    { num: "01", title: t("Pick any movie"), desc: t("Browse our massive library of Bollywood, Hollywood & Lollywood titles.") },
    { num: "02", title: t("Tap WhatsApp"), desc: t("Click the order button to open instant chat with our support team.") },
    { num: "03", title: t("Pay PKR 50"), desc: t("Easily pay via EasyPaisa or JazzCash in 30 seconds.") },
    { num: "04", title: t("Watch in Full HD"), desc: t("Get your high-speed Google Drive link directly on WhatsApp!") }
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col relative overflow-hidden">
      <Helmet>
        <title>{appName} - {t("Free Movies")}</title>
      </Helmet>

      <Header showBackButton={true} />

      {/* Dynamic Animated Ambient Lights */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-r from-emerald-600/20 via-teal-500/20 to-cyan-500/20 blur-[120px] pointer-events-none rounded-full animate-pulse" />
      <div className="absolute top-[40rem] -left-20 w-[400px] h-[400px] bg-rose-500/15 blur-[100px] pointer-events-none rounded-full" />
      <div className="absolute top-[65rem] -right-20 w-[400px] h-[400px] bg-emerald-500/15 blur-[100px] pointer-events-none rounded-full" />

      <PageTransition className="flex-1 w-full relative z-10">
        <main className="max-w-4xl mx-auto px-4 pt-6 pb-20 w-full space-y-14">
          
          {/* Hero Banner Section */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative overflow-hidden bg-gradient-to-br from-zinc-900/90 via-zinc-950/95 to-zinc-900/90 border border-emerald-500/30 rounded-3xl p-6 sm:p-12 shadow-2xl backdrop-blur-2xl text-center space-y-6"
          >
            {/* Glowing Accent Border Lines */}
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-80" />

            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 text-emerald-400 shadow-inner">
              <Sparkles className="w-4 h-4 text-emerald-400 animate-spin-slow" />
              <span>{t("Free Movies in Pakistan?")}</span>
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-[1.15] max-w-3xl mx-auto">
              {t("Get them almost-free —")} <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent filter drop-shadow">
                {t("PKR 50 in HD.")}
              </span>
            </h1>

            <p className="text-zinc-300 text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed font-normal">
              {t('Free movie download sites in Pakistan are illegal, full of viruses, popups aur VPN ki zaroorat hoti hai.').replace('%APP_NAME%', appName)}{' '}
              {t('Safe legal alternative hai — full HD Bollywood, Hollywood, Punjabi aur Pakistani movies sirf PKR 50 me, seedha WhatsApp par delivery. Ek biscuit ki price me poori HD movie.')}
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleWhatsappClick}
                className="w-full sm:w-auto bg-gradient-to-r from-[#25D366] via-emerald-500 to-teal-600 hover:from-[#20b858] hover:to-emerald-500 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl shadow-[#25D366]/30 flex items-center justify-center gap-3 text-sm sm:text-base tracking-wide"
              >
                <MessageCircle className="w-5 h-5 fill-current" />
                <span>{t("Get PKR 50 Movie on WhatsApp")}</span>
              </motion.button>
              
              <Link
                to="/?type=movie"
                className="w-full sm:w-auto bg-zinc-900/90 hover:bg-zinc-800/90 text-white px-8 py-4 rounded-2xl font-extrabold transition-all flex items-center justify-center gap-2.5 text-sm sm:text-base border border-zinc-700/80 hover:border-zinc-600 backdrop-blur-md"
              >
                <PlayCircle className="w-5 h-5 text-emerald-400" />
                <span>{t("Browse Full Catalog")}</span>
              </Link>
            </div>

            {/* Quick Stat Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 border-t border-zinc-800/80 max-w-2xl mx-auto">
              <div className="p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800 text-center">
                <p className="text-emerald-400 font-black text-sm sm:text-base">1080p HD</p>
                <p className="text-[11px] text-zinc-400 font-semibold">{t("Crystal Clear")}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800 text-center">
                <p className="text-emerald-400 font-black text-sm sm:text-base">0 VPN</p>
                <p className="text-[11px] text-zinc-400 font-semibold">{t("No Apps Needed")}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800 text-center">
                <p className="text-emerald-400 font-black text-sm sm:text-base">2 Mins</p>
                <p className="text-[11px] text-zinc-400 font-semibold">{t("Instant Delivery")}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800 text-center">
                <p className="text-emerald-400 font-black text-sm sm:text-base">100% Safe</p>
                <p className="text-[11px] text-zinc-400 font-semibold">{t("Virus-Free")}</p>
              </div>
            </div>
          </motion.div>

          {/* How It Works (Visual Timeline) */}
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Zap className="w-3.5 h-3.5" />
                <span>{t("4 Easy Steps")}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {t("How to Get Any Movie for PKR 50")}
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {steps.map((step, idx) => (
                <motion.div
                  key={idx}
                  whileHover={{ y: -4 }}
                  className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border border-zinc-800/90 hover:border-emerald-500/40 rounded-2xl p-5 space-y-3 relative overflow-hidden shadow-lg backdrop-blur-md"
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black text-xs flex items-center justify-center shadow-md">
                    {step.num}
                  </div>
                  <h3 className="font-extrabold text-base text-white">{step.title}</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Comparison Cards: Free Sites vs MovizNow */}
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {t("Free download sites vs.")} <span className="text-emerald-400">{appName}</span>
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400">
                {t("Why thousands of movie lovers in Pakistan switch to PKR 50 instant delivery")}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Piracy Sites Card (Red Danger Theme) */}
              <div className="bg-gradient-to-b from-rose-950/20 via-zinc-900/90 to-zinc-950/90 border border-rose-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl backdrop-blur-md relative overflow-hidden">
                <div className="flex items-center gap-3 border-b border-rose-500/20 pb-4">
                  <div className="w-11 h-11 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-inner">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg text-rose-400 flex items-center gap-2">
                      <span>{t("Free piracy sites")}</span>
                    </h3>
                    <p className="text-xs text-zinc-400">{t("High risk, slow downloads & viruses")}</p>
                  </div>
                </div>

                <ul className="space-y-3.5 text-xs sm:text-sm text-zinc-300">
                  <li className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <span>{t("Illegal & unsafe")}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <span>{t("Malware, viruses, phishing popups")}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <span>{t("VPN required, slow downloads")}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <span>{t('Fake "download" buttons, ads everywhere')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <span>{t("Poor quality, wrong files, no support")}</span>
                  </li>
                </ul>
              </div>

              {/* MovizNow Safe Alternative (Emerald Theme) */}
              <div className="bg-gradient-to-b from-emerald-950/30 via-zinc-900/90 to-zinc-950/90 border border-emerald-500/40 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl shadow-emerald-950/20 backdrop-blur-md relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-gradient-to-l from-emerald-500 to-teal-500 text-white text-[10px] font-black uppercase tracking-wider px-4 py-1.5 rounded-bl-xl shadow-md flex items-center gap-1">
                  <Star className="w-3 h-3 fill-current" />
                  <span>{t("Recommended")}</span>
                </div>

                <div className="flex items-center gap-3 border-b border-emerald-500/20 pb-4">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg text-emerald-400 flex items-center gap-2">
                      <span>{appName} (PKR 50)</span>
                    </h3>
                    <p className="text-xs text-zinc-400">{t("Pristine HD, Instant WhatsApp Delivery")}</p>
                  </div>
                </div>

                <ul className="space-y-3.5 text-xs sm:text-sm text-zinc-100 font-medium">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{t("Safe, legal, ad-free")}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{t("Verified HD source, no viruses")}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{t("No VPN — delivered on WhatsApp")}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{t("Only PKR 50 per movie (biscuit price)")}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{t("Real support on WhatsApp")}</span>
                  </li>
                </ul>
              </div>
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
                    className="group relative rounded-2xl overflow-hidden aspect-[2/3] block bg-zinc-900 border border-zinc-800/80 shadow-md hover:border-emerald-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-950/30"
                  >
                    <img 
                      src={movie.posterUrl} 
                      alt={movie.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                      <span className="text-[10px] uppercase font-black tracking-wider text-emerald-400">{t("PKR 50 HD")}</span>
                      <p className="text-white font-bold text-xs line-clamp-2 leading-tight">{movie.title}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Bottom WhatsApp Sticky Callout */}
          <div className="bg-gradient-to-r from-emerald-950/60 via-teal-950/60 to-zinc-900/90 border border-emerald-500/30 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-2xl backdrop-blur-xl">
            <div className="space-y-1 text-center sm:text-left">
              <h3 className="text-xl sm:text-2xl font-black text-white">{t("Ready to watch your movie?")}</h3>
              <p className="text-xs sm:text-sm text-zinc-300">{t("Send us the title on WhatsApp and get instant delivery.")}</p>
            </div>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleWhatsappClick}
              className="bg-[#25D366] hover:bg-[#20b858] text-white px-8 py-3.5 rounded-2xl font-black text-sm flex items-center gap-2.5 shadow-lg shadow-[#25D366]/30 shrink-0 w-full sm:w-auto justify-center"
            >
              <MessageCircle className="w-5 h-5 fill-current" />
              <span>{t("Order Now - PKR 50")}</span>
            </motion.button>
          </div>

          {/* Support Section */}
          <div className="mt-12 border-t border-zinc-800/80 pt-8">
            <ContactSupportButtons />
          </div>
        </main>
      </PageTransition>
    </div>
  );
}
