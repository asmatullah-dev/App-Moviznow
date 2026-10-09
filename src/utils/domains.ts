import { safeStorage } from './safeStorage';

export const HUBCLOUD_DOMAIN = 'https://hubcloud.ist';
export const HUBDRIVE_DOMAIN = 'https://hubdrive.space';

export function getHubcloudDomain(): string {
  const stored = safeStorage.getItem('custom_hubcloud_domain');
  if (stored && stored.trim()) {
    let domain = stored.trim();
    if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
      domain = 'https://' + domain;
    }
    const clean = domain.replace(/\/+$/, '');
    if (clean.includes('hubcloud.one') || clean.includes('hubcloud.foo') || clean.includes('hubcould') || clean.includes('hubcloud.cx')) {
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
export const DEFAULT_SKYMOVIES_DOMAIN = 'https://skymovieshd.meme';
export const DEFAULT_FILMYGO_DOMAIN = 'https://filmycab.press';
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
    if (clean.includes('skymovieshd.ceo')) {
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
    if (clean.includes('filmygo.online')) {
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
 * Streaming API base domain: routes requests to https://api.moviznow.com
 * when running on moviznow.com (or uses VITE_STREAM_API_URL if configured).
 * Automatic fallbacks in PlayerFU and nativePlayer ensure playback works even if DNS is propagating.
 */
export function getStreamingApiBase(): string {
  const envUrl = (import.meta.env.VITE_STREAM_API_URL || import.meta.env.VITE_API_URL || '') as string;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    const custom = safeStorage.getItem('custom_stream_api_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
    const host = window.location.hostname.toLowerCase();
    if (host.includes('moviznow.com') && host !== 'api.moviznow.com') {
      return 'https://api.moviznow.com';
    }
  }
  return '';
}

