import React from 'react';
import { Clock, Play, CheckCircle2, AlertTriangle, XCircle, ShieldAlert } from 'lucide-react';

const statusConfig = {
  PENDING: {
    label: 'PENDING',
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    icon: Clock,
  },
  LEASED: {
    label: 'LEASED',
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    icon: ShieldAlert,
  },
  RUNNING: {
    label: 'RUNNING',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse',
    icon: Play,
  },
  SUCCESS: {
    label: 'SUCCESS',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    icon: CheckCircle2,
  },
  FAILED: {
    label: 'FAILED',
    color: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    icon: AlertTriangle,
  },
  DEAD: {
    label: 'DEAD',
    color: 'bg-red-950/40 text-red-400 border-red-800/40',
    icon: XCircle,
  },
};

export function StatusBadge({ status = 'PENDING', className = '' }) {
  const config = statusConfig[String(status).toUpperCase()] || {
    label: status,
    color: 'bg-zinc-800 text-zinc-400 border-zinc-700',
    icon: Clock,
  };

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.color} ${className}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}
