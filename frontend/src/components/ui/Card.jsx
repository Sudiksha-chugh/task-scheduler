import React from 'react';

export function Card({ children, className = '', hover = false, ...props }) {
  return (
    <div
      className={`glass-card rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-5 ${
        hover
          ? 'transition-all duration-300 hover:border-zinc-700 hover:shadow-xl hover:shadow-blue-500/5 hover:-translate-y-0.5'
          : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }) {
  return <div className={`flex flex-col gap-1 pb-4 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }) {
  return <h3 className={`text-lg font-semibold text-zinc-100 tracking-tight ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = '' }) {
  return <p className={`text-sm text-zinc-400 ${className}`}>{children}</p>;
}

export function CardContent({ children, className = '' }) {
  return <div className={`pt-1 ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = '' }) {
  return (
    <div className={`flex items-center justify-between pt-4 border-t border-zinc-800/60 mt-4 ${className}`}>
      {children}
    </div>
  );
}
