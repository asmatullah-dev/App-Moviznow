import React, { useState, useEffect } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { CheckCircle, XCircle, PlayCircle, MessageCircle, ArrowLeft } from 'lucide-react';
import { standardizePhone } from '../../contexts/AuthContext';
import { Helmet } from 'react-helmet';
import { useContent } from '../../contexts/ContentContext';
import { Link, useNavigate } from 'react-router-dom';
import { Content } from '../../types';

import { Header } from "../../components/Header";
import { ContactSupportButtons } from "../../components/ContactSupportButtons";
import { PageTransition } from "../../components/PageTransition";

export default function FreeMovies() {
  const { settings } = useSettings();
  const { t } = useLanguage();
  const { contentList, collections } = useContent();
  const navigate = useNavigate();
  const [trendingMovies, setTrendingMovies] = useState<Content[]>([]);

  useEffect(() => {
    const trendingColl = collections.find(c => c.title.toLowerCase() === 'trending');
    if (trendingColl && trendingColl.contentIds) {
      const trending = trendingColl.contentIds
        .map(id => contentList.find(c => c.id === id))
        .filter((c): c is Content => !!c && c.type === 'movie');
      setTrendingMovies(trending);
    } else if (contentList.length > 0) {
      // Fallback to random if collection is empty or not found
      const fallback = contentList
        .filter(c => c.type === 'movie' && c.posterUrl)
        .sort(() => 0.5 - Math.random())
        .slice(0, 6);
      setTrendingMovies(fallback);
    }
  }, [contentList, collections]);

  const handleWhatsappClick = () => {
    const adminPhone = standardizePhone(settings?.supportNumber || "3363284466").replace("+", "");
    const msg = `Assalam O Alaikum! I want to get a movie for PKR 50.`;
    window.open(`https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col transition-colors duration-300">
      <Helmet>
        <title>{settings?.headerText || 'MovizNow'} - {t("Free Movies")}</title>
      </Helmet>

      <Header showBackButton={true} />
      
      <PageTransition className="flex-1 w-full">
        <main className="max-w-4xl mx-auto px-4 mt-8 pb-12 w-full">
        <div className="text-center space-y-6 mb-16">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-emerald-500">
            {t("Free Movies in Pakistan?")}
          </h1>
          <p className="text-xl text-zinc-600 dark:text-zinc-400 font-medium">
            {t("Get them almost-free — PKR 50 in HD.")}
          </p>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            {t('Free movie download sites in Pakistan are illegal, full of viruses, popups aur VPN ki zaroorat hoti hai.').replace('%APP_NAME%', settings?.headerText || 'MovizNow')} {t('Safe legal alternative hai — full HD Bollywood, Hollywood, Punjabi aur Pakistani movies sirf PKR 50 me, seedha WhatsApp par delivery. Ek biscuit ki price me poori HD movie.')}
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
            <button
              onClick={handleWhatsappClick}
              className="w-full sm:w-auto bg-[#25D366] hover:bg-[#20b858] text-white px-8 py-4 rounded-xl font-bold transition-all shadow-lg shadow-[#25D366]/20 flex items-center justify-center gap-3 text-lg"
            >
              <MessageCircle className="w-6 h-6" /> {t("Get PKR 50 Movie on WhatsApp")}
            </button>
            <Link
              to="/?type=movie"
              className="w-full sm:w-auto bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white px-8 py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-3 text-lg border border-zinc-200 dark:border-zinc-800"
            >
              <PlayCircle className="w-6 h-6" /> {t("Browse Full Catalog")}
            </Link>
          </div>
        </div>

        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-3xl p-8 mb-16 border border-zinc-200 dark:border-zinc-800">
          <h2 className="text-2xl font-bold text-center mb-8">{t("Free download sites vs.")} {settings?.headerText || 'MovizNow'}</h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="font-bold text-red-500 mb-6 text-xl flex items-center gap-2">
                <XCircle className="w-6 h-6" /> {t("Free piracy sites")}
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3 text-zinc-600 dark:text-zinc-400">
                  <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <span>{t("Illegal & unsafe")}</span>
                </li>
                <li className="flex items-start gap-3 text-zinc-600 dark:text-zinc-400">
                  <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <span>{t("Malware, viruses, phishing popups")}</span>
                </li>
                <li className="flex items-start gap-3 text-zinc-600 dark:text-zinc-400">
                  <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <span>{t("VPN required, slow downloads")}</span>
                </li>
                <li className="flex items-start gap-3 text-zinc-600 dark:text-zinc-400">
                  <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <span>{t("Fake \"download\" buttons, ads everywhere")}</span>
                </li>
                <li className="flex items-start gap-3 text-zinc-600 dark:text-zinc-400">
                  <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <span>{t("Poor quality, wrong files, no support")}</span>
                </li>
              </ul>
            </div>
            
            <div className="space-y-4">
              <h3 className="font-bold text-emerald-500 mb-6 text-xl flex items-center gap-2">
                <CheckCircle className="w-6 h-6" /> {settings?.headerText || 'MovizNow'} (PKR 50)
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3 text-zinc-900 dark:text-white font-medium">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{t("Safe, legal, ad-free")}</span>
                </li>
                <li className="flex items-start gap-3 text-zinc-900 dark:text-white font-medium">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{t("Verified HD source, no viruses")}</span>
                </li>
                <li className="flex items-start gap-3 text-zinc-900 dark:text-white font-medium">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{t("No VPN — delivered on WhatsApp")}</span>
                </li>
                <li className="flex items-start gap-3 text-zinc-900 dark:text-white font-medium">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{t("Only PKR 50 per movie (biscuit price)")}</span>
                </li>
                <li className="flex items-start gap-3 text-zinc-900 dark:text-white font-medium">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{t("Real support on WhatsApp")}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {trendingMovies.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
               {t("Trending Now")}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {trendingMovies.map(movie => (
                <Link key={movie.id} to={`/${movie.id}`} className="group relative rounded-xl overflow-hidden aspect-[2/3] block">
                  <img src={movie.posterUrl} alt={movie.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                    <p className="text-white font-bold text-xs line-clamp-2">{movie.title}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
        
        <div className="mt-12 border-t border-zinc-200 dark:border-zinc-800 pt-8">
          <ContactSupportButtons />
        </div>
      </main>
      </PageTransition>
    </div>
  );
}
