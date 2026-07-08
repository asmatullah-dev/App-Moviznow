import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useContent } from '../../contexts/ContentContext';
import { Film, Heart, ArrowLeft } from 'lucide-react';
import { formatContentTitle } from '../../utils/contentUtils';
import { NotificationMenu } from '../../components/NotificationMenu';
import { UserProfileMenu } from '../../components/UserProfileMenu';
import { AdminButtons } from '../../components/AdminButtons';
import { CartButton } from '../../components/CartButton';

import ContentCard from '../../components/ContentCard';

export default function Favorites() {
  const { profile, toggleFavorite, toggleWatchLater } = useAuth();
  const { t } = useLanguage();
  const { contentList, genres, languages, qualities } = useContent();

  const favoriteContent = useMemo(() => {
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
      profile?.favorites?.includes(c.id) && 
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
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col transition-colors duration-300">
      <header className="sticky top-0 z-40 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500" />
              {t('Favorites')}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <NotificationMenu />
            <AdminButtons profile={profile} />
            <CartButton />
            <UserProfileMenu />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {favoriteContent.map((content) => (
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
        
        {favoriteContent.length === 0 && (
          <div className="text-center py-20 text-zinc-500">
            <Film className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-xl">{t('Your Favorites list is empty')}</p>
          </div>
        )}
      </main>
    </div>
  );
}
