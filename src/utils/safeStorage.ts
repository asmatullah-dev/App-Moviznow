/**
 * A safe wrapper for localStorage that handles cases where access is denied
 * (e.g., in iframes with third-party cookie blocking enabled).
 * Falls back to in-memory storage if localStorage is unavailable.
 * Also provides an async wrapper for IndexedDB to store larger amounts of data (e.g. >15MB).
 */

class SafeStorage {
  private memoryStorage: Map<string, string> = new Map();
  public isAvailable: boolean;

  constructor() {
    this.isAvailable = this.checkAvailability();
  }

  private checkAvailability(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Migrate huge objects (e.g., content_cache, collections_cache, chunks)
   * out of localStorage into IndexedDB & Memory to immediately free 3-4MB of localStorage space.
   */
  public purgeQuotaExceeded(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const keysToRemove: string[] = [];
      const heavyPrefixes = [
        'content_cache',
        'collections_cache',
        'cached_all_users',
        'content_chunk_',
        'collection_chunk_',
        'movie_details_',
        'poster_cache_',
        'tmdb_images_',
        'imdb_rating_',
        'v2_trans_',
        'thumbnail_'
      ];

      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key) continue;

        if (heavyPrefixes.some(p => key === p || key.startsWith(p))) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((k) => {
        try {
          const val = window.localStorage.getItem(k);
          if (val) {
            this.memoryStorage.set(k, val);
            this.setItemAsync(k, val).catch(() => {});
          }
          window.localStorage.removeItem(k);
        } catch (e) {}
      });
    } catch (e) {}
  }

  // --- Synchronous methods (5MB limit usually) ---

  getItem(key: string): string | null {
    if (this.memoryStorage.has(key)) {
      return this.memoryStorage.get(key) || null;
    }

    if (this.isAvailable) {
      try {
        const item = window.localStorage.getItem(key);
        if (item !== null) {
          this.memoryStorage.set(key, item);
          return item;
        }
      } catch (e) {
        return this.memoryStorage.get(key) || null;
      }
    }
    return this.memoryStorage.get(key) || null;
  }

  setItem(key: string, value: string): void {
    // Synchronously update memory storage so instant access always works
    this.memoryStorage.set(key, value);

    if (this.isAvailable) {
      // Rule: Do NOT store values larger than 150KB in localStorage (e.g., content_cache, collections_cache).
      // Storing huge objects in localStorage quickly exceeds the 5MB domain quota!
      if (value.length > 150000) {
        this.setItemAsync(key, value).catch(() => {});
        try {
          window.localStorage.removeItem(key);
        } catch (e) {}
        return;
      }

      try {
        window.localStorage.setItem(key, value);
        return;
      } catch (e) {
        // QuotaExceededError! Evict heavy/non-critical items from localStorage
        this.purgeQuotaExceeded();
        try {
          window.localStorage.setItem(key, value);
          return;
        } catch (retryErr) {
          // If still failing, memoryStorage is already updated, so app won't crash
        }
      }
    }
  }

  removeItem(key: string): void {
    if (this.isAvailable) {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch (e) {
        // Fall through to memory storage
      }
    }
    this.memoryStorage.delete(key);
  }

  clear(): void {
    if (this.isAvailable) {
      try {
        window.localStorage.clear();
        return;
      } catch (e) {
        // Fall through to memory storage
      }
    }
    this.memoryStorage.clear();
  }

  keys(): string[] {
    if (this.isAvailable) {
      try {
        return Object.keys(window.localStorage);
      } catch (e) {
        return Array.from(this.memoryStorage.keys());
      }
    }
    return Array.from(this.memoryStorage.keys());
  }

  // --- Asynchronous methods (IndexedDB, unlimited size basically) ---
  
  private initDB(): Promise<IDBDatabase> {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB not available'));
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('moviznow_cache_db', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('cache')) {
          // If for some reason it's version 2 but still no cache (shouldn't happen), reject
          reject(new Error("Object store 'cache' not found."));
          return;
        }
        resolve(db);
      };
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache');
        }
      };
    });
  }

  async setItemAsync(key: string, value: string): Promise<void> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('cache', 'readwrite');
        const store = tx.objectStore('cache');
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch(e) {
      this.setItem(key, value); // Fallback
    }
  }

  async getItemAsync(key: string): Promise<string | null> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('cache', 'readonly');
        const store = tx.objectStore('cache');
        const req = store.get(key);
        req.onsuccess = () => {
           if (req.result !== undefined) resolve(req.result);
           else resolve(this.getItem(key)); // Fallback
        };
        req.onerror = () => resolve(this.getItem(key)); // Fallback on error
      });
    } catch(e) {
      return this.getItem(key); // Fallback
    }
  }

  async removeItemAsync(key: string): Promise<void> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('cache', 'readwrite');
        const store = tx.objectStore('cache');
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch(e) {
      this.removeItem(key); // Fallback
    }
  }
}

export const safeStorage = new SafeStorage();
