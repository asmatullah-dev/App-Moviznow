/**
 * A safe wrapper for localStorage that handles cases where access is denied
 * (e.g., in iframes with third-party cookie blocking enabled).
 * Falls back to in-memory storage if localStorage is unavailable.
 * Also provides an async wrapper for IndexedDB to store larger amounts of data (e.g. >15MB)
 * and automatically hydrates in-memory storage from IndexedDB on startup.
 */

class SafeStorage {
  private memoryStorage: Map<string, string> = new Map();
  public isAvailable: boolean;
  public isHydrated: boolean = false;
  private hydrationPromise: Promise<void> | null = null;

  constructor() {
    this.isAvailable = this.checkAvailability();
    if (typeof window !== 'undefined') {
      this.hydrate();
    }
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
   * Migrate heavy non-essential objects out of localStorage to free up 5MB quota.
   */
  public purgeQuotaExceeded(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const keysToRemove: string[] = [];
      const heavyPrefixes = [
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

  /**
   * Hydrates memory storage from IndexedDB so large objects (like chunks and content catalogs)
   * stored across sessions are immediately accessible synchronously.
   */
  public hydrate(): Promise<void> {
    if (this.hydrationPromise) return this.hydrationPromise;
    this.hydrationPromise = (async () => {
      try {
        const db = await this.initDB();
        await new Promise<void>((resolve) => {
          const tx = db.transaction('cache', 'readonly');
          const store = tx.objectStore('cache');
          const req = store.openCursor();
          req.onsuccess = (e: any) => {
            const cursor = e.target.result;
            if (cursor) {
              const k = String(cursor.key);
              const v = typeof cursor.value === 'string' ? cursor.value : JSON.stringify(cursor.value);
              if (!this.memoryStorage.has(k)) {
                this.memoryStorage.set(k, v);
              }
              cursor.continue();
            } else {
              resolve();
            }
          };
          req.onerror = () => resolve();
        });
      } catch (e) {
        // IndexedDB unavailable or blocked, memory and localStorage still work
      }
      this.isHydrated = true;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('safe_storage_hydrated'));
      }
    })();
    return this.hydrationPromise;
  }

  public whenHydrated(): Promise<void> {
    if (this.isHydrated) return Promise.resolve();
    return this.hydrate();
  }

  // --- Synchronous methods ---

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

    // Asynchronously write to IndexedDB to guarantee persistence of large items
    this.setItemAsync(key, value).catch(() => {});

    if (this.isAvailable) {
      try {
        window.localStorage.setItem(key, value);
      } catch (e) {
        // QuotaExceededError! Evict non-essential items from localStorage
        this.purgeQuotaExceeded();
        try {
          window.localStorage.setItem(key, value);
        } catch (retryErr) {
          // If still failing, memoryStorage and IndexedDB have it safely
        }
      }
    }
  }

  removeItem(key: string): void {
    this.memoryStorage.delete(key);
    if (this.isAvailable) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {}
    }
    this.removeItemAsync(key).catch(() => {});
  }

  clear(): void {
    this.memoryStorage.clear();
    if (this.isAvailable) {
      try {
        window.localStorage.clear();
      } catch (e) {}
    }
  }

  keys(): string[] {
    const keySet = new Set<string>();
    if (this.isAvailable) {
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k) keySet.add(k);
        }
      } catch (e) {}
    }
    for (const k of this.memoryStorage.keys()) {
      keySet.add(k);
    }
    return Array.from(keySet);
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
      // Memory storage already updated
    }
  }

  async getItemAsync(key: string): Promise<string | null> {
    if (this.memoryStorage.has(key)) {
      return this.memoryStorage.get(key) || null;
    }
    try {
      const db = await this.initDB();
      return new Promise((resolve) => {
        const tx = db.transaction('cache', 'readonly');
        const store = tx.objectStore('cache');
        const req = store.get(key);
        req.onsuccess = () => {
           if (req.result !== undefined) {
             const val = typeof req.result === 'string' ? req.result : JSON.stringify(req.result);
             this.memoryStorage.set(key, val);
             resolve(val);
           } else {
             resolve(this.getItem(key));
           }
        };
        req.onerror = () => resolve(this.getItem(key));
      });
    } catch(e) {
      return this.getItem(key);
    }
  }

  async removeItemAsync(key: string): Promise<void> {
    this.memoryStorage.delete(key);
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
      // Ignored
    }
  }
}

export const safeStorage = new SafeStorage();

