import React, { useState } from 'react';
import { Film } from 'lucide-react';

interface PostPosterProps {
  image?: string;
  title: string;
  compact?: boolean;
}

export const PostPoster: React.FC<PostPosterProps> = ({ image, title, compact }) => {
  const [imgError, setImgError] = useState(false);

  const isDummy = !image || imgError || /arw\.gif|logo|favicon|icon|\.gif$/i.test(image);

  if (compact) {
    if (isDummy) {
      return (
        <div className="w-7 h-9 bg-zinc-200 dark:bg-zinc-800 rounded flex items-center justify-center border border-zinc-300 dark:border-zinc-700 shrink-0">
          <Film className="w-3.5 h-3.5 text-zinc-400" />
        </div>
      );
    }
    return (
      <img
        src={image}
        alt={title}
        onError={() => setImgError(true)}
        className="w-7 h-9 object-cover rounded shrink-0 border border-zinc-200 dark:border-zinc-800 bg-zinc-800 shadow-xs"
      />
    );
  }

  if (isDummy) {
    return (
      <div className="w-10 h-14 bg-zinc-200 dark:bg-zinc-800 rounded-lg shrink-0 flex items-center justify-center border border-zinc-300 dark:border-zinc-700">
        <Film className="w-5 h-5 text-zinc-400" />
      </div>
    );
  }

  return (
    <img
      src={image}
      alt={title}
      onError={() => setImgError(true)}
      className="w-10 h-14 object-cover rounded-lg shrink-0 border border-zinc-200 dark:border-zinc-800 bg-zinc-800 shadow-sm"
    />
  );
};
