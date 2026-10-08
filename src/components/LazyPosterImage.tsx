import React, { useState } from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { getOptimizedImageUrl, getImageSrcSet } from '../utils/imageUtils';

export interface LazyPosterImageProps {
  src?: string;
  fallbackSrc?: string;
  alt?: string;
  targetWidth?: number;
  containerClassName?: string;
  className?: string;
}

export const LazyPosterImage: React.FC<LazyPosterImageProps> = ({
  src,
  fallbackSrc = '/launcher.svg',
  alt = '',
  targetWidth = 342,
  containerClassName = 'w-full h-full',
  className = 'w-full h-full object-cover',
}) => {
  const [hasError, setHasError] = useState(false);

  const rawUrl = hasError || !src ? fallbackSrc : src;
  const optimizedUrl = getOptimizedImageUrl(rawUrl, targetWidth);
  const srcSet = !hasError && src ? getImageSrcSet(src) : undefined;

  return (
    <div className={`relative overflow-hidden ${containerClassName}`}>
      <LazyLoadImage
        src={optimizedUrl || fallbackSrc}
        srcSet={srcSet}
        alt={alt}
        effect="blur"
        wrapperClassName="w-full h-full block"
        className={className}
        onError={() => setHasError(true)}
      />
    </div>
  );
};

export default LazyPosterImage;
