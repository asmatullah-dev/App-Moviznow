import { safeStorage } from './safeStorage';

export const HUBCLOUD_DOMAIN = 'https://hubcloud.ist';
export const DEFAULT_HUBCLOUD_DOMAIN = 'https://hubcloud.ist';
export const HUBDRIVE_DOMAIN = 'https://hubdrive.space';

/**
 * Checks if a hostname or domain belongs to HubCloud (any legacy or active TLD).
 */
export function isHubcloudDomain(hostname: string): boolean {
  if (!hostname) return false;
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return host === 'hubcloud.ist' || /^(?:.*\.)?hubcloud\.[a-z0-9]+$/i.test(host) || /^(?:.*\.)?hubcould\.[a-z0-9]+$/i.test(host);
}

/**
 * Checks if a link is a HubCloud recovery / report / broken redirect link.
 * Recovery links MUST NEVER be added to the library or selected as quality links.
 */
export function isHubcloudRecoveryLink(rawUrl: string): boolean {
  if (!rawUrl) return false;
  const u = rawUrl.toLowerCase();
  return (
    u.includes('/recover/') ||
    u.includes('/recovery/') ||
    u.includes('/recovery') ||
    u.includes('/recover') ||
    u.includes('recovery.php') ||
    u.includes('recover.php') ||
    u.includes('hubcloudreport') ||
    u.includes('gamerxyt.com') ||
    u.includes('sportverse.cc') ||
    u.includes('gadgetscloud') ||
    u.includes('hubcloud.recovery') ||
    /[?&](?:action=)?recover(?:y)?\b/i.test(u) ||
    /\brecovery[-_]?link\b/i.test(u)
  );
}

/**
 * Checks if a link is a valid HubCloud link suitable for the movie library.
 * Direct Pixeldrain URLs, third-party CDN streams, and recovery links are strictly rejected.
 */
export function isHubcloudLibraryLink(rawUrl: string): boolean {
  if (!rawUrl) return false;
  if (isHubcloudRecoveryLink(rawUrl)) return false;
  const u = rawUrl.toLowerCase();
  if (
    u.includes('pixeldrain') ||
    u.includes('pixel.drain') ||
    u.includes('pixeldra.in') ||
    u.includes('workers.dev') ||
    u.includes('fsl') ||
    u.includes('telegram') ||
    u.includes('t.me') ||
    u.includes('gdflix')
  ) {
    return false;
  }
  return (
    u.includes('hubcloud') ||
    u.includes('hubcould') ||
    u.includes('hubdrive') ||
    u.includes('drivehub') ||
    u.includes('vcloud')
  );
}

/**
 * Extracts and normalizes the canonical HubCloud library URL from an item or link check result.
 * Always prefers the HubCloud landing page URL and converts legacy domains to the latest hubcloud.ist.
 * Never returns recovery links or direct Pixeldrain URLs.
 */
export function getHubcloudLibraryUrl(item: { url?: string; finalUrl?: string } | string | null | undefined): string {
  if (!item) return '';
  const url = typeof item === 'string' ? item : item.url || '';
  const finalUrl = typeof item === 'string' ? '' : item.finalUrl || '';

  if (url && isHubcloudLibraryLink(url)) {
    return normalizeHubcloudDomain(url);
  }
  if (finalUrl && isHubcloudLibraryLink(finalUrl)) {
    return normalizeHubcloudDomain(finalUrl);
  }
  return '';
}

/**
 * Automatically converts any old or legacy HubCloud URL (e.g. hubcloud.art, hubcloud.one,
 * hubcloud.foo, hubcould, hubcloud.cx, hubcloud.club, hubcloud.lol, etc.) to the latest
 * hubcloud domain (hubcloud.ist) before sending any request.
 */
export function normalizeHubcloudDomain(rawUrl: string): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  const latestDomain = getHubcloudDomain();
  let targetHost = 'hubcloud.ist';
  try {
    targetHost = new URL(latestDomain).hostname;
  } catch {}

  try {
    const parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if ((host.includes('hubcloud') || host.includes('hubcould')) && host !== targetHost) {
      parsed.hostname = targetHost;
      return parsed.toString();
    }
    return trimmed;
  } catch {
    if (/(?:hubcloud|hubcould)\.[a-z0-9]+/i.test(trimmed)) {
      return trimmed.replace(
        /https?:\/\/(?:www\.)?(?:hubcloud|hubcould)\.[a-z0-9]+/i,
        latestDomain.replace(/\/+$/, '')
      );
    }
    return trimmed;
  }
}

export function getHubcloudDomain(): string {
  const stored = safeStorage.getItem('custom_hubcloud_domain');
  if (stored && stored.trim()) {
    let domain = stored.trim();
    if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
      domain = 'https://' + domain;
    }
    const clean = domain.replace(/\/+$/, '');
    if (
      clean.includes('hubcloud.art') ||
      clean.includes('hubcloud.one') ||
      clean.includes('hubcloud.foo') ||
      clean.includes('hubcould') ||
      clean.includes('hubcloud.cx') ||
      clean.includes('hubcloud.club') ||
      clean.includes('hubcloud.lol') ||
      clean.includes('hubcloud.best') ||
      clean.includes('hubcloud.ink') ||
      clean.includes('hubcloud.top') ||
      clean.includes('hubcloud.icu') ||
      (clean.includes('hubcloud.') && !clean.includes('hubcloud.ist'))
    ) {
      safeStorage.setItem('custom_hubcloud_domain', HUBCLOUD_DOMAIN);
      return HUBCLOUD_DOMAIN;
    }
    return clean;
  }
  return HUBCLOUD_DOMAIN;
}

export function setHubcloudDomain(domain: string): void {
  safeStorage.setItem('custom_hubcloud_domain', domain.trim());
}

export const DEFAULT_MOVIESDRIVE_DOMAIN = 'https://new3.moviesdrive.christmas';
export const DEFAULT_SKYMOVIES_DOMAIN = 'https://new4.skymovieshd.clinic';
export const DEFAULT_FILMYGO_DOMAIN = 'https://filmycab.im';
export const DEFAULT_HDHUB4U_DOMAIN = 'https://new5.hdhub4u.cl';
export const DEFAULT_FILMYFLY_DOMAIN = 'https://filmyfly.army';

export function getMoviesdriveDomain(): string {
  const stored = safeStorage.getItem('custom_moviesdrive_domain');
  if (stored && stored.trim()) {
    let domain = stored.trim();
    if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
      domain = 'https://' + domain;
    }
    const clean = domain.replace(/\/+$/, '');
    if (clean.includes('new6.moviesdrives.my') || clean.includes('moviesdrives.my') || clean.includes('moviesdrives.cfd')) {
      safeStorage.setItem('custom_moviesdrive_domain', DEFAULT_MOVIESDRIVE_DOMAIN);
      return DEFAULT_MOVIESDRIVE_DOMAIN;
    }
    return clean;
  }
  return DEFAULT_MOVIESDRIVE_DOMAIN;
}

export function setMoviesdriveDomain(domain: string): void {
  safeStorage.setItem('custom_moviesdrive_domain', domain.trim());
}

export function getSkymoviesDomain(): string {
  const stored = safeStorage.getItem('custom_skymovies_domain');
  if (stored && stored.trim()) {
    let domain = stored.trim();
    if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
      domain = 'https://' + domain;
    }
    const clean = domain.replace(/\/+$/, '');
    if (clean.includes('skymovieshd.ceo') || clean.includes('new3.skymovieshd.clinic') || clean.includes('new1.skymovieshd') || clean.includes('new2.skymovieshd')) {
      safeStorage.setItem('custom_skymovies_domain', DEFAULT_SKYMOVIES_DOMAIN);
      return DEFAULT_SKYMOVIES_DOMAIN;
    }
    return clean;
  }
  return DEFAULT_SKYMOVIES_DOMAIN;
}

export function setSkymoviesDomain(domain: string): void {
  safeStorage.setItem('custom_skymovies_domain', domain.trim());
}

export function getFilmygoDomain(): string {
  const stored = safeStorage.getItem('custom_filmygo_domain');
  if (stored && stored.trim()) {
    let domain = stored.trim();
    if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
      domain = 'https://' + domain;
    }
    const clean = domain.replace(/\/+$/, '');
    if (clean.includes('filmygo.online') || clean.includes('filmycab.press')) {
      safeStorage.setItem('custom_filmygo_domain', DEFAULT_FILMYGO_DOMAIN);
      return DEFAULT_FILMYGO_DOMAIN;
    }
    return clean;
  }
  return DEFAULT_FILMYGO_DOMAIN;
}

export function setFilmygoDomain(domain: string): void {
  safeStorage.setItem('custom_filmygo_domain', domain.trim());
}

export function getHdhub4uDomain(): string {
  const stored = safeStorage.getItem('custom_hdhub4u_domain');
  if (stored && stored.trim()) {
    let domain = stored.trim();
    if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
      domain = 'https://' + domain;
    }
    return domain.replace(/\/+$/, '');
  }
  return DEFAULT_HDHUB4U_DOMAIN;
}

export function setHdhub4uDomain(domain: string): void {
  safeStorage.setItem('custom_hdhub4u_domain', domain.trim());
}

export function getFilmyflyDomain(): string {
  const stored = safeStorage.getItem('custom_filmyfly_domain');
  if (stored && stored.trim()) {
    let domain = stored.trim();
    if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
      domain = 'https://' + domain;
    }
    const clean = domain.replace(/\/+$/, '');
    if (
      clean.includes('filmyfly.green') ||
      clean.includes('filmyfly.vin') ||
      clean.includes('filmyfly.sale') ||
      clean.includes('filmyfly.bingo') ||
      clean.includes('filmyfly.trade') ||
      clean.includes('filmyfly.reisen')
    ) {
      safeStorage.setItem('custom_filmyfly_domain', DEFAULT_FILMYFLY_DOMAIN);
      return DEFAULT_FILMYFLY_DOMAIN;
    }
    return clean;
  }
  return DEFAULT_FILMYFLY_DOMAIN;
}

export function setFilmyflyDomain(domain: string): void {
  safeStorage.setItem('custom_filmyfly_domain', domain.trim());
}

/**
 * Streaming API base domain: defaults to relative "" so all player and stream
 * requests route reliably on the same origin (moviznow.com) through active server rewrites.
 * Automatically clears any stale api.moviznow.com overrides from storage to prevent network errors.
 */
export function getStreamingApiBase(): string {
  if (typeof window !== 'undefined') {
    try {
      const stored = safeStorage.getItem('custom_stream_api_url') || localStorage.getItem('custom_stream_api_url');
      if (stored && (stored.includes('api.moviznow.com') || stored.includes('api-moviznow'))) {
        safeStorage.removeItem('custom_stream_api_url');
        localStorage.removeItem('custom_stream_api_url');
      } else if (stored && typeof stored === 'string' && stored.trim().startsWith('http')) {
        return stored.trim().replace(/\/+$/, '');
      }
    } catch {}
  }
  const envUrl = (import.meta.env.VITE_STREAM_API_URL || import.meta.env.VITE_API_URL || '') as string;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() && !envUrl.includes('api.moviznow.com')) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return '';
}

