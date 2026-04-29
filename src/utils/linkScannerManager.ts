import { performFullLinkScan } from './linkScanner';
import { ErrorLinkInfo, Language, Quality } from '../types';

export type ScanStatus = 'idle' | 'scanning' | 'paused' | 'completed' | 'error';

class LinkScannerManager {
  private queue: { info: ErrorLinkInfo, url: string }[] = [];
  public errorLinks: ErrorLinkInfo[] = [];
  public scannedCount: number = 0;
  public totalCount: number = 0;
  public status: ScanStatus = 'idle';
  private concurrency: number = 10;
  private controller: AbortController | null = null;
  private languages: Language[] = [];
  private qualities: Quality[] = [];
  
  private listeners: Set<() => void> = new Set();
  private batchTimeout: any = null;

  constructor() {
    this.loadState();
    
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.saveState();
      });

      // Auto-pause on offline
      window.addEventListener('offline', () => {
        if (this.status === 'scanning') {
          this.pauseScan();
          console.warn("Scanner paused due to offline status");
        }
      });
    }
  }

  public setConfig(languages: Language[], qualities: Quality[]) {
    this.languages = languages;
    this.qualities = qualities;
    
    // Auto-resume if it was interrupted
    if (this.status === 'scanning' && this.queue.length > 0) {
      this.resumeScan();
    }
  }

  private loadState() {
    try {
      const savedQueue = localStorage.getItem('moviznow_scan_queue');
      const savedStatus = localStorage.getItem('moviznow_scan_status') as ScanStatus;
      const savedCount = localStorage.getItem('moviznow_scan_count');
      const savedTotal = localStorage.getItem('moviznow_scan_total');
      const savedErrors = localStorage.getItem('moviznow_error_links');
      
      if (savedQueue) this.queue = JSON.parse(savedQueue);
      if (savedCount) this.scannedCount = parseInt(savedCount, 10);
      if (savedTotal) this.totalCount = parseInt(savedTotal, 10);
      if (savedErrors) this.errorLinks = JSON.parse(savedErrors);
      
      if (savedStatus === 'scanning') {
        this.status = 'scanning';
      } else if (savedStatus === 'paused') {
        this.status = 'paused';
      } else {
        this.status = savedStatus || 'idle';
      }
    } catch (e) {
      console.error("Failed to load scanner state", e);
    }
  }

  private saveState() {
    localStorage.setItem('moviznow_scan_queue', JSON.stringify(this.queue));
    localStorage.setItem('moviznow_scan_status', this.status);
    localStorage.setItem('moviznow_scan_count', this.scannedCount.toString());
    localStorage.setItem('moviznow_scan_total', this.totalCount.toString());
    localStorage.setItem('moviznow_error_links', JSON.stringify(this.errorLinks));
    this.notifyListeners();
  }

  private batchedSaveState() {
    if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => {
        this.saveState();
        this.batchTimeout = null;
      }, 1000);
    }
    this.notifyListeners();
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyTimeout: any = null;
  private notifyListeners() {
    if (this.notifyTimeout) return;
    
    this.notifyTimeout = setTimeout(() => {
      for (const listener of this.listeners) {
        listener();
      }
      this.notifyTimeout = null;
    }, 100); // Batch notifications every 100ms
  }

  public async startScan(linksToScan: { info: ErrorLinkInfo, url: string }[]) {
    if (this.status === 'scanning') return;

    this.queue = [...linksToScan];
    this.totalCount = this.queue.length;
    this.scannedCount = 0;
    this.errorLinks = [];
    this.status = 'scanning';
    this.saveState();

    this.controller = new AbortController();
    this.runWorkers();
  }

  public async resumeScan() {
    if (this.status === 'scanning' || this.queue.length === 0) return;
    this.status = 'scanning';
    this.saveState();
    
    this.controller = new AbortController();
    this.runWorkers();
  }

  public pauseScan() {
    if (this.status !== 'scanning') return;
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
    this.status = 'paused';
    this.saveState();
  }

  public cancelScan() {
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
    this.status = 'idle';
    this.queue = [];
    this.scannedCount = 0;
    this.totalCount = 0;
    this.saveState();
  }

  private categorizeError(detail: string): string {
    const d = detail.toLowerCase();
    if (d.includes('broken') || d.includes('404')) return 'Broken';
    if (d.includes('protected') || d.includes('password')) return 'Protected';
    if (d.includes('redirect')) return 'Redirect';
    if (d.includes('unavailable') || d.includes('503') || d.includes('500')) return 'Unavailable';
    if (d.includes('size mismatch')) return 'Size Mismatch';
    if (d.includes('missing size') || d.includes('missing unit')) return 'Missing Size/Unit';
    if (d.includes('mismatch')) return 'Mismatches';
    if (d.includes('missing filename')) return 'Missing Filename';
    if (d.includes('missing url')) return 'Missing URL';
    if (d.includes('missing quality')) return 'Missing Quality';
    if (d.includes('missing language')) return 'Missing Language';
    return 'Unknown';
  }

  private async runWorkers() {
    if (!this.controller) return;

    const processNext = async () => {
      if (this.queue.length === 0 || !this.controller || this.controller.signal.aborted) return;
      
      // Safety check for online status
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        this.pauseScan();
        return;
      }

      const item = this.queue.shift()!;
      try {
        const res = await performFullLinkScan(
          item.url,
          {},
          this.languages,
          this.qualities,
          this.controller.signal,
          item.info.link?.size,
          item.info.link?.unit
        );

        const isMissingLanguageOnly = res.statusLabel === "MISSING_METADATA" && res.message === "Missing Language in filename";
        if (!isMissingLanguageOnly && (!res.ok || res.statusLabel === "BROKEN" || res.statusLabel === "SIZE_MISMATCH" || res.statusLabel === "MISSING_FILENAME" || res.statusLabel === "MISSING_METADATA" || (res.mismatchWarnings && res.mismatchWarnings.length > 0))) {
          const errorDetail = (res.mismatchWarnings && res.mismatchWarnings.length > 0) ? res.mismatchWarnings.join(', ') : (res.message || res.statusLabel || "Unknown Error");
          const newError: ErrorLinkInfo = {
            ...item.info,
            errorDetail: errorDetail,
            errorCategory: this.categorizeError(errorDetail),
            fetchedSize: res.fileSizeText?.split(' ')[0],
            fetchedUnit: res.fileSizeText?.split(' ')[1] as 'MB' | 'GB',
            createdAt: new Date().toISOString()
          };
          this.errorLinks = [...this.errorLinks, newError];
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        console.error("Scan error for", item.url, e);
      } finally {
        this.scannedCount++;
        this.batchedSaveState();
        await processNext();
      }
    };

    try {
      const workers = Array.from({ length: Math.min(this.concurrency, this.queue.length) }, () => processNext());
      await Promise.all(workers);

      if (this.controller && !this.controller.signal.aborted && this.queue.length === 0) {
        this.status = 'completed';
        this.controller = null;
        this.saveState();
      }
    } catch (e) {
      console.error("Scan failed", e);
      if (this.status !== 'paused') {
          this.status = 'error';
          this.saveState();
      }
    }
  }
}

export const linkScannerManager = new LinkScannerManager();
