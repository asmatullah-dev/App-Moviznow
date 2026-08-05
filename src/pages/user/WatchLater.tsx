import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useContent } from '../../contexts/ContentContext';
import { Film, Clock, ArrowLeft, Bookmark, Sparkles, Compass } from 'lucide-react';
import { formatContentTitle } from '../../utils/contentUtils';
import { NotificationMenu } from '../../components/NotificationMenu';
import { UserProfileMenu } from '../../components/UserProfileMenu';
import { AdminButtons } from '../../components/AdminButtons';
import { CartButton } from '../../components/CartButton';

import ContentCard from '../../components/ContentCard';

export default function WatchLater() {
  const { profile, toggleFavorite, toggleWatchLater } = useAuth();
  const { t } = useLanguage();
  const { contentList, genres, languages, qualities } = useContent();

  const watchLaterContent = useMemo(() => {
    const assignedContentSet = new Set<string>();
    profile?.assignedContent?.forEach(id => {
      assignedContentSet.add(id);
      if (id.includes(':')) {
        assignedContentSet.add(id.split(':')[0]);
      }
    });

    const canPlayBase = 
      profile?.role === 'admin' ||
      profile?.role === 'owner' ||
      profile?.role === 'manager' ||
      profile?.role === 'content_manager';
      
    const isProfileActive = profile?.status === 'active';
    const isSelectedContentRole = profile?.role === "selected_content";

    const getCanPlay = (c: any) => {
      if (canPlayBase) return true;
      if (assignedContentSet.has(c.id)) return true;
      return isProfileActive && !isSelectedContentRole && c.status !== "selected_content";
    };

    return contentList.filter(c => 
      profile?.watchLater?.includes(c.id) && 
      (canPlayBase || (
        c.status !== 'draft' && (
          c.status !== 'selected_content' || 
          assignedContentSet.has(c.id)
        )
      ))
    ).sort((a, b) => {
      const aCanPlay = getCanPlay(a) ? 1 : 0;
      const bCanPlay = getCanPlay(b) ? 1 : 0;
      if (aCanPlay !== bCanPlay) return bCanPlay - aCanPlay;

      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeB !== timeA) return timeB - timeA;
      if (a.order !== undefined && b.order !== undefined) return b.order - a.order;
      return 0;
    });
  }, [contentList, profile]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col transition-colors duration-300">
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link 
              to="/" 
              className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-all active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
                <Clock className="w-4 h-4" />
              </div>
              <h1 className="text-lg font-extrabold text-zinc-900 dark:text-white">{t('Watch Later')}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationMenu />
            <AdminButtons profile={profile} />
            <CartButton />
            <UserProfileMenu />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        {/* Hero Section Banner */}
        <div className="relative mb-8 rounded-3xl overflow-hidden bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 p-6 md:p-8 text-white shadow-xl shadow-emerald-500/10">
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-bold tracking-wider uppercase mb-3 text-emerald-100">
                <Bookmark className="w-3.5 h-3.5" />
                <span>{t('Saved Queue')}</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight">{t('Your Watch Later List')}</h2>
              <p className="text-emerald-100/80 text-sm mt-1 max-w-xl font-medium">
                {t('Keep track of movies and series you plan to stream next. Easily access them anytime.')}
              </p>
            </div>
            
            <div className="flex items-center gap-3 self-start md:self-center">
              <div className="px-4 py-2.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-emerald-200" />
                <span className="text-xs font-bold text-white">
                  {watchLaterContent.length} {watchLaterContent.length === 1 ? t('Title Saved') : t('Titles Saved')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {watchLaterContent.map((content) => (
            <ContentCard
              key={content.id}
              content={content}
              profile={profile}
              qualities={qualities}
              languages={languages}
              genres={genres}
              onToggleFavorite={toggleFavorite}
              onToggleWatchLater={toggleWatchLater}
            />
          ))}
        </div>
        
        {/* Empty State */}
        {watchLaterContent.length === 0 && (
          <div className="relative my-12 p-12 text-center bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-sm overflow-hidden">
            <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Clock className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-extrabold text-zinc-900 dark:text-white mb-2">{t('Your Watch Later list is empty')}</h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-md mx-auto mb-6">
              {t('Explore our collection and click the watch later bookmark icon on any title to save it here for quick access.')}
            </p>
            <Link 
              to="/" 
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold text-sm shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
            >
              <Compass className="w-4 h-4" />
              <span>{t('Explore Content')}</span>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
