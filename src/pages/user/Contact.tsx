import React from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Helmet } from 'react-helmet';
import { MessageCircle, Send, ArrowLeft } from 'lucide-react';
import { standardizePhone } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

import { Header } from "../../components/Header";
import { ContactSupportButtons } from "../../components/ContactSupportButtons";
import { PageTransition } from "../../components/PageTransition";

export default function Contact() {
  const { settings } = useSettings();
  const { t } = useLanguage();
  const appName = settings?.headerText || 'MovizNow';
  const navigate = useNavigate();

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
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col transition-colors duration-300">
      <Helmet>
        <title>{appName} - {t("Contact Us")}</title>
      </Helmet>

      <Header showBackButton={true} />
      
      <PageTransition className="flex-1 w-full">
        <main className="max-w-3xl mx-auto px-4 mt-8 pb-12 w-full">
        <div className="text-center space-y-6 mb-16">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
            Contact Us
          </h1>
          <p className="text-xl text-zinc-600 dark:text-zinc-400 font-medium">
            {t("Get in touch with the %APP_NAME% team.").replace("%APP_NAME%", appName)}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-3xl p-8 border border-zinc-200 dark:border-zinc-800 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-[#25D366]/10 text-[#25D366] rounded-2xl flex items-center justify-center mb-6">
              <MessageCircle className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold mb-3">{t("WhatsApp Support")}</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-8 flex-1">
              {t("Have a question or need to request a specific movie? Reach out directly on WhatsApp for fast support.")}
            </p>
            <button
              onClick={handleWhatsappSupportClick}
              className="w-full bg-[#25D366] hover:bg-[#20b858] text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-[#25D366]/20 flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5" /> {t("Chat on WhatsApp")}
            </button>
          </div>
          
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-3xl p-8 border border-zinc-200 dark:border-zinc-800 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center mb-6">
              <Send className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold mb-3">{t("WhatsApp Channel")}</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-8 flex-1">
              {t("Join our official WhatsApp channel for the latest movie drops, series updates, and exclusive offers.")}
            </p>
            <button
              onClick={handleWhatsappChannelClick}
              disabled={!settings?.whatsappChannelLink}
              className="w-full bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
            >
              <Send className="w-5 h-5" /> {t("Join Channel")}
            </button>
          </div>
        </div>

        <div className="mt-12 border-t border-zinc-200 dark:border-zinc-800 pt-8">
          <ContactSupportButtons />
        </div>
      </main>
      </PageTransition>
    </div>
  );
}
