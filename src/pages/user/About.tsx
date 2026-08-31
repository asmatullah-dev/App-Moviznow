import React from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Helmet } from 'react-helmet';
import { 
  Film, 
  ShieldCheck, 
  Zap, 
  Sparkles, 
  Heart, 
  CheckCircle2, 
  Play, 
  Award, 
  Users,
  Tv,
  MessageCircle,
  Globe,
  Star
} from 'lucide-react';
import { motion } from 'motion/react';

import { Header } from "../../components/Header";
import { ContactSupportButtons } from "../../components/ContactSupportButtons";
import { PageTransition } from "../../components/PageTransition";
import { AdBanner } from "../../components/AdBanner";

export default function About() {
  const { settings } = useSettings();
  const { t } = useLanguage();
  const appName = settings?.headerText || 'MovizNow';

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col relative overflow-hidden">
      <Helmet>
        <title>{appName} - {t("About Us")}</title>
      </Helmet>

      <Header showBackButton={true} />

      {/* Ambient Lighting Background */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-r from-emerald-600/15 via-indigo-600/15 to-purple-600/15 blur-[120px] pointer-events-none rounded-full animate-pulse" />
      <div className="absolute top-[35rem] -left-20 w-[400px] h-[400px] bg-rose-500/10 blur-[100px] pointer-events-none rounded-full" />
      <div className="absolute top-[55rem] -right-20 w-[400px] h-[400px] bg-emerald-500/10 blur-[100px] pointer-events-none rounded-full" />

      <PageTransition className="flex-1 w-full relative z-10">
        <main className="max-w-4xl mx-auto px-4 pt-6 pb-20 w-full space-y-14">
          
          {/* Hero Header */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden bg-gradient-to-br from-zinc-900/90 via-zinc-950/95 to-zinc-900/90 border border-emerald-500/30 rounded-3xl p-6 sm:p-12 shadow-2xl backdrop-blur-2xl text-center space-y-5"
          >
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-80" />

            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-inner">
              <Sparkles className="w-4 h-4 text-emerald-400 animate-spin-slow" />
              <span>{t("Our Story & Vision")}</span>
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-tight max-w-3xl mx-auto">
              {t("About %APP_NAME%").replace('%APP_NAME%', appName)}
            </h1>

            <p className="text-zinc-300 text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              {t("Your premium destination for HD movies and web series in Pakistan.")}
            </p>
          </motion.div>

          {/* Ad Banner below Hero */}
          <div className="w-full my-4">
            <AdBanner />
          </div>

          {/* 3 Value Pillars */}
          <div className="grid md:grid-cols-3 gap-6">
            <motion.div 
              whileHover={{ y: -6 }}
              className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 border border-zinc-800/90 hover:border-emerald-500/50 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-xl backdrop-blur-xl transition-all"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                <Film className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-white">{t("Vast Collection")}</h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                {t("Access thousands of movies and web series from Bollywood, Hollywood, and local cinema in pristine HD quality.")}
              </p>
            </motion.div>

            <motion.div 
              whileHover={{ y: -6 }}
              className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 border border-zinc-800/90 hover:border-rose-500/50 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-xl backdrop-blur-xl transition-all"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-rose-500/20 to-purple-500/20 text-rose-400 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-rose-500/10">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-white">{t("Safe & Secure")}</h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                {t("No more sketchy download sites, viruses, or VPNs. We provide direct, safe access to the content you love.")}
              </p>
            </motion.div>

            <motion.div 
              whileHover={{ y: -6 }}
              className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 border border-zinc-800/90 hover:border-amber-500/50 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-xl backdrop-blur-xl transition-all"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
                <Zap className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-white">{t("Fast Delivery")}</h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                {t("Get your favorite content delivered directly to your WhatsApp instantly. No waiting, no buffering.")}
              </p>
            </motion.div>
          </div>

          {/* Mission Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-gradient-to-br from-zinc-900/95 via-zinc-950/95 to-zinc-900/95 border border-zinc-800/90 rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur-xl relative overflow-hidden space-y-6"
          >
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
                <Heart className="w-6 h-6 fill-current" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {t("Our Mission")}
              </h2>
            </div>

            <div className="space-y-4 text-zinc-300 text-xs sm:text-base leading-relaxed">
              <p>
                {t('At %APP_NAME%, we believe entertainment should be accessible, affordable, and safe. For too long, finding a good movie online meant navigating through a maze of popup ads, malware, and broken links.').replace('%APP_NAME%', appName)}
              </p>
              <p>
                {t("We're changing that by offering a clean, straightforward service. Whether you want to buy a single movie for just PKR 50 or join our membership for daily content, we ensure you get exactly what you pay for — high-quality entertainment without the hassle.")}
              </p>
            </div>

            {/* Feature Stat Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-zinc-800/80">
              <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4 text-center">
                <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">100%</div>
                <div className="text-[11px] font-bold text-zinc-400 mt-0.5">{t("Ad-Free & Virus-Free")}</div>
              </div>

              <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4 text-center">
                <div className="text-xl sm:text-2xl font-black text-rose-400 font-mono">PKR 50</div>
                <div className="text-[11px] font-bold text-zinc-400 mt-0.5">{t("Per HD Movie")}</div>
              </div>

              <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4 text-center col-span-2 sm:col-span-1">
                <div className="text-xl sm:text-2xl font-black text-amber-400 font-mono">24/7</div>
                <div className="text-[11px] font-bold text-zinc-400 mt-0.5">{t("WhatsApp Support")}</div>
              </div>
            </div>
          </motion.div>

          {/* Ad Banner between Mission and Why Choose Us */}
          <div className="w-full my-6">
            <AdBanner />
          </div>

          {/* Why Choose Us Highlight Grid */}
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {t("Why Choose %APP_NAME%?").replace('%APP_NAME%', appName)}
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400">
                {t("Designed for seamless entertainment lovers across Pakistan")}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border border-zinc-800/90 rounded-2xl p-5 flex items-start gap-4">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-extrabold text-sm text-white mb-1">{t("Original HD Quality")}</h4>
                  <p className="text-xs text-zinc-400">{t("High quality 1080p source links directly sent to your phone.")}</p>
                </div>
              </div>

              <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border border-zinc-800/90 rounded-2xl p-5 flex items-start gap-4">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-extrabold text-sm text-white mb-1">{t("Instant WhatsApp Delivery")}</h4>
                  <p className="text-xs text-zinc-400">{t("No slow links, captcha forms, or suspicious redirections.")}</p>
                </div>
              </div>

              <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border border-zinc-800/90 rounded-2xl p-5 flex items-start gap-4">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-extrabold text-sm text-white mb-1">{t("Easy Payment Options")}</h4>
                  <p className="text-xs text-zinc-400">{t("Pay conveniently via EasyPaisa or JazzCash.")}</p>
                </div>
              </div>

              <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border border-zinc-800/90 rounded-2xl p-5 flex items-start gap-4">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-extrabold text-sm text-white mb-1">{t("Dedicated Support")}</h4>
                  <p className="text-xs text-zinc-400">{t("Our team is always online to help you with requests and orders.")}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Ad Banner above support */}
          <div className="w-full my-6">
            <AdBanner />
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
