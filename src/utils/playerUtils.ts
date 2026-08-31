/**
 * Video Player Launch & Stream Utilities
 * Handles iOS (iPhone/iPad), Android, and Desktop deep-linking for VLC, MX Player, and system video players.
 */

export interface PlayerLaunchOptions {
  player: 'vlc' | 'mx' | 'generic' | 'browser' | 'download';
  url: string;
  title?: string;
}

/**
 * Detects if the current client is running on iOS (iPhone, iPad, iPod) or iPadOS.
 */
export function isIOS(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  const isStandardIOS = /iPad|iPhone|iPod/i.test(ua);
  const isIPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  return isStandardIOS || isIPadOS;
}

/**
 * Detects if the current client is running on Android.
 */
export function isAndroid(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

/**
 * Converts any streaming or file link into a direct raw media stream endpoint.
 * Handles Pixeldrain, Google Drive, and other direct download/stream transformations.
 */
export function normalizeDirectStreamUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  // Pixeldrain raw stream normalization: transform /u/ viewer links to /api/file/
  url = url.replace(
    /(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/u\//i,
    'pixeldrain.dev/api/file/'
  );
  url = url.replace(
    /(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/api\/file\//i,
    'pixeldrain.dev/api/file/'
  );

  if (url.includes('pixeldrain.dev/api/file/')) {
    try {
      const urlObj = new URL(url);
      urlObj.search = ''; // Remove query params for clean direct stream
      url = urlObj.toString();
    } catch (e) {}
  }

  return url;
}

/**
 * Converts viewer URLs for standard in-browser viewing (e.g. Pixeldrain /u/ page).
 */
export function normalizeBrowserViewUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  url = url.replace(
    /(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/api\/file\//i,
    'pixeldrain.dev/u/'
  );
  url = url.replace(
    /(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/u\//i,
    'pixeldrain.dev/u/'
  );

  if (url.includes('pixeldrain.dev/u/')) {
    try {
      const urlObj = new URL(url);
      urlObj.search = '';
      url = urlObj.toString();
    } catch (e) {}
  }

  return url;
}

/**
 * Opens the video URL in the selected external media player based on user OS/platform.
 */
export function playInExternalPlayer({ player, url, title }: PlayerLaunchOptions): { success: boolean; schemeUrl?: string } {
  const directVideoUrl = normalizeDirectStreamUrl(url);
  const encodedTitle = encodeURIComponent(title || 'Video Stream');
  const onIOS = isIOS();
  const onAndroid = isAndroid();

  try {
    const urlObj = new URL(directVideoUrl);
    const scheme = urlObj.protocol.replace(':', '');
    const hostAndPath = urlObj.host + urlObj.pathname + urlObj.search + urlObj.hash;

    // 1. VLC Player Launch Logic
    if (player === 'vlc') {
      if (onIOS) {
        // iOS VLC custom x-callback-url & scheme support
        // Scheme 1: vlc-x-callback://x-callback-url/stream?url=<ENCODED_URL>
        // Scheme 2: vlc://<URL>
        const vlcIosUrl = `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(directVideoUrl)}`;
        
        // Trigger via location & hidden anchor click for maximum iOS WebKit compatibility
        tryOpenUriWithFallback(vlcIosUrl, `vlc://${directVideoUrl}`);
        return { success: true, schemeUrl: vlcIosUrl };
      } else if (onAndroid) {
        // Android Intent for VLC Player
        const intentUrl = `intent://${hostAndPath}#Intent;scheme=${scheme};package=org.videolan.vlc;type=video/*;S.title=${encodedTitle};end`;
        window.location.href = intentUrl;
        return { success: true, schemeUrl: intentUrl };
      } else {
        // Desktop / Mac / Windows VLC URI handler
        const desktopVlcUrl = `vlc://${directVideoUrl}`;
        tryOpenUriWithFallback(desktopVlcUrl, directVideoUrl);
        return { success: true, schemeUrl: desktopVlcUrl };
      }
    }

    // 2. MX Player Launch Logic
    if (player === 'mx') {
      if (onIOS) {
        // iOS MX Player deep link schemes
        // mxplayer://play?url=<ENCODED_URL> or mxplayer://<URL> or mx://<URL>
        const mxIosUrl = `mxplayer://play?url=${encodeURIComponent(directVideoUrl)}`;
        tryOpenUriWithFallback(mxIosUrl, `mxplayer://${directVideoUrl}`);
        return { success: true, schemeUrl: mxIosUrl };
      } else if (onAndroid) {
        // Android Intent for MX Player
        const intentUrl = `intent://${hostAndPath}#Intent;scheme=${scheme};package=com.mxtech.videoplayer.ad;type=video/*;S.title=${encodedTitle};end`;
        window.location.href = intentUrl;
        return { success: true, schemeUrl: intentUrl };
      } else {
        // Desktop / Generic MX fallback
        openInNewTab(directVideoUrl);
        return { success: true };
      }
    }

    // 3. Generic "Play in Video Player"
    if (player === 'generic') {
      if (onIOS) {
        // On iOS, generic tries VLC first if available, otherwise direct stream in native iOS player
        const vlcIosUrl = `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(directVideoUrl)}`;
        tryOpenUriWithFallback(vlcIosUrl, directVideoUrl);
        return { success: true, schemeUrl: vlcIosUrl };
      } else if (onAndroid) {
        const intentUrl = `intent://${hostAndPath}#Intent;scheme=${scheme};action=android.intent.action.VIEW;type=video/*;end`;
        window.location.href = intentUrl;
        return { success: true, schemeUrl: intentUrl };
      } else {
        openInNewTab(directVideoUrl);
        return { success: true };
      }
    }

    // 4. In-Browser / Web Player
    if (player === 'browser') {
      const browserUrl = normalizeBrowserViewUrl(url);
      if (onAndroid) {
        const bUrlObj = new URL(browserUrl);
        const bScheme = bUrlObj.protocol.replace(':', '');
        const bHostAndPath = bUrlObj.host + bUrlObj.pathname + bUrlObj.search + bUrlObj.hash;
        const intentUrl = `intent://${bHostAndPath}#Intent;scheme=${bScheme};action=android.intent.action.VIEW;end`;
        window.location.href = intentUrl;
        return { success: true, schemeUrl: intentUrl };
      }
      openInNewTab(browserUrl);
      return { success: true };
    }

  } catch (e) {
    console.error('External player launcher failed:', e);
    openInNewTab(directVideoUrl);
    return { success: false };
  }

  return { success: false };
}

/**
 * Safely triggers custom scheme with DOM anchor invocation and fallback.
 */
function tryOpenUriWithFallback(primaryUri: string, fallbackUri?: string) {
  try {
    const a = document.createElement('a');
    a.href = primaryUri;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch (e) {}
    }, 1000);
  } catch (e) {
    window.location.href = primaryUri;
  }

  if (fallbackUri && fallbackUri !== primaryUri) {
    // If primary uri doesn't redirect after 1.5 seconds, we can try fallback
    setTimeout(() => {
      // Check document visibility - if user is still on page, app may not be installed
      if (!document.hidden) {
        try {
          const fallbackLink = document.createElement('a');
          fallbackLink.href = fallbackUri;
          fallbackLink.style.display = 'none';
          document.body.appendChild(fallbackLink);
          fallbackLink.click();
          setTimeout(() => {
            try {
              document.body.removeChild(fallbackLink);
            } catch (e) {}
          }, 1000);
        } catch (e) {}
      }
    }, 1500);
  }
}

/**
 * Opens a URL in a new clean window / tab with no-referrer headers.
 */
export function openInNewTab(url: string) {
  try {
    const html = `<!DOCTYPE html><html><head><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=${url}"></head><body><script>window.location.replace("${url}");</script></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch (e) {}
    }, 1000);
  } catch (e) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
