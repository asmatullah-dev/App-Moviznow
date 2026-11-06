/**
 * YouTube Trailer Downloader Utility
 * 
 * Provides clean, fast download options for YouTube trailers
 * without consuming any server bandwidth, Fast Origin data transfer,
 * or Cloud Run quotas (0 bytes server transfer).
 * 
 * Focuses strictly on ad-free, captcha-free services (such as Cobalt)
 * and direct native downloads when sample video files are available.
 */

export interface DownloadOption {
  id: string;
  label: string;
  badge: string;
  description: string;
  type: 'direct' | 'clean' | 'service';
  url: string;
  isDirectDownload?: boolean;
  copyUrlOnOpen?: boolean;
}

/**
 * Extracts the 11-character YouTube video ID from various URL formats.
 */
export function extractYouTubeVideoId(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();
  // Standard 11-char ID pattern
  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube-nocookie\.com\/embed\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i;
  const match = trimmed.match(regExp);

  if (match && match[1] && match[1].length === 11) {
    return match[1];
  }

  // Fallback: If passed a bare 11-character ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Returns clean, verified download options avoiding ad-filled, captcha-laden services.
 */
export function getTrailerDownloadOptions(videoId: string, sampleUrl?: string): DownloadOption[] {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const options: DownloadOption[] = [];

  // 1. Direct Sample/Teaser Video if available in content metadata (0 server bandwidth, 0 ads, instant download)
  if (sampleUrl && sampleUrl.trim()) {
    options.push({
      id: 'direct-sample',
      label: 'Direct Sample / Clip',
      badge: 'Instant MP4',
      description: 'Direct file download without any external sites',
      type: 'direct',
      url: sampleUrl,
      isDirectDownload: true,
    });
  }

  // 2. Cobalt Tools - The premier ad-free, captcha-free, open-source media downloader
  options.push({
    id: 'cobalt-clean',
    label: 'Cobalt (No Ads & No Captcha)',
    badge: 'Recommended',
    description: 'Ad-free, captcha-free 1080p/720p/MP3 downloader',
    type: 'clean',
    url: 'https://cobalt.tools',
    copyUrlOnOpen: true,
  });

  // 3. SSYouTube - The direct 1-click URL shortcut
  options.push({
    id: 'ssyoutube',
    label: 'SSYouTube (1-Click Shortcut)',
    badge: 'Fast',
    description: 'Instant redirect portal with 1080p, 720p, 360p & MP3',
    type: 'service',
    url: `https://ssyoutube.com/watch?v=${videoId}`,
  });

  return options;
}

/**
 * Returns direct YouTube watch URL for video.
 */
export function getYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
