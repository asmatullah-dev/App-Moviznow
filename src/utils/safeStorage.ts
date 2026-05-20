/**
 * A safe wrapper for localStorage that handles cases where access is denied
 * (e.g., in iframes with third-party cookie blocking enabled).
 * Falls back to in-memory storage if localStorage is unavailable.
 * Also provides an async wrapper for IndexedDB to store larger amounts of data (e.g. >15MB).
 */

class SafeStorage {
  private memoryStorage: Map<string, string> = new Map();
  private isAvailable: boolean;

  constructor() {
    this.isAvailable = this.checkAvailability();
  }

  private checkAvailability(): boolean {
    try {
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      console.warn('LocalStorage is not available. Falling back to in-memory storage.', e);
      return false;
    }
  }

  // --- Synchronous methods (5MB limit usually) ---

  getItem(key: string): string | null {
    if (this.isAvailable) {
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        return this.memoryStorage.get(key) || null;
      }
    }
    return this.memoryStorage.get(key) || null;
  }

  setItem(key: string, value: string): void {
    if (this.isAvailable) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch (e) {
        // Fall through to memory storage
      }
    }
    this.memoryStorage.set(key, value);
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

  // --- Asynchronous methods (IndexedDB, unlimited size basically) ---
  
  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        return reject(new Error('IndexedDB is not supported in this environment'));
      }
      try {
        const request = indexedDB.open('moviznow_cache_db', 1);
        request.onerror = () => reject(request.error || new Error('Failed to open database'));
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (e: any) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('cache')) {
            db.createObjectStore('cache');
          }
        };
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
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
