import { safeStorage } from './safeStorage';

export const HUBCLOUD_DOMAIN = 'https://hubcloud.foo';
export const HUBDRIVE_DOMAIN = 'https://hubdrive.space';

export const DEFAULT_MOVIESDRIVE_DOMAIN = 'https://new6.moviesdrives.my';
export const DEFAULT_SKYMOVIES_DOMAIN = 'https://skymovieshd.ceo';
export const DEFAULT_FILMYGO_DOMAIN = 'https://filmygo.online';

export function getMoviesdriveDomain(): string {
  const stored = safeStorage.getItem('custom_moviesdrive_domain');
  if (stored && stored.trim()) {
    let domain = stored.trim();
    if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
      domain = 'https://' + domain;
    }
    return domain.replace(/\/+$/, '');
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
    return domain.replace(/\/+$/, '');
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
    return domain.replace(/\/+$/, '');
  }
  return DEFAULT_FILMYGO_DOMAIN;
}

export function setFilmygoDomain(domain: string): void {
  safeStorage.setItem('custom_filmygo_domain', domain.trim());
}
