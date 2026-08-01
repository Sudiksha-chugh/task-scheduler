import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, RefreshCw, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { executionService } from '../services/executionService';

export function Executions() {
  const [selectedStatus, setSelectedStatus] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['executions', selectedStatus],
    queryFn: () => executionService.getExecutions({ status: selectedStatus || undefined }),
    refetchInterval: 3000,
  });

  const retryMutation = useMutation({
    mutationFn: (id) => executionService.retryExecution(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executions'] });
      alert('Execution retry queued successfully!');
    },
    onError: (err) => {
      alert(`Retry failed: ${err.response?.data?.error?.message || err.message}`);
    },
  });

  const executionsList = data?.executions || [];

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Job Executions Explorer</h1>
          <p className="text-sm text-zinc-400 mt-1">Audit log of dispatches, attempt metrics, and fencing token leases.</p>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
          {['', 'PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'DEAD'].map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selectedStatus === st
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {st || 'ALL STATUS'}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Execution Log ({executionsList.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-8 text-center text-zinc-500 animate-pulse">Loading executions...</div>
          ) : executionsList.length === 0 ? (
            <div className="p-12 text-center text-zinc-500">
              <Activity className="w-10 h-10 mx-auto mb-2 stroke-1 text-zinc-600" />
              <p className="text-sm font-medium">No execution records found for selected filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800 pb-2">
                  <tr>
                    <th className="py-3 px-4 w-10"></th>
                    <th className="py-3 px-4">Execution ID</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Fencing Token</th>
                    <th className="py-3 px-4">Retry Count</th>
                    <th className="py-3 px-4">Attempts</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {executionsList.map((exec) => {
                    const isExpanded = expandedId === exec._id;
                    const canRetry = exec.status === 'FAILED' || exec.status === 'DEAD';

                    return (
                      <React.Fragment key={exec._id}>
                        <tr
                          className="hover:bg-zinc-800/30 transition-colors cursor-pointer"
                          onClick={() => toggleExpand(exec._id)}
                        >
                          <td className="py-3.5 px-4 text-zinc-500">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-zinc-100 font-semibold">{exec._id}</td>
                          <td className="py-3.5 px-4">
                            <StatusBadge status={exec.status} />
                          </td>
                          <td className="py-3.5 px-4 font-mono text-zinc-400">
                            {exec.fencingToken ? `#${exec.fencingToken}` : '—'}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-zinc-400">{exec.retryCount || 0}</td>
                          <td className="py-3.5 px-4 font-mono text-blue-400 font-semibold">
                            {exec.attempts?.length || 0}
                          </td>
                          <td className="py-3.5 px-4 text-zinc-400">
                            {new Date(exec.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            {canRetry && (
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={RefreshCw}
                                loading={retryMutation.isPending}
                                onClick={() => retryMutation.mutate(exec._id)}
                              >
                                Retry
                              </Button>
                            )}
                          </td>
                        </tr>

                        {/* Expanded Attempts Detail View */}
                        {isExpanded && (
                          <tr className="bg-zinc-900/90 border-b border-zinc-800">
                            <td colSpan={8} className="p-4">
                              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                                <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                                  Attempt History Timeline ({exec.attempts?.length || 0})
                                </h4>

                                {(!exec.attempts || exec.attempts.length === 0) ? (
                                  <p className="text-xs text-zinc-500 italic">No attempts logged yet for this execution.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {exec.attempts.map((att, idx) => (
                                      <div
                                        key={idx}
                                        className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                                      >
                                        <div className="flex items-center gap-3">
                                          <span className="font-mono text-zinc-400 font-bold">#{idx + 1}</span>
                                          <span
                                            className={`px-2 py-0.5 rounded font-mono text-[10px] ${
                                              att.httpStatusCode >= 200 && att.httpStatusCode < 300
                                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                            }`}
                                          >
                                            HTTP {att.httpStatusCode || 'ERR'}
                                          </span>
                                          {att.errorMessage && (
                                            <span className="text-rose-400 font-mono text-xs">{att.errorMessage}</span>
                                          )}
                                        </div>

                                        <div className="text-[11px] text-zinc-500 font-mono">
                                          Started: {new Date(att.startedAt).toLocaleTimeString()} | Finished: {new Date(att.finishedAt).toLocaleTimeString()}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
