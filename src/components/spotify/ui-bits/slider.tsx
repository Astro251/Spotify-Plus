'use client';

import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface SliderProps {
  value: number;
  max: number;
  /** live scrub updates */
  onChange?: (v: number) => void;
  /** final commit (pointer up) */
  onCommit?: (v: number) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel: string;
  /** thumb visible only on hover (Spotify style) — default true */
  hideThumbUntilHover?: boolean;
}

/** Custom pointer-based slider used for seek + volume (Spotify styling). */
export function Slider({
  value,
  max,
  onChange,
  onCommit,
  disabled = false,
  className,
  ariaLabel,
  hideThumbUntilHover = true,
}: SliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const ratioFromClientX = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const inner = rect.width - 20; // account for thumb padding (10px each side)
      const x = Math.max(10, Math.min(rect.width - 10, clientX - rect.left));
      return Math.max(0, Math.min(1, (x - 10) / Math.max(1, inner)));
    },
    []
  );

  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || max <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    onChange?.(ratioFromClientX(e.clientX) * max);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || disabled) return;
    onChange?.(ratioFromClientX(e.clientX) * max);
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || disabled) return;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    onCommit?.(ratioFromClientX(e.clientX) * max);
  };

  const showThumb = !hideThumbUntilHover || dragging;

  return (
    <div
      ref={ref}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        const step = max / 40;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          const v = Math.min(max, value + step);
          onChange?.(v);
          onCommit?.(v);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          const v = Math.max(0, value - step);
          onChange?.(v);
          onCommit?.(v);
        }
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={cn(
        'group relative flex h-4 w-full cursor-pointer touch-none select-none items-center px-2.5',
        disabled && 'cursor-default opacity-50',
        className
      )}
    >
      <div className="relative h-1 w-full overflow-visible rounded-full bg-white/25">
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full bg-white transition-colors duration-100',
            !disabled && 'group-hover:bg-spotify',
            dragging && 'bg-spotify'
          )}
          style={{ width: `${pct * 100}%` }}
        />
        <div
          aria-hidden
          className={cn(
            'absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.7)] transition-opacity',
            showThumb ? 'opacity-100' : 'opacity-0'
          )}
          style={{ left: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}
