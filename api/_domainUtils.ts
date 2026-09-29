export const HUBCLOUD_DOMAIN = 'https://hubcloud.ist';
export const HUBDRIVE_DOMAIN = 'https://hubdrive.space';

export function normalizeDomain(url: string): string {
    if (!url) return "";
    let trimmed = url.trim();
    try {
        const urlObj = new URL(trimmed);
        const host = urlObj.hostname.toLowerCase();
        if (/hubcloud\.(?:one|foo|club|lol|best|ink|top|icu|biz|pro|link|click|cx)/i.test(host) || host.includes("hubcould")) {
            urlObj.hostname = "hubcloud.ist";
        }
        if (host.includes("hubcloud") || host.includes("hubcould") || host.includes("hubdrive") || urlObj.hostname.includes("hubcloud")) {
            urlObj.hash = "";
            return urlObj.toString().replace(/\/$/, "");
        }
    } catch (e) {
        // Fallback for non-standard links or parsing issues
        if (/https?:\/\/(?:www\.)?(?:hubcloud\.(?:one|foo|club|lol|best|ink|top|icu|biz|pro|link|click|cx)|hubcould\.\w+)/i.test(trimmed)) {
            trimmed = trimmed.replace(/https?:\/\/(?:www\.)?(?:hubcloud\.(?:one|foo|club|lol|best|ink|top|icu|biz|pro|link|click|cx)|hubcould\.\w+)/i, "https://hubcloud.ist");
        }
        if (trimmed.includes("hubcloud") || trimmed.includes("hubcould") || trimmed.includes("hubdrive")) {
            const hashIdx = trimmed.indexOf("#");
            if (hashIdx !== -1) {
                trimmed = trimmed.substring(0, hashIdx);
            }
            trimmed = trimmed.replace(/\/$/, "");
            return trimmed;
        }
    }
    return trimmed;
}

