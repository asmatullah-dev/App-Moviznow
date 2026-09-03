export const HUBCLOUD_DOMAIN = 'https://hubcloud.cx';
export const HUBDRIVE_DOMAIN = 'https://hubdrive.space';

export function normalizeDomain(url: string): string {
    if (!url) return "";
    let trimmed = url.trim();
    try {
        const urlObj = new URL(trimmed);
        const host = urlObj.hostname.toLowerCase();
        if (host.includes("hubcloud") || host.includes("vcloud") || host.includes("hubdrive")) {
            const eVal = urlObj.searchParams.get("e");
            urlObj.search = eVal ? `?e=${eVal}` : "";
            urlObj.hash = "";
            return urlObj.toString().replace(/\/$/, "");
        }
    } catch (e) {
        // Fallback for non-standard links or parsing issues
        if (trimmed.includes("hubcloud") || trimmed.includes("vcloud") || trimmed.includes("hubdrive")) {
            const eMatch = trimmed.match(/[?&]e=([^&#\s]+)/);
            const queryIdx = trimmed.indexOf("?");
            if (queryIdx !== -1) {
                trimmed = trimmed.substring(0, queryIdx);
            }
            const hashIdx = trimmed.indexOf("#");
            if (hashIdx !== -1) {
                trimmed = trimmed.substring(0, hashIdx);
            }
            trimmed = trimmed.replace(/\/$/, "");
            if (eMatch) {
                trimmed += `?e=${eMatch[1]}`;
            }
            return trimmed;
        }
    }
    return trimmed;
}

