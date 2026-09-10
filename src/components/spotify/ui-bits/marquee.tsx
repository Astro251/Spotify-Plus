'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Spotify-style auto-scrolling text for long titles: when the text overflows
 * its container it ping-pongs side-to-side (with edge fades); short text
 * stays plain. Pauses on hover; restarts whenever the text changes.
 */
export function Marquee({
  text,
  className,
  durationPerChar = 0.22,
}: {
  text: string;
  className?: string;
  /** Seconds per character of scroll speed (clamped 5–18s total). */
  durationPerChar?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState<{ overflow: boolean; shift: number }>({ overflow: false, shift: 0 });

  // (re)measure whenever the text or viewport changes
  useEffect(() => {
    const measure = () => {
      const c = containerRef.current;
      const i = innerRef.current;
      if (!c || !i) return;
      const overflowPx = i.scrollWidth - c.clientWidth;
      setStyle({ overflow: overflowPx > 1, shift: overflowPx > 1 ? -overflowPx : 0 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, [text]);

  const duration = Math.min(18, Math.max(5, text.length * durationPerChar));

  return (
    <div
      ref={containerRef}
      className={cn('relative min-w-0 overflow-hidden', style.overflow && 'marquee-fade', className)}
      aria-label={text}
    >
      <span
        ref={innerRef}
        className={cn('inline-block whitespace-nowrap will-change-transform', style.overflow && 'marquee-scroll')}
        style={
          style.overflow
            ? { animationDuration: `${duration}s`, ['--marquee-shift' as string]: `${style.shift}px` }
            : undefined
        }
      >
        {text}
      </span>
    </div>
  );
}
