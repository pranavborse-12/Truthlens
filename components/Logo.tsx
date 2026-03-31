import React from 'react';

export const Logo = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg 
    viewBox="0 0 32 32" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
  >
    {/* Outer protective shield / lens boundary */}
    <circle 
      cx="16" 
      cy="16" 
      r="14" 
      stroke="currentColor" 
      strokeWidth="2" 
    />
    
    {/* Inner circle - lens for verification */}
    <circle 
      cx="16" 
      cy="16" 
      r="10" 
      stroke="currentColor" 
      strokeWidth="1.5" 
      opacity="0.5"
    />
    
    {/* Truth checkmark - bold and prominent */}
    <path 
      d="M11 16L14.5 19.5L21 11" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    />
    
    {/* Verification rays - radiating truth/clarity */}
    <g strokeWidth="1.5" opacity="0.6" strokeLinecap="round">
      <line x1="16" y1="2" x2="16" y2="4" stroke="currentColor" />
      <line x1="16" y1="28" x2="16" y2="30" stroke="currentColor" />
      <line x1="2" y1="16" x2="4" y2="16" stroke="currentColor" />
      <line x1="28" y1="16" x2="30" y2="16" stroke="currentColor" />
      <line x1="6" y1="6" x2="7.4" y2="7.4" stroke="currentColor" />
      <line x1="24.6" y1="24.6" x2="26" y2="26" stroke="currentColor" />
      <line x1="26" y1="6" x2="24.6" y2="7.4" stroke="currentColor" />
      <line x1="7.4" y1="24.6" x2="6" y2="26" stroke="currentColor" />
    </g>
  </svg>
);

export const TruthLensBrand = () => (
  <div className="flex items-center gap-3 group cursor-default">
    <div className="relative">
      <div className="absolute inset-0 bg-emerald-500/10 rounded-xl scale-125 blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <Logo className="w-7 h-7 text-emerald-600 relative" />
    </div>
    <span className="font-display text-xl font-bold tracking-tight text-ink">
      Truth<span className="text-muted font-medium">Lens</span>
    </span>
  </div>
);
