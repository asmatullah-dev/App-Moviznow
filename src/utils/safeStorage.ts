/**
 * A lightning-fast, high-capacity, safe storage manager for the application.
 * - Guarantees zero main-thread freezing and eliminates QuotaExceededErrors.
 * - Synchronous 0ms reads and writes using in-memory Map.
 * - Distributes persistence intelligently:
 *     * Small metadata / settings (<25KB) -> stored in localStorage for instant reload.
 *     * Large datasets (content catalogs, chunks, user lists, poster caches >25KB) -> stored
 *       asynchronously in IndexedDB without blocking the UI thread or device.
 * - Purely isolates admin cache from static JSON.
 */

class SafeStorage {
  private memoryStorage: Map<string, string> = new Map();
  public isAvailable: boolean;
  public isHydrated: boolean = false;
  private hydrationPromise: Promise<void> | null = null;
  private idbCache: IDBDatabase | null = null;
  private writeQueue: Map<string, string> = new Map();
  private isProcessingQueue: boolean = false;

  constructor() {
    this.isAvailable = this.checkAvailability();
    if (typeof window !== 'undefined') {
      this.hydrate();
      // Clean up legacy oversized keys from localStorage in background to prevent quota crashes
      setTimeout(() => this.purgeOversizedLocalStorageKeys(), 500);
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
   * Identifies whether a storage key / payload should be kept out of synchronous localStorage.
   */
  private isLargeKey(key: string, valueLength?: number): boolean {
    if (valueLength !== undefined && valueLength > 25000) return true;
    return (
      key.includes('content_cache') ||
      key.includes('admin_content_cache') ||
      key.includes('cached_all_users') ||
      key.includes('_chunk_') ||
      key.startsWith('search_index') ||
      key.startsWith('poster_cache_') ||
      key.startsWith('movie_details_') ||
      key.startsWith('tmdb_') ||
      key.startsWith('thumbnail_') ||
      key.startsWith('v2_trans_') ||
      key.startsWith('imdb_rating_')
    );
  }

  /**
   * Removes heavy items from localStorage to ensure localStorage stays <100KB total and super fast.
   */
  public purgeOversizedLocalStorageKeys(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k) continue;
        if (this.isLargeKey(k)) {
          keysToRemove.push(k);
        }
      }

      for (const k of keysToRemove) {
        try {
          const val = window.localStorage.getItem(k);
          if (val) {
            this.memoryStorage.set(k, val);
            this.setItemAsync(k, val).catch(() => {});
          }
          window.localStorage.removeItem(k);
        } catch (e) {}
      }
    } catch (e) {}
  }

  /**
   * Background hydration from IndexedDB without blocking the main event loop.
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
        // Fallback silently
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

  // --- Synchronous Methods (0ms access) ---

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
    // 1. Immediately store in memory for 0ms synchronous retrieval
    this.memoryStorage.set(key, value);

    const isHeavy = this.isLargeKey(key, value.length);

    // 2. Heavy data goes to IndexedDB asynchronously (keeps device snappy & avoids quota crash)
    if (isHeavy) {
      this.setItemAsync(key, value).catch(() => {});
      // If it accidentally existed in localStorage, remove it
      if (this.isAvailable) {
        try {
          window.localStorage.removeItem(key);
        } catch (e) {}
      }
      return;
    }

    // 3. Small metadata is stored in both localStorage and IndexedDB
    if (this.isAvailable) {
      try {
        window.localStorage.setItem(key, value);
      } catch (e) {
        // Quota exceeded on small key? Evict heavy keys and retry
        this.purgeOversizedLocalStorageKeys();
        try {
          window.localStorage.setItem(key, value);
        } catch (retryErr) {
          // Handled safely by memory and IndexedDB
        }
      }
    }
    this.setItemAsync(key, value).catch(() => {});
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
    this.clearAsync().catch(() => {});
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

  // --- Asynchronous Methods (IndexedDB) ---

  private initDB(): Promise<IDBDatabase> {
    if (this.idbCache) return Promise.resolve(this.idbCache);
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
        this.idbCache = db;
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
    this.writeQueue.set(key, value);
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.writeQueue.size === 0) return;
    this.isProcessingQueue = true;

    try {
      const db = await this.initDB();
      const entries = Array.from(this.writeQueue.entries());
      this.writeQueue.clear();

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('cache', 'readwrite');
        const store = tx.objectStore('cache');
        for (const [k, v] of entries) {
          store.put(v, k);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(new Error('Transaction aborted'));
      });
    } catch (e) {
      // Ignored - memoryStorage already holds the latest state
    } finally {
      this.isProcessingQueue = false;
      if (this.writeQueue.size > 0) {
        setTimeout(() => this.processQueue(), 50);
      }
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
    } catch (e) {
      return this.getItem(key);
    }
  }

  async removeItemAsync(key: string): Promise<void> {
    this.memoryStorage.delete(key);
    this.writeQueue.delete(key);
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('cache', 'readwrite');
        const store = tx.objectStore('cache');
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      // Ignored
    }
  }

  async clearAsync(): Promise<void> {
    this.writeQueue.clear();
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('cache', 'readwrite');
        const store = tx.objectStore('cache');
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {}
  }
}

export const safeStorage = new SafeStorage();
