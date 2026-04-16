import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useContent } from '../../contexts/ContentContext';
import { Film, Clock, ArrowLeft } from 'lucide-react';
import { formatContentTitle } from '../../utils/contentUtils';
import { NotificationMenu } from '../../components/NotificationMenu';
import { UserProfileMenu } from '../../components/UserProfileMenu';
import { AdminButtons } from '../../components/AdminButtons';
import { CartButton } from '../../components/CartButton';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import ContentCard from '../../components/ContentCard';

export default function WatchLater() {
  const { profile, toggleFavorite, toggleWatchLater } = useAuth();
  const { contentList, genres, languages, qualities } = useContent();

  const watchLaterContent = contentList.filter(c => 
    profile?.watchLater?.includes(c.id) && 
    (profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'content_manager' || profile?.role === 'manager' || (
      c.status !== 'draft' && (
        c.status !== 'selected_content' || 
        profile?.assignedContent?.some(id => id === c.id || id.startsWith(`${c.id}:`))
      )
    ))
  ).sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
    if (a.order === undefined && b.order !== undefined) return -1;
    if (a.order !== undefined && b.order === undefined) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col transition-colors duration-300">
      <header className="sticky top-0 z-40 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-500" />
              Watch Later
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {profile && <NotificationMenu />}
            <AdminButtons profile={profile} />
            <CartButton />
            <UserProfileMenu />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
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
        
        {watchLaterContent.length === 0 && (
          <div className="text-center py-20 text-zinc-500">
            <Film className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-xl">Your Watch Later list is empty</p>
          </div>
        )}
      </main>
    </div>
  );
}
