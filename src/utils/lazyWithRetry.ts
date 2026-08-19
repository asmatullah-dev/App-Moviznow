import React, { lazy } from 'react';

/**
 * Robust wrapper around React.lazy that catches chunk loading errors
 * (caused when a new deployment invalidates old JS asset hashes) and
 * automatically purges browser/SW caches and reloads the fresh assets.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error: any) {
      console.warn('[ChunkLoader] Dynamic import failed (stale build detected). Reloading page...', error);
      const lastChunkReload = parseInt(sessionStorage.getItem('last_chunk_error_reload') || '0', 10);
      
      if (Date.now() - lastChunkReload > 10000) {
        sessionStorage.setItem('last_chunk_error_reload', String(Date.now()));
        if ('caches' in window) {
          try {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          } catch (e) {}
        }
        window.location.href = window.location.pathname + '?_v=' + Date.now();
      }
      throw error;
    }
  });
}
