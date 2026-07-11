export const HUBCLOUD_DOMAIN = 'https://hubcloud.cx';
export const HUBDRIVE_DOMAIN = 'https://hubdrive.space';

export function normalizeDomain(url: string): string {
    if (!url) return url;
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        // Skip normalizing if it's already exactly matching
        const targetHcHost = HUBCLOUD_DOMAIN.replace('https://', '').replace('http://', '');
        const targetHdHost = HUBDRIVE_DOMAIN.replace('https://', '').replace('http://', '');
        
        if (host === targetHcHost || host === targetHdHost) return url;
        
        if (host.includes('hubcould') || host.includes('hubcloud') || host.includes('vcloud') ) {
            u.protocol = HUBCLOUD_DOMAIN.startsWith('https') ? 'https:' : 'http:';
            u.host = targetHcHost;
            return u.toString();
        }
        if (host.includes('hubdrive')) {
            u.protocol = HUBDRIVE_DOMAIN.startsWith('https') ? 'https:' : 'http:';
            u.host = targetHdHost;
            return u.toString();
        }
    } catch (e) {}
    return url;
}
