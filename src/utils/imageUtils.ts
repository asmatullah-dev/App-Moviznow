/**
 * Utility functions to dynamically optimize and provide responsive images
 * (TMDB, Unsplash, Picsum, Cloudinary) based on screen resolution and card sizes.
 */

export function getOptimizedImageUrl(url?: string, targetWidth: number = 342): string {
  if (!url || typeof url !== 'string') return '';

  const trimmedUrl = url.trim();

  // 1. TMDB Image Optimization
  if (trimmedUrl.includes('image.tmdb.org')) {
    let sizePath = 'w342';
    if (targetWidth <= 154) {
      sizePath = 'w154';
    } else if (targetWidth <= 200) {
      sizePath = 'w185';
    } else if (targetWidth <= 400) {
      sizePath = 'w342';
    } else if (targetWidth <= 600) {
      sizePath = 'w500';
    } else if (targetWidth <= 900) {
      sizePath = 'w780';
    } else {
      sizePath = 'w1280';
    }

    return trimmedUrl.replace(/\/t\/p\/(w\d+|original)\//, `/t/p/${sizePath}/`);
  }

  // 2. Unsplash Optimization
  if (trimmedUrl.includes('images.unsplash.com')) {
    try {
      const parsed = new URL(trimmedUrl);
      parsed.searchParams.set('w', targetWidth.toString());
      parsed.searchParams.set('q', '80');
      parsed.searchParams.set('auto', 'format');
      return parsed.toString();
    } catch {
      return trimmedUrl;
    }
  }

  // 3. Picsum Optimization
  if (trimmedUrl.includes('picsum.photos')) {
    // Replace width/height in picsum URLs like /seed/xyz/400/600 -> /seed/xyz/200/300
    const targetHeight = Math.round(targetWidth * 1.5);
    return trimmedUrl.replace(/\/\d+\/\d+$/, `/${targetWidth}/${targetHeight}`);
  }

  return trimmedUrl;
}

export function getImageSrcSet(url?: string): string | undefined {
  if (!url || typeof url !== 'string') return undefined;

  const trimmedUrl = url.trim();

  if (trimmedUrl.includes('image.tmdb.org')) {
    const w185 = getOptimizedImageUrl(trimmedUrl, 185);
    const w342 = getOptimizedImageUrl(trimmedUrl, 342);
    const w500 = getOptimizedImageUrl(trimmedUrl, 500);

    return `${w185} 185w, ${w342} 342w, ${w500} 500w`;
  }

  if (trimmedUrl.includes('images.unsplash.com')) {
    const w200 = getOptimizedImageUrl(trimmedUrl, 200);
    const w400 = getOptimizedImageUrl(trimmedUrl, 400);
    const w600 = getOptimizedImageUrl(trimmedUrl, 600);

    return `${w200} 200w, ${w400} 400w, ${w600} 600w`;
  }

  return undefined;
}
