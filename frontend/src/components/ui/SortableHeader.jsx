import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export function SortableHeader({ label, column, sortBy, sortOrder, onSort, className = '' }) {
  const active = sortBy === column;
  const Icon = active ? (sortOrder === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th className={`py-3 px-4 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 transition-colors ${
          active ? 'text-blue-400' : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        {label}
        <Icon className="w-3 h-3" />
      </button>
    </th>
  );
}
