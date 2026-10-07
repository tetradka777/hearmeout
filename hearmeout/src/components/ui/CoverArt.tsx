'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

type Props = {
  url?: string;
  fallbackLetter: string;
  className?: string;
  style?: CSSProperties;
  fallbackStyle?: CSSProperties;
  children?: ReactNode;
  onClick?: () => void;
};

// Mirrors the prototype's attachImageFallback(): probe the image, and if it
// 404s/errors, fall back to the gradient + first-letter treatment instead.
export function CoverArt({ url, fallbackLetter, className = '', style, fallbackStyle, children, onClick }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!url) return;
    const img = new window.Image();
    img.onerror = () => setFailed(true);
    img.src = url;
  }, [url]);

  const showFallback = !url || failed;
  return (
    <div
      className={`${className} ${showFallback ? 'cover-fallback' : ''}`.trim()}
      style={showFallback ? style : { backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', ...style, backgroundImage: `url('${url}')` }}
      onClick={onClick}
    >
      {showFallback && <span className="fallback-letter" style={fallbackStyle}>{fallbackLetter}</span>}
      {children}
    </div>
  );
}
