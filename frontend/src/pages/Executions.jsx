import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Clock,
  Code,
  Filter,
  Calendar,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Pagination } from '../components/ui/Pagination';
import { executionService } from '../services/executionService';
import { jobService } from '../services/jobService';

export function Executions() {
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [expandedId, setExpandedId] = useState(null);
  const [notification, setNotification] = useState(null);

  const queryClient = useQueryClient();

  // Fetch jobs for Job Filter Select dropdown
  const { data: jobsData } = useQuery({
    queryKey: ['all-jobs-select'],
    queryFn: () => jobService.getJobs(undefined, { limit: 100 }),
  });

  // Fetch Executions with status, jobId, startDate, endDate, page, limit
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['executions', selectedStatus, selectedJobId, startDate, endDate, page, limit],
    queryFn: () =>
      executionService.getExecutions({
        status: selectedStatus || undefined,
        jobId: selectedJobId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit,
      }),
    refetchInterval: 3000,
  });

  // Retry Mutation for FAILED or DEAD executions
  const retryMutation = useMutation({
    mutationFn: (id) => executionService.retryExecution(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['executions'] });
      setNotification({
        type: 'success',
        message: `Execution retry queued successfully! (ID: ${res?.execution?._id || ''})`,
      });
      setTimeout(() => setNotification(null), 4000);
    },
    onError: (err) => {
      setNotification({
        type: 'error',
        message: `Retry failed: ${err.response?.data?.error?.message || err.message}`,
      });
      setTimeout(() => setNotification(null), 5000);
    },
  });

  const jobsList = jobsData?.jobs || [];
  const executionsList = data?.executions || [];
  const pagination = data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const resetFilters = () => {
    setSelectedStatus('');
    setSelectedJobId('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const calcDuration = (startedAt, finishedAt) => {
    if (!startedAt || !finishedAt) return '—';
    const start = new Date(startedAt).getTime();
    const end = new Date(finishedAt).getTime();
    const diff = Math.max(0, end - start);
    if (diff < 1000) return `${diff} ms`;
    return `${(diff / 1000).toFixed(2)} s`;
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Job Executions Explorer</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Real-time audit log of dispatches, attempt timelines, durations, and fencing tokens.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => refetch()} loading={isFetching}>
            Refresh Log
          </Button>
        </div>
      </div>

      {/* Toast Notification Banner */}
      {notification && (
        <div
          className={`p-4 rounded-xl border text-sm font-medium flex items-center justify-between transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-xs opacity-70 hover:opacity-100 font-mono underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Control Bar */}
      <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-4">
        {/* Status Filter Pills */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5 text-blue-400" />
            Filter Status:
          </div>

          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-zinc-950 border border-zinc-800">
            {['', 'PENDING', 'LEASED', 'RUNNING', 'SUCCESS', 'FAILED', 'DEAD'].map((st) => (
              <button
                key={st}
                onClick={() => {
                  setSelectedStatus(st);
                  setPage(1);
                }}
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

        {/* Job & Date Range Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-zinc-800/60">
          {/* Job Filter Dropdown */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Job Target
            </label>
            <select
              value={selectedJobId}
              onChange={(e) => {
                setSelectedJobId(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              <option value="">All Job Definitions</option>
              {jobsList.map((j) => (
                <option key={j._id} value={j._id}>
                  {j.name} ({j.project?.name || 'Job'})
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-zinc-500" /> Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-zinc-500" /> End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          {/* Reset Filters Button */}
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              icon={RotateCcw}
              onClick={resetFilters}
              className="w-full justify-center"
            >
              Reset Filters
            </Button>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            Execution Log ({pagination.total || 0})
          </CardTitle>
          <span className="text-xs text-zinc-400 font-mono">
            Showing Page {pagination.page} of {pagination.totalPages}
          </span>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-12 text-center text-zinc-500 animate-pulse font-mono text-sm">
              Loading execution logs...
            </div>
          ) : executionsList.length === 0 ? (
            <div className="p-12 text-center text-zinc-500">
              <Activity className="w-10 h-10 mx-auto mb-2 stroke-1 text-zinc-600" />
              <p className="text-sm font-medium">No execution records found for selected filter.</p>
              <p className="text-xs text-zinc-600 mt-1">Try resetting your status, job, or date filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-900/90 border-b border-zinc-800">
                  <tr>
                    <th className="py-3 px-4 w-10"></th>
                    <th className="py-3 px-4">Execution ID</th>
                    <th className="py-3 px-4">Job Name</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Fencing Token</th>
                    <th className="py-3 px-4">Retries</th>
                    <th className="py-3 px-4">Attempts</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {executionsList.map((exec) => {
                    const isExpanded = expandedId === exec._id;
                    const canRetry = exec.status === 'FAILED' || exec.status === 'DEAD';
                    const isRetrying =
                      retryMutation.isPending && retryMutation.variables === exec._id;

                    return (
                      <React.Fragment key={exec._id}>
                        <tr
                          className="hover:bg-zinc-800/30 transition-colors cursor-pointer"
                          onClick={() => toggleExpand(exec._id)}
                        >
                          <td className="py-3.5 px-4 text-zinc-500">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-blue-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-zinc-100 font-semibold">{exec._id}</td>
                          <td className="py-3.5 px-4">
                            <div>
                              <span className="font-semibold text-zinc-200">
                                {exec.job?.name || 'Unknown Job'}
                              </span>
                              {exec.job?.project?.name && (
                                <span className="text-[10px] text-zinc-500 block font-mono">
                                  {exec.job.project.name}
                                </span>
                              )}
                            </div>
                          </td>
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
                          <td className="py-3.5 px-4 text-zinc-400 font-mono text-[11px]">
                            {exec.createdAt ? new Date(exec.createdAt).toLocaleString() : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            {canRetry && (
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={RefreshCw}
                                loading={isRetrying}
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
                            <td colSpan={9} className="p-4">
                              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-4">
                                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                                  <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                                    Per-Attempt Timeline ({exec.attempts?.length || 0} Attempts Logged)
                                  </h4>
                                  <span className="text-[11px] font-mono text-zinc-500">
                                    Execution ID: {exec._id}
                                  </span>
                                </div>

                                {!exec.attempts || exec.attempts.length === 0 ? (
                                  <p className="text-xs text-zinc-500 italic p-3">
                                    No attempts logged yet for this execution.
                                  </p>
                                ) : (
                                  <div className="space-y-3">
                                    {exec.attempts.map((att, idx) => {
                                      const isSuccess =
                                        att.httpStatusCode >= 200 && att.httpStatusCode < 300;

                                      return (
                                        <div
                                          key={idx}
                                          className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800/80 space-y-2.5 text-xs"
                                        >
                                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                                            <div className="flex items-center gap-3">
                                              <span className="font-mono text-blue-400 font-bold">
                                                Attempt #{att.attemptNumber || idx + 1}
                                              </span>
                                              <span
                                                className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                                                  isSuccess
                                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                                }`}
                                              >
                                                HTTP {att.httpStatusCode || 'ERR'}
                                              </span>
                                              <span className="text-zinc-400 font-mono text-[11px]">
                                                Duration:{' '}
                                                <strong className="text-zinc-200">
                                                  {calcDuration(att.startedAt, att.finishedAt)}
                                                </strong>
                                              </span>
                                            </div>

                                            <div className="text-[11px] text-zinc-500 font-mono">
                                              {att.startedAt ? new Date(att.startedAt).toLocaleTimeString() : ''}{' '}
                                              →{' '}
                                              {att.finishedAt ? new Date(att.finishedAt).toLocaleTimeString() : ''}
                                            </div>
                                          </div>

                                          {att.errorMessage && (
                                            <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 font-mono text-xs flex items-start gap-2">
                                              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                                              <div>
                                                <span className="font-semibold">Error Message:</span>{' '}
                                                {att.errorMessage}
                                              </div>
                                            </div>
                                          )}

                                          {att.responseBody && (
                                            <div className="space-y-1 pt-1">
                                              <span className="text-[10px] font-semibold uppercase text-zinc-500 flex items-center gap-1">
                                                <Code className="w-3 h-3 text-blue-400" /> Response Body Output
                                              </span>
                                              <pre className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/90 font-mono text-[11px] text-zinc-300 overflow-x-auto max-h-40 leading-relaxed">
                                                {typeof att.responseBody === 'object'
                                                  ? JSON.stringify(att.responseBody, null, 2)
                                                  : String(att.responseBody)}
                                              </pre>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
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

          {/* Pagination Controls */}
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={(newPage) => setPage(newPage)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default Executions;
