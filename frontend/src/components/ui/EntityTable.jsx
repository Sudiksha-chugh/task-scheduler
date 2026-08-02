import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from './Button';

export function EntityTable({
  columns = [],
  data = [],
  pageSize = 10,
  searchKey = '',
  searchPlaceholder = 'Search records...',
  emptyText = 'No records found.',
  className = '',
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState('');
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' | 'desc'

  // Search Filtering
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase();
    return data.filter((item) => {
      if (searchKey && item[searchKey]) {
        return String(item[searchKey]).toLowerCase().includes(q);
      }
      return Object.values(item).some((val) =>
        String(val || '').toLowerCase().includes(q),
      );
    });
  }, [data, searchQuery, searchKey]);

  // Sorting
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      const comp = String(valA).localeCompare(String(valB), undefined, { numeric: true });
      return sortDirection === 'asc' ? comp : -comp;
    });
  }, [filteredData, sortKey, sortDirection]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else {
        setSortKey('');
        setSortDirection('asc');
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search & Header Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl bg-zinc-900 border border-zinc-800 pl-9 pr-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>

        <div className="text-xs text-zinc-400 font-mono">
          Showing {sortedData.length} total entries
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-900/40">
        <table className="w-full text-left text-xs text-zinc-300">
          <thead className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-900/90 border-b border-zinc-800">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key || col.label}
                  onClick={() => col.sortable && handleSort(col.key)}
                  className={`py-3 px-4 ${
                    col.sortable ? 'cursor-pointer select-none hover:text-zinc-200' : ''
                  } ${col.align === 'right' ? 'text-right' : ''}`}
                >
                  <div
                    className={`inline-flex items-center gap-1.5 ${
                      col.align === 'right' ? 'justify-end w-full' : ''
                    }`}
                  >
                    <span>{col.label}</span>
                    {col.sortable && (
                      <span className="text-zinc-500">
                        {sortKey === col.key ? (
                          sortDirection === 'asc' ? (
                            <ChevronUp className="w-3.5 h-3.5 text-blue-400" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
                          )
                        ) : (
                          <ChevronUp className="w-3.5 h-3.5 opacity-30" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-zinc-500">
                  {emptyText}
                </td>
              </tr>
            ) : (
              paginatedData.map((item, rowIdx) => (
                <tr key={item._id || rowIdx} className="hover:bg-zinc-800/30 transition-colors">
                  {columns.map((col) => (
                    <td
                      key={col.key || col.label}
                      className={`py-3.5 px-4 ${col.align === 'right' ? 'text-right' : ''}`}
                    >
                      {col.render ? col.render(item, rowIdx) : item[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-zinc-400 font-mono">
            Page {currentPage} of {totalPages}
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
