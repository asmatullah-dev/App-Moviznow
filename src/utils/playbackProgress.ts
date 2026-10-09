import { safeStorage } from './safeStorage';

/**
 * Computes a unified playback progress key:
 * - For movies: `moviznow_progress_${cleanContentId}`
 * - For series with season & episode: `moviznow_progress_${cleanContentId}_s${season}_e${episode}`
 * - For series full season: `moviznow_progress_${cleanContentId}_s${season}`
 *
 * This guarantees that 480p, 720p, 1080p, PlayerFU, and nativePlayer all share
 * and update the exact same progress duration seamlessly.
 */
export function getPlaybackProgressKey(
  contentId?: string,
  season?: number | string | null,
  episode?: number | string | null
): string {
  if (!contentId) return 'moviznow_progress_default';

  // Clean any extraneous suffixes (e.g., appended link IDs like "_link_123" or "_hc_xyz")
  let cleanId = String(contentId).trim();
  if (cleanId.includes('_link_')) {
    cleanId = cleanId.split('_link_')[0];
  }

  const sNum =
    season !== undefined && season !== null && season !== ''
      ? Number(season)
      : null;
  const eNum =
    episode !== undefined && episode !== null && episode !== ''
      ? Number(episode)
      : null;

  if (sNum !== null && !isNaN(sNum) && eNum !== null && !isNaN(eNum)) {
    return `moviznow_progress_${cleanId}_s${sNum}_e${eNum}`;
  }
  if (sNum !== null && !isNaN(sNum)) {
    return `moviznow_progress_${cleanId}_s${sNum}`;
  }
  return `moviznow_progress_${cleanId}`;
}

/**
 * Read saved playback progress in seconds from storage.
 */
export function getSavedProgress(key: string): number {
  if (!key) return 0;
  try {
    const val = safeStorage.getItem(key) || localStorage.getItem(key);
    if (val) {
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed > 3) return Math.floor(parsed);
    }
  } catch {
    // Storage access fallback
  }
  return 0;
}

/**
 * Save playback progress in seconds to both safeStorage and localStorage.
 */
export function saveProgress(key: string, seconds: number): void {
  if (!key || seconds <= 0) return;
  const rounded = Math.floor(seconds);
  try {
    safeStorage.setItem(key, String(rounded));
    localStorage.setItem(key, String(rounded));
  } catch {
    // Storage quota fallback
  }
}

/**
 * Extracts a concise, standard quality label (e.g. "480P", "720P", "1080P", "4K")
 * from link name, resolution string, or URL.
 */
export function extractQualityLabel(name?: string): string {
  if (!name || typeof name !== 'string') return 'HD';
  const trimmed = name.trim();
  const match = trimmed.match(
    /\b(480p|720p\s*hevc|720p|1080p\s*hevc|1080p|2160p|4k|hevc)\b/i
  );
  if (match) return match[0].toUpperCase();

  const lower = trimmed.toLowerCase();
  if (lower.includes('480')) return '480P';
  if (lower.includes('720')) return '720P';
  if (lower.includes('1080')) return '1080P';
  if (lower.includes('2160') || lower.includes('4k')) return '4K';
  if (lower.includes('hevc')) return 'HEVC';

  return trimmed.length > 12 ? `${trimmed.slice(0, 10)}...` : trimmed;
}
