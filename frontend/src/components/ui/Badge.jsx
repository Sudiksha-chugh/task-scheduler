import React from 'react';

const badgeVariants = {
  blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  red: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  gray: 'bg-zinc-800 text-zinc-400 border-zinc-700/50',
};

export function Badge({ children, variant = 'gray', className = '', ...props }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
        badgeVariants[variant] || badgeVariants.gray
      } ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
