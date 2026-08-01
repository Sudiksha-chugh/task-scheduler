import React from 'react';
import { Card } from './Card';

const glowColors = {
  blue: 'hover:shadow-blue-500/10 border-blue-500/20',
  emerald: 'hover:shadow-emerald-500/10 border-emerald-500/20',
  amber: 'hover:shadow-amber-500/10 border-amber-500/20',
  purple: 'hover:shadow-purple-500/10 border-purple-500/20',
  rose: 'hover:shadow-rose-500/10 border-rose-500/20',
};

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = 'blue',
  className = '',
}) {
  return (
    <Card hover className={`relative overflow-hidden transition-all duration-300 ${glowColors[color] || ''} ${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</p>
          <h3 className="mt-2 text-3xl font-extrabold text-zinc-100 tracking-tight">{value}</h3>
          {subtitle && <p className="mt-1 text-xs text-zinc-400">{subtitle}</p>}
        </div>

        {Icon && (
          <div className="rounded-xl bg-zinc-800/80 p-3 border border-zinc-700/40 text-blue-400">
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      {trend && (
        <div className="mt-4 flex items-center gap-1 text-xs font-medium">
          <span className={trend.positive ? 'text-emerald-400' : 'text-rose-400'}>
            {trend.positive ? '↑' : '↓'} {trend.label}
          </span>
        </div>
      )}
    </Card>
  );
}
