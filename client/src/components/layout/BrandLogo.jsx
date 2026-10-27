import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Aura Stays Brand Icon
 * A bespoke architectural archway framing a warm dawn horizon and sanctuary doorway.
 * Symbolizes boutique sanctuaries, welcoming archways, and natural morning tranquility.
 * Handcrafted to feel organic, warm, and authentic — moving completely away from generic AI sparkle stars.
 */
export function BrandIcon({ size = 'md', className = '' }) {
  const sizeMap = {
    xs: 'h-7 w-7 rounded-lg',
    sm: 'h-9 w-9 rounded-xl',
    md: 'h-11 w-11 rounded-2xl',
    lg: 'h-14 w-14 rounded-2xl',
    xl: 'h-16 w-16 rounded-3xl',
  };

  const containerClass = sizeMap[size] || sizeMap.md;

  return (
    <div
      className={`relative flex items-center justify-center bg-gradient-to-br from-[#0c534c] via-[#0f766e] to-[#0a423d] text-white shadow-soft transition-all duration-300 group-hover:shadow-md shrink-0 ${containerClass} ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-3/5 w-3/5 text-white drop-shadow-sm transition-transform duration-300 group-hover:scale-105"
      >
        <defs>
          <linearGradient id="auraSunGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>

        {/* Outer Architectural Boutique Archway */}
        <path
          d="M11 31V18C11 13.0294 15.0294 9 20 9C24.9706 9 29 13.0294 29 18V31"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Inner Sanctuary Doorway */}
        <path
          d="M15.5 31V21C15.5 18.5147 17.5147 16.5 20 16.5C22.4853 16.5 24.5 18.5147 24.5 21V31"
          stroke="#99F6E4"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.85"
        />

        {/* Grounding Horizon Baseline */}
        <path
          d="M8 31H32"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        {/* Warm Rising Sun (Natural Aura at Dawn) */}
        <circle cx="20" cy="16.5" r="3.2" fill="url(#auraSunGlow)" />

        {/* Subtle Apex Crown Accent */}
        <path
          d="M20 7V5"
          stroke="#F59E0B"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/**
 * Aura Stays Brand Logo (Icon + Refined Typography)
 */
export default function BrandLogo({
  size = 'md',
  subtitle = 'Boutique Collection',
  showText = true,
  to = '/',
  className = '',
}) {
  const content = (
    <div className={`flex items-center space-x-3 group ${className}`}>
      <BrandIcon size={size} />
      {showText && (
        <div className="flex flex-col text-left">
          <span className="font-extrabold text-xl tracking-tight text-foreground flex items-center gap-1.5 leading-tight">
            Aura <span className="text-primary font-normal">Stays</span>
          </span>
          {subtitle && (
            <span className="text-[10px] uppercase font-semibold tracking-[0.18em] text-amber-600 dark:text-amber-400 mt-0.5">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="inline-flex focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
      >
        {content}
      </Link>
    );
  }

  return content;
}
