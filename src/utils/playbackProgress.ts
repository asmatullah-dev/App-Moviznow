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

export const PREFERRED_QUALITY_KEY = 'moviznow_preferred_quality';
export const PREVIOUS_QUALITY_KEY = 'moviznow_previous_quality';
export const PREFERRED_SPEED_KEY = 'moviznow_playback_speed';

/**
 * Get unified preferred quality across nativePlayer and PlayerFU.
 * Defaults to '720p' if none is stored or if set to auto.
 */
export function getPreferredQuality(): string {
  try {
    const raw = (
      safeStorage.getItem(PREFERRED_QUALITY_KEY) ||
      localStorage.getItem(PREFERRED_QUALITY_KEY) ||
      safeStorage.getItem(PREVIOUS_QUALITY_KEY) ||
      localStorage.getItem(PREVIOUS_QUALITY_KEY) ||
      ''
    ).trim().toLowerCase();

    if (raw && !raw.startsWith('auto')) {
      const match = raw.match(/(\d{3,4}p?)/i);
      if (match) {
        const val = match[1].toLowerCase();
        return val.endsWith('p') ? val : `${val}p`;
      }
      return raw;
    }
  } catch {
    // Storage fallback
  }
  return '720p';
}

/**
 * Set unified preferred quality across both players and local storages.
 */
export function setPreferredQuality(quality: string): void {
  if (!quality || typeof quality !== 'string') return;
  const clean = quality.trim().toLowerCase();
  if (!clean || clean.startsWith('auto')) return;
  const match = clean.match(/(\d{3,4}p?)/i);
  const normalized = match
    ? (match[1].toLowerCase().endsWith('p') ? match[1].toLowerCase() : `${match[1].toLowerCase()}p`)
    : clean;

  try {
    safeStorage.setItem(PREFERRED_QUALITY_KEY, normalized);
    localStorage.setItem(PREFERRED_QUALITY_KEY, normalized);
    safeStorage.setItem(PREVIOUS_QUALITY_KEY, normalized);
    localStorage.setItem(PREVIOUS_QUALITY_KEY, normalized);
  } catch {
    // Storage fallback
  }
}

/**
 * Get unified playback speed preference (0.25x - 4x).
 */
export function getPreferredPlaybackSpeed(): number {
  try {
    const raw =
      safeStorage.getItem(PREFERRED_SPEED_KEY) ||
      localStorage.getItem(PREFERRED_SPEED_KEY) ||
      '1';
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed >= 0.25 && parsed <= 4) {
      return parsed;
    }
  } catch {
    // Storage fallback
  }
  return 1;
}

/**
 * Set unified playback speed preference across both players.
 */
export function setPreferredPlaybackSpeed(speed: number): void {
  if (typeof speed !== 'number' || isNaN(speed) || speed < 0.25 || speed > 4) return;
  try {
    safeStorage.setItem(PREFERRED_SPEED_KEY, String(speed));
    localStorage.setItem(PREFERRED_SPEED_KEY, String(speed));
  } catch {
    // Storage fallback
  }
}

/**
 * Select the optimal link based on the user's preferred quality (e.g. 480p, 720p, 1080p).
 */
export function findBestQualityLink<T extends { url: string; name?: string; label?: string }>(
  links: T[],
  preferredQuality?: string
): T | null {
  if (!Array.isArray(links) || links.length === 0) return null;
  const pref = (preferredQuality || getPreferredQuality()).trim().toLowerCase();
  const targetH = parseInt(pref.replace(/[^0-9]/g, ''), 10) || 720;

  const parseHeight = (item: T): number => {
    const str = `${item.name || ''} ${item.label || ''} ${item.url || ''}`.toLowerCase();
    const m = str.match(/\b(480|720|1080|2160|4k)\b/);
    if (m) {
      if (m[1] === '4k' || m[1] === '2160') return 2160;
      return parseInt(m[1], 10);
    }
    return 0;
  };

  // 1. Direct exact height match
  const exact = links.find((l) => parseHeight(l) === targetH);
  if (exact) return exact;

  // 2. Highest lower height
  const parsedWithHeights = links.map((l) => ({ link: l, height: parseHeight(l) }));
  const lower = parsedWithHeights.filter((p) => p.height > 0 && p.height < targetH);
  if (lower.length > 0) {
    lower.sort((a, b) => b.height - a.height);
    return lower[0].link;
  }

  // 3. Lowest higher height
  const higher = parsedWithHeights.filter((p) => p.height > targetH);
  if (higher.length > 0) {
    higher.sort((a, b) => a.height - b.height);
    return higher[0].link;
  }

  return links[0];
}

