import React from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Helmet } from 'react-helmet';
import { 
  MessageCircle, 
  Send, 
  Sparkles, 
  Headphones, 
  Zap, 
  Clock, 
  HelpCircle,
  ShieldCheck,
  CheckCircle2,
  PhoneCall,
  UserCheck
} from 'lucide-react';
import { standardizePhone } from '../../contexts/AuthContext';
import { motion } from 'motion/react';

import { Header } from "../../components/Header";
import { ContactSupportButtons } from "../../components/ContactSupportButtons";
import { PageTransition } from "../../components/PageTransition";

export default function Contact() {
  const { settings } = useSettings();
  const { t } = useLanguage();
  const appName = settings?.headerText || 'MovizNow';

  const handleWhatsappSupportClick = () => {
    const adminPhone = standardizePhone(settings?.supportNumber || "3363284466").replace("+", "");
    const msg = `Assalam O Alaikum! I need some help.`;
    window.open(`https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const handleWhatsappChannelClick = () => {
    if (settings?.whatsappChannelLink) {
      window.open(settings.whatsappChannelLink, "_blank");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col relative overflow-hidden">
      <Helmet>
        <title>{appName} - {t("Contact Us")}</title>
      </Helmet>

      <Header showBackButton={true} />

      {/* Ambient Lighting Background */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-r from-[#25D366]/15 via-emerald-600/15 to-teal-600/15 blur-[120px] pointer-events-none rounded-full animate-pulse" />
      <div className="absolute top-[35rem] -right-20 w-[400px] h-[400px] bg-rose-500/10 blur-[100px] pointer-events-none rounded-full" />
      <div className="absolute top-[55rem] -left-20 w-[400px] h-[400px] bg-purple-500/10 blur-[100px] pointer-events-none rounded-full" />

      <PageTransition className="flex-1 w-full relative z-10">
        <main className="max-w-4xl mx-auto px-4 pt-6 pb-20 w-full space-y-14">
          
          {/* Hero Header */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden bg-gradient-to-br from-zinc-900/90 via-zinc-950/95 to-zinc-900/90 border border-[#25D366]/30 rounded-3xl p-6 sm:p-12 shadow-2xl backdrop-blur-2xl text-center space-y-5"
          >
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#25D366] to-transparent opacity-80" />

            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] shadow-inner">
              <span className="w-2 h-2 rounded-full bg-[#25D366] animate-ping" />
              <span>{t("24/7 Instant Support")}</span>
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-tight max-w-3xl mx-auto">
              {t("Contact Us")}
            </h1>

            <p className="text-zinc-300 text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              {t("Get in touch with the %APP_NAME% team.").replace("%APP_NAME%", appName)}
            </p>
          </motion.div>

          {/* Contact Methods Cards */}
          <div className="grid sm:grid-cols-2 gap-6">
            {/* WhatsApp Direct Support */}
            <motion.div 
              whileHover={{ y: -6 }}
              className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 border border-[#25D366]/40 hover:border-[#25D366] rounded-3xl p-6 sm:p-8 text-center flex flex-col items-center justify-between space-y-6 shadow-2xl shadow-[#25D366]/10 backdrop-blur-xl relative overflow-hidden group transition-all"
            >
              <div className="space-y-4 w-full">
                <div className="w-16 h-16 bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/30 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-[#25D366]/20 group-hover:scale-110 transition-transform">
                  <MessageCircle className="w-8 h-8 fill-current" />
                </div>

                <div>
                  <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[11px] font-black uppercase bg-[#25D366]/10 text-[#25D366] mb-2 border border-[#25D366]/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-ping" />
                    <span>{t("Online • Instant Support")}</span>
                  </div>
                  <h3 className="text-2xl font-black text-white">{t("WhatsApp Support")}</h3>
                </div>

                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                  {t("Have a question or need to request a specific movie? Reach out directly on WhatsApp for fast support.")}
                </p>
              </div>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleWhatsappSupportClick}
                className="w-full bg-gradient-to-r from-[#25D366] to-emerald-600 hover:from-[#20b858] hover:to-emerald-500 text-white py-4 rounded-2xl font-black transition-all shadow-xl shadow-[#25D366]/25 flex items-center justify-center gap-2.5 text-xs sm:text-sm tracking-wide"
              >
                <MessageCircle className="w-5 h-5 fill-current" />
                <span>{t("Chat on WhatsApp")}</span>
              </motion.button>
            </motion.div>

            {/* WhatsApp Official Channel */}
            <motion.div 
              whileHover={{ y: -6 }}
              className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 border border-purple-500/40 hover:border-purple-500 rounded-3xl p-6 sm:p-8 text-center flex flex-col items-center justify-between space-y-6 shadow-2xl backdrop-blur-xl relative overflow-hidden group transition-all"
            >
              <div className="space-y-4 w-full">
                <div className="w-16 h-16 bg-purple-500/15 text-purple-400 border border-purple-500/30 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-purple-500/20 group-hover:scale-110 transition-transform">
                  <Send className="w-8 h-8" />
                </div>

                <div>
                  <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[11px] font-black uppercase bg-purple-500/10 text-purple-300 mb-2 border border-purple-500/20">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>{t("Official Channel")}</span>
                  </div>
                  <h3 className="text-2xl font-black text-white">{t("WhatsApp Channel")}</h3>
                </div>

                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                  {t("Join our official WhatsApp channel for the latest movie drops, series updates, and exclusive offers.")}
                </p>
              </div>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleWhatsappChannelClick}
                disabled={!settings?.whatsappChannelLink}
                className="w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white disabled:opacity-50 disabled:cursor-not-allowed py-4 rounded-2xl font-black transition-all shadow-xl shadow-purple-600/25 flex items-center justify-center gap-2.5 text-xs sm:text-sm tracking-wide"
              >
                <Send className="w-5 h-5" />
                <span>{t("Join Official Channel")}</span>
              </motion.button>
            </motion.div>
          </div>

          {/* Response Promise Bar */}
          <div className="bg-gradient-to-r from-zinc-900/90 via-zinc-950/90 to-zinc-900/90 rounded-3xl p-6 border border-zinc-800/90 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center shadow-inner">
            <div className="p-2 flex flex-col items-center">
              <Clock className="w-6 h-6 text-emerald-400 mb-1.5" />
              <p className="font-extrabold text-sm text-white">{t("< 3 Minutes")}</p>
              <p className="text-[11px] text-zinc-400">{t("Average response time")}</p>
            </div>
            <div className="p-2 flex flex-col items-center">
              <UserCheck className="w-6 h-6 text-purple-400 mb-1.5" />
              <p className="font-extrabold text-sm text-white">{t("Real Support Staff")}</p>
              <p className="text-[11px] text-zinc-400">{t("Friendly human assistance")}</p>
            </div>
            <div className="p-2 flex flex-col items-center">
              <ShieldCheck className="w-6 h-6 text-teal-400 mb-1.5" />
              <p className="font-extrabold text-sm text-white">{t("100% Privacy")}</p>
              <p className="text-[11px] text-zinc-400">{t("Your data is never shared")}</p>
            </div>
          </div>

          {/* Quick FAQ Section */}
          <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 border border-zinc-800/90 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl backdrop-blur-xl">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
              <HelpCircle className="w-6 h-6 text-amber-400" />
              <h2 className="text-xl sm:text-2xl font-black text-white">{t("Frequently Asked Questions")}</h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-5 space-y-2">
                <h4 className="font-extrabold text-xs sm:text-sm text-emerald-400 flex items-center gap-2">
                  <Zap className="w-4 h-4 shrink-0" />
                  <span>{t("How fast will I receive my movie?")}</span>
                </h4>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {t("Movies are sent directly to your WhatsApp as soon as payment or request is confirmed — usually within a few minutes.")}
                </p>
              </div>

              <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-5 space-y-2">
                <h4 className="font-extrabold text-xs sm:text-sm text-emerald-400 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>{t("Is it safe & virus-free?")}</span>
                </h4>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {t("Yes! All files are tested and verified in high-definition HD quality with zero popups, viruses, or dangerous ads.")}
                </p>
              </div>
            </div>
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
