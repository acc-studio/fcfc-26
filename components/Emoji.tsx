'use client';
import { clsx } from 'clsx';

// The "shaking face" (U+1FAEA, Unicode 15) ships in almost no emoji fonts yet
// — on Windows it renders as a tofu box. We special-case just that one glyph
// with a bundled SVG (Noto Color Emoji, in public/emoji); every other emoji
// renders natively through the OS font exactly as before.
export const DISTORTED_FACE = String.fromCodePoint(0x1faea);
export const DISTORTED_FACE_SRC = '/emoji/distorted-face.svg';

export function isDistortedFace(emoji: string): boolean {
  return emoji === DISTORTED_FACE;
}

export function Emoji({ emoji, className }: { emoji: string; className?: string }) {
  if (!emoji) return null;
  if (isDistortedFace(emoji)) {
    return (
      <img
        src={DISTORTED_FACE_SRC}
        alt={emoji}
        draggable={false}
        className={clsx('inline-block w-[1em] h-[1em] align-[-0.125em]', className)}
      />
    );
  }
  return <span className={className}>{emoji}</span>;
}
