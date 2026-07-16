import React from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Helmet } from 'react-helmet';
import { Film, Shield, Zap, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Header } from "../../components/Header";
import { ContactSupportButtons } from "../../components/ContactSupportButtons";
import { PageTransition } from "../../components/PageTransition";

export default function About() {
  const { settings } = useSettings();
  const { t } = useLanguage();
  const appName = settings?.headerText || 'MovizNow';
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col transition-colors duration-300">
      <Helmet>
        <title>{appName} - {t("About Us")}</title>
      </Helmet>

      <Header showBackButton={true} />
      
      <PageTransition className="flex-1 w-full">
        <main className="max-w-4xl mx-auto px-4 mt-8 pb-12 w-full">
        <div className="text-center space-y-6 mb-16">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
            {t("About %APP_NAME%").replace('%APP_NAME%', appName)}
          </h1>
          <p className="text-xl text-zinc-600 dark:text-zinc-400 font-medium max-w-2xl mx-auto">
            {t("Your premium destination for HD movies and web series in Pakistan.")}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-3xl p-8 border border-zinc-200 dark:border-zinc-800 text-center">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Film className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold mb-3">{t("Vast Collection")}</h3>
            <p className="text-zinc-600 dark:text-zinc-400">
              {t("Access thousands of movies and web series from Bollywood, Hollywood, and local cinema in pristine HD quality.")}
            </p>
          </div>
          
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-3xl p-8 border border-zinc-200 dark:border-zinc-800 text-center">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Shield className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold mb-3">{t("Safe & Secure")}</h3>
            <p className="text-zinc-600 dark:text-zinc-400">
              {t("No more sketchy download sites, viruses, or VPNs. We provide direct, safe access to the content you love.")}
            </p>
          </div>
          
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-3xl p-8 border border-zinc-200 dark:border-zinc-800 text-center">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Zap className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold mb-3">{t("Fast Delivery")}</h3>
            <p className="text-zinc-600 dark:text-zinc-400">
              {t("Get your favorite content delivered directly to your WhatsApp instantly. No waiting, no buffering.")}
            </p>
          </div>
        </div>

        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-3xl p-8 md:p-12 border border-zinc-200 dark:border-zinc-800">
          <h2 className="text-2xl md:text-3xl font-bold mb-6">{t("Our Mission")}</h2>
          <div className="space-y-4 text-zinc-600 dark:text-zinc-400 text-lg leading-relaxed">
            <p>
              {t('At %APP_NAME%, we believe entertainment should be accessible, affordable, and safe. For too long, finding a good movie online meant navigating through a maze of popup ads, malware, and broken links.').replace('%APP_NAME%', appName)}
            </p>
            <p>
              {t("We're changing that by offering a clean, straightforward service. Whether you want to buy a single movie for just PKR 50 or join our membership for daily content, we ensure you get exactly what you pay for — high-quality entertainment without the hassle.")}
            </p>
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
