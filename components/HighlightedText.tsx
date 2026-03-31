'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SuspiciousSentence {
  text: string;
  reason: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface HighlightedTextProps {
  text: string;
  suspiciousSentences: SuspiciousSentence[];
}

export const HighlightedText: React.FC<HighlightedTextProps> = ({ text, suspiciousSentences }) => {
  if (!suspiciousSentences || suspiciousSentences.length === 0) {
    return <p className="text-base text-zinc-600 leading-relaxed font-serif">{text}</p>;
  }

  const sortedSentences = [...suspiciousSentences].sort((a, b) => b.text.length - a.text.length);

  let parts: (string | React.ReactNode)[] = [text];

  sortedSentences.forEach((sus) => {
    const newParts: (string | React.ReactNode)[] = [];
    parts.forEach((part) => {
      if (typeof part !== 'string') {
        newParts.push(part);
        return;
      }

      const index = part.indexOf(sus.text);
      if (index !== -1) {
        const before = part.substring(0, index);
        const match = part.substring(index, index + sus.text.length);
        const after = part.substring(index + sus.text.length);

        if (before) newParts.push(before);
        
        const highlightColor = 
          sus.severity === 'HIGH' ? 'bg-red-50/50 decoration-red-400/30' :
          sus.severity === 'MEDIUM' ? 'bg-amber-50/50 decoration-amber-400/30' :
          'bg-zinc-50/50 decoration-zinc-300';

        newParts.push(
          <span 
            key={`${sus.text}-${index}`}
            className={`group relative inline decoration-2 underline-offset-4 underline cursor-help transition-all hover:bg-zinc-100/80 ${highlightColor}`}
          >
            {match}
            <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-72 p-5 bg-ink text-white text-xs rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-50 pointer-events-none border border-white/10 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    sus.severity === 'HIGH' ? 'bg-red-400' : 
                    sus.severity === 'MEDIUM' ? 'bg-amber-400' : 'bg-zinc-400'
                  }`} />
                  <span className="font-black uppercase tracking-[0.15em] text-[9px] text-zinc-400">
                    {sus.severity} Risk
                  </span>
                </div>
                <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Indicator</div>
              </div>
              <p className="leading-relaxed font-sans text-zinc-200 font-medium">{sus.reason}</p>
              <div className="absolute top-full left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 w-2.5 h-2.5 bg-ink border-r border-b border-white/10" />
            </span>
          </span>
        );
        
        if (after) newParts.push(after);
      } else {
        newParts.push(part);
      }
    });
    parts = newParts;
  });

  return (
    <div className="text-lg text-zinc-800 leading-relaxed font-serif whitespace-pre-wrap max-w-none">
      {parts}
    </div>
  );
};
