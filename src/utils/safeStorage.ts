/**
 * A safe wrapper for localStorage that handles cases where access is denied
 * (e.g., in iframes with third-party cookie blocking enabled).
 * Falls back to in-memory storage if localStorage is unavailable.
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
}

export const safeStorage = new SafeStorage();
