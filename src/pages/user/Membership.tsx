import React, { useState, useEffect } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { CheckCircle, MessageCircle, ArrowLeft } from 'lucide-react';
import { standardizePhone } from '../../contexts/AuthContext';
import { Helmet } from 'react-helmet';
import { useNavigate, Link } from 'react-router-dom';
import { useContent } from '../../contexts/ContentContext';
import { Content } from '../../types';

import { Header } from "../../components/Header";
import { ContactSupportButtons } from "../../components/ContactSupportButtons";
import { PageTransition } from "../../components/PageTransition";

export default function Membership() {
  const { settings } = useSettings();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { contentList, collections } = useContent();
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

  const handleWhatsappClick = (plan: string, price: string) => {
    const adminPhone = standardizePhone(settings?.supportNumber || "3363284466").replace("+", "");
    const msg = `Assalam O Alaikum! I want to get the ${plan} plan for ${price}.`;
    window.open(`https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col transition-colors duration-300">
      <Helmet>
        <title>{settings?.headerText || 'MovizNow'} - {t("Membership")}</title>
      </Helmet>

      <Header showBackButton={true} />
      
      <PageTransition className="flex-1 w-full">
        <main className="max-w-6xl mx-auto px-4 mt-8 pb-12 w-full">
        <div className="text-center space-y-6 mb-16">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
            {t("Simple, honest pricing")}
          </h1>
          <p className="text-xl text-zinc-600 dark:text-zinc-400 font-medium max-w-2xl mx-auto">
            {t("Pay per title, or join the group and get 6–7 fresh HD movies delivered every single day.")}
          </p>
        </div>

        {/* Membership Plans Grid */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-20">
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-3xl p-8 border border-zinc-200 dark:border-zinc-800 flex flex-col">
            <h3 className="text-2xl font-bold mb-2">{t("Single Movie")}</h3>
            <div className="text-4xl font-extrabold text-emerald-500 mb-1">{t("PKR 50")}</div>
            <p className="text-zinc-500 mb-6">{t("one-time")}</p>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-emerald-500" /> {t("Any movie in the catalog")}</li>
              <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-emerald-500" /> {t("Full HD quality")}</li>
              <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-emerald-500" /> {t("Delivered on WhatsApp")}</li>
              <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-emerald-500" /> {t("Same-day delivery")}</li>
            </ul>
            <button
              onClick={() => handleWhatsappClick('Single Movie', 'PKR 50')}
              className="w-full bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5" /> {t("Get on WhatsApp")}
            </button>
          </div>
          
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-3xl p-8 border border-zinc-200 dark:border-zinc-800 flex flex-col">
            <h3 className="text-2xl font-bold mb-2">{t("Web Series Season")}</h3>
            <div className="text-4xl font-extrabold text-emerald-500 mb-1">{t("PKR 100")}</div>
            <p className="text-zinc-500 mb-6">{t("per season")}</p>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-emerald-500" /> All episodes in one pack</li>
              <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-emerald-500" /> HD quality</li>
              <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-emerald-500" /> Price may vary by size</li>
              <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-emerald-500" /> Priority delivery</li>
            </ul>
            <button
              onClick={() => handleWhatsappClick('Web Series Season', 'PKR 100')}
              className="w-full bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5" /> {t("Get on WhatsApp")}
            </button>
          </div>
        </div>

        <div className="text-center space-y-6 mb-12">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Membership Group
          </h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 font-medium max-w-2xl mx-auto">
            {t("Join the group — save up to 44%")}<br/>
            {t("Daily 6–7 HD movies")} & web series delivered inside the WhatsApp group. Longer plans unlock bigger discounts.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {/* 1 Month */}
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 flex flex-col">
            <h3 className="text-xl font-bold mb-2">{t("1 Month")}</h3>
            <div className="text-3xl font-extrabold text-emerald-500 mb-1">{t("PKR 300")}</div>
            <p className="text-zinc-500 mb-6 text-sm">{t("≈ PKR 300/month")}</p>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-6 min-h-[40px]">Base monthly rate</p>
            <ul className="space-y-3 mb-8 flex-1 text-sm">
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> {t("Daily 6–7 HD movies")}</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> {t("Latest web series")}</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> {t("Priority WhatsApp support")}</li>
            </ul>
            <button
              onClick={() => handleWhatsappClick('1 Month Membership', 'PKR 300')}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-all"
            >{t("Join Now")}</button>
          </div>

          {/* 3 Months */}
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-bl-xl">{t("Save 17%")}</div>
            <h3 className="text-xl font-bold mb-2">{t("3 Months")}</h3>
            <div className="text-3xl font-extrabold text-emerald-500 mb-1">{t("PKR 750")}</div>
            <p className="text-zinc-500 mb-6 text-sm">{t("≈ PKR 250/month")}</p>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-6 min-h-[40px]">
              <span className="line-through text-zinc-400">{t("PKR 900")}</span> <span className="text-emerald-500 font-bold">{t("Save PKR 150")}</span>
            </p>
            <ul className="space-y-3 mb-8 flex-1 text-sm">
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> {t("Daily 6–7 HD movies")}</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> {t("Latest web series")}</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> {t("Priority WhatsApp support")}</li>
            </ul>
            <button
              onClick={() => handleWhatsappClick('3 Months Membership', 'PKR 750')}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-all"
            >{t("Join Now")}</button>
          </div>

          {/* 6 Months */}
          <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-3xl p-6 border-2 border-emerald-500 flex flex-col relative overflow-hidden transform md:-translate-y-4 shadow-xl shadow-emerald-500/10">
            <div className="absolute top-0 inset-x-0 bg-emerald-500 text-white text-xs font-bold py-1 text-center">{t("Most Popular • Save 22%")}</div>
            <h3 className="text-xl font-bold mb-2 mt-4">{t("6 Months")}</h3>
            <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mb-1">{t("PKR 1,400")}</div>
            <p className="text-zinc-500 mb-6 text-sm">{t("≈ PKR 233/month")}</p>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-6 min-h-[40px]">
              <span className="line-through text-zinc-400">{t("PKR 1,800")}</span> <span className="text-emerald-500 font-bold">{t("Save PKR 400")}</span>
            </p>
            <ul className="space-y-3 mb-8 flex-1 text-sm">
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> {t("Daily 6–7 HD movies")}</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> {t("Latest web series")}</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> {t("Priority WhatsApp support")}</li>
            </ul>
            <button
              onClick={() => handleWhatsappClick('6 Months Membership', 'PKR 1,400')}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20"
            >{t("Join Now")}</button>
          </div>

          {/* 1 Year */}
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-bl-xl">{t("Best Value • Save 28%")}</div>
            <h3 className="text-xl font-bold mb-2">{t("1 Year")}</h3>
            <div className="text-3xl font-extrabold text-emerald-500 mb-1">{t("PKR 2,600")}</div>
            <p className="text-zinc-500 mb-6 text-sm">{t("≈ PKR 217/month")}</p>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-6 min-h-[40px]">
              <span className="line-through text-zinc-400">{t("PKR 3,600")}</span> <span className="text-emerald-500 font-bold">{t("Save PKR 1,000")}</span>
            </p>
            <ul className="space-y-3 mb-8 flex-1 text-sm">
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> {t("Daily 6–7 HD movies")}</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> {t("Latest web series")}</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> {t("Priority WhatsApp support")}</li>
            </ul>
            <button
              onClick={() => handleWhatsappClick('1 Year Membership', 'PKR 2,600')}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-all"
            >{t("Join Now")}</button>
          </div>
          
          {/* 2 Years */}
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 flex flex-col relative overflow-hidden md:col-span-2 lg:col-span-4 max-w-2xl mx-auto w-full mt-4">
            <div className="absolute top-0 right-0 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-bl-xl">{t("Mega Saver • Save 44%")}</div>
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="flex-1 w-full">
                <h3 className="text-xl font-bold mb-2">{t("2 Years")}</h3>
                <div className="text-3xl font-extrabold text-emerald-500 mb-1">{t("PKR 4,000")}</div>
                <p className="text-zinc-500 mb-2 text-sm">{t("≈ PKR 167/month")}</p>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">
                  <span className="line-through text-zinc-400">{t("PKR 7,200")}</span> <span className="text-emerald-500 font-bold">{t("Save PKR 3,200")}</span>
                </p>
              </div>
              <div className="flex-1 w-full">
                <ul className="space-y-2 mb-6 text-sm">
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> {t("Daily 6–7 HD movies")}</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> {t("Latest web series")}</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> {t("Priority WhatsApp support")}</li>
                </ul>
                <button
                  onClick={() => handleWhatsappClick('2 Years Membership', 'PKR 4,000')}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-all"
                >{t("Join Now")}</button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-100 dark:bg-zinc-900 rounded-2xl p-6 flex flex-wrap items-center justify-center gap-6 md:gap-12 text-sm font-bold text-zinc-700 dark:text-zinc-300 text-center mb-16">
          <div className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-emerald-500" /> {t("Daily 6–7 Movies")}</div>
          <div className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-emerald-500" /> {t("Latest Web Series")}</div>
          <div className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-emerald-500" /> {t("HD Quality")}</div>
          <div className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-emerald-500" /> {t("Priority Updates")}</div>
        </div>

        {trendingMovies.length > 0 && (
          <div className="mt-16">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
               {t("Trending Movies")}
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
