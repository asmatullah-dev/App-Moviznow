import { useState, useEffect, useCallback } from 'react';
import { Content } from '../types';
import {
  getCachedImdbRating,
  fetchLiveImdbRating,
  reloadLiveImdbRating,
  formatImdbRating,
  CachedImdbRating
} from '../services/imdbRatingService';

export function useImdbRating(content?: (Partial<Content> & { id: string }) | null, options?: { skipLiveFetch?: boolean }) {
  const contentId = content?.id;
  const initialStaticRating = content?.imdbRating;
  const initialStaticOtt = content?.ottPlatform || (content as any)?.ott_platform;

  const [rating, setRating] = useState<string | null>(() => {
    if (!contentId) return null;
    const cached = getCachedImdbRating(contentId);
    if (cached?.rating) return cached.rating;
    return formatImdbRating(initialStaticRating);
  });

  const [ottPlatform, setOttPlatform] = useState<string | null>(() => {
    if (!contentId) return initialStaticOtt || null;
    const cached = getCachedImdbRating(contentId);
    if (cached?.ottPlatform) return cached.ottPlatform;
    return initialStaticOtt || null;
  });

  const [isLoading, setIsLoading] = useState(false);

  // Synchronize when content or ID changes
  useEffect(() => {
    if (!contentId) {
      setRating(null);
      setOttPlatform(null);
      return;
    }

    const cached = getCachedImdbRating(contentId);
    if (cached?.rating) {
      setRating(cached.rating);
    } else {
      setRating(formatImdbRating(content?.imdbRating));
    }

    if (cached?.ottPlatform) {
      setOttPlatform(cached.ottPlatform);
    } else {
      setOttPlatform(content?.ottPlatform || (content as any)?.ott_platform || null);
    }

    // If no valid cache exists or missing rating/OTT, fetch live (unless skipLiveFetch is requested)
    if (content && (!cached?.rating || !cached?.ottPlatform) && !options?.skipLiveFetch) {
      setIsLoading(true);
      fetchLiveImdbRating(content)
        .then((res) => {
          if (res?.rating) setRating(res.rating);
          if (res?.ottPlatform) setOttPlatform(res.ottPlatform);
        })
        .catch(() => {})
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [contentId, content?.imdbRating, content?.ottPlatform, (content as any)?.ott_platform, content?.imdbLink, content?.title, content?.year, options?.skipLiveFetch]);

  // Listen to live update broadcasts across the app
  useEffect(() => {
    if (!contentId) return;

    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ contentId: string; rating?: string; ottPlatform?: string }>;
      if (customEvent.detail && customEvent.detail.contentId === contentId) {
        if (customEvent.detail.rating) setRating(customEvent.detail.rating);
        if (customEvent.detail.ottPlatform) setOttPlatform(customEvent.detail.ottPlatform);
      }
    };

    window.addEventListener('imdb_rating_updated', handleUpdate);
    return () => {
      window.removeEventListener('imdb_rating_updated', handleUpdate);
    };
  }, [contentId]);

  // Function to manually reload live rating (e.g., on click or preview)
  const refresh = useCallback(() => {
    if (!content || !contentId) return Promise.resolve(null);
    setIsLoading(true);
    return reloadLiveImdbRating(content)
      .then((res) => {
        if (res?.rating) setRating(res.rating);
        if (res?.ottPlatform) setOttPlatform(res.ottPlatform);
        return res;
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [content, contentId]);

  return {
    rating, // e.g. "8.2"
    ottPlatform, // e.g. "Netflix"
    isLoading,
    refreshRating: refresh
  };
}
