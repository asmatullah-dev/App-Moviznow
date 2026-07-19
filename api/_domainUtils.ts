export const HUBCLOUD_DOMAIN = 'https://hubcloud.cx';
export const HUBDRIVE_DOMAIN = 'https://hubdrive.space';

export function normalizeDomain(url: string): string {
    // Just return the original URL since we want to allow any working domain
    // (e.g. filmygo, mdrive, new hubcloud variants) instead of forcing
    // it to hubcloud.cx or hubdrive.space.
    return url;
}
