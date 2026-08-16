import { useState, useEffect, useCallback } from 'react';
import { Content } from '../types';
import {
  getCachedImdbRating,
  fetchLiveImdbRating,
  reloadLiveImdbRating,
  formatImdbRating,
  CachedImdbRating
} from '../services/imdbRatingService';

export function useImdbRating(content?: (Partial<Content> & { id: string }) | null) {
  const contentId = content?.id;
  const initialStaticRating = content?.imdbRating;

  const [rating, setRating] = useState<string | null>(() => {
    if (!contentId) return null;
    const cached = getCachedImdbRating(contentId);
    if (cached?.rating) return cached.rating;
    return formatImdbRating(initialStaticRating);
  });

  const [isLoading, setIsLoading] = useState(false);

  // Synchronize when content or ID changes
  useEffect(() => {
    if (!contentId) {
      setRating(null);
      return;
    }

    const cached = getCachedImdbRating(contentId);
    if (cached?.rating) {
      setRating(cached.rating);
    } else {
      const fallback = formatImdbRating(content?.imdbRating);
      setRating(fallback);

      // If no valid cache exists or old data expired (> 5 days), fetch live
      if (content) {
        setIsLoading(true);
        fetchLiveImdbRating(content)
          .then((res) => {
            if (res?.rating) {
              setRating(res.rating);
            }
          })
          .catch(() => {})
          .finally(() => {
            setIsLoading(false);
          });
      }
    }
  }, [contentId, content?.imdbRating, content?.imdbLink, content?.title, content?.year]);

  // Listen to live update broadcasts across the app
  useEffect(() => {
    if (!contentId) return;

    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ contentId: string; rating: string }>;
      if (customEvent.detail && customEvent.detail.contentId === contentId) {
        setRating(customEvent.detail.rating);
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
        if (res?.rating) {
          setRating(res.rating);
        }
        return res;
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [content, contentId]);

  return {
    rating, // e.g. "8.2"
    isLoading,
    refreshRating: refresh
  };
}
