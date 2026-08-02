import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Play,
  Clock,
  Edit2,
  Filter,
  Search,
  CheckCircle2,
  XCircle,
  Folder,
  RefreshCw,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Pagination } from '../components/ui/Pagination';
import { SortableHeader } from '../components/ui/SortableHeader';
import { jobService } from '../services/jobService';
import { projectService } from '../services/projectService';

export function Jobs() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [projectId, setProjectId] = useState(searchParams.get('projectId') || '');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState(null);

  // Fetch Projects for filter dropdown
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: projectService.getProjects,
  });

  // Fetch Jobs via TanStack Query with pagination and sorting params
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['jobs', projectId, page, limit, sortBy, sortOrder],
    queryFn: () =>
      jobService.getJobs(projectId || undefined, {
        page,
        limit,
        sortBy,
        sortOrder,
      }),
  });

  // Trigger Job Mutation
  const triggerMutation = useMutation({
    mutationFn: ({ projectId: pId, jobId }) => jobService.triggerJob(pId, jobId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['executions'] });
      queryClient.invalidateQueries({ queryKey: ['recent-executions'] });
      setNotification({
        type: 'success',
        message: `Job triggered successfully! Execution ID: ${res?.execution?._id || 'queued'}`,
      });
      setTimeout(() => setNotification(null), 4000);
    },
    onError: (err) => {
      setNotification({
        type: 'error',
        message: `Trigger failed: ${err.response?.data?.error?.message || err.message}`,
      });
      setTimeout(() => setNotification(null), 5000);
    },
  });

  const projectsList = projectsData?.projects || [];
  const rawJobsList = data?.jobs || [];
  const pagination = data?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };

  // Filter jobs by search query on current page
  const filteredJobs = rawJobsList.filter((job) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      job.name?.toLowerCase().includes(q) ||
      job.targetUrl?.toLowerCase().includes(q) ||
      job.httpMethod?.toLowerCase().includes(q) ||
      job.project?.name?.toLowerCase().includes(q)
    );
  });

  const handleSort = (columnKey) => {
    if (sortBy === columnKey) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnKey);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const handleProjectChange = (e) => {
    const val = e.target.value;
    setProjectId(val);
    setPage(1);
    if (val) {
      setSearchParams({ projectId: val });
    } else {
      setSearchParams({});
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Job Definitions</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Sortable and paginated registry of job targets, cron schedules, and retry policies.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => refetch()} loading={isFetching}>
            Refresh
          </Button>
          <Button
            icon={Plus}
            onClick={() => navigate(projectId ? `/jobs/new?projectId=${projectId}` : '/jobs/new')}
          >
            Create Job Definition
          </Button>
        </div>
      </div>

      {/* Notification Toast Banner */}
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

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search jobs by name, method, URL..."
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 pl-9 pr-4 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-400 font-medium">
            <Filter className="w-3.5 h-3.5 text-zinc-500" />
            <span>Project:</span>
          </div>
          <select
            value={projectId}
            onChange={handleProjectChange}
            className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            <option value="">All Projects</option>
            {projectsList.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-blue-400" />
            Registered Jobs ({pagination.total || 0})
          </CardTitle>
          <span className="text-xs text-zinc-400 font-mono">
            Showing Page {pagination.page} of {pagination.totalPages}
          </span>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-12 text-center text-zinc-500 animate-pulse font-mono text-sm">
              Loading job definitions from API...
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="p-12 text-center text-zinc-500">
              <p className="text-sm font-medium">No job definitions found.</p>
              <p className="text-xs text-zinc-600 mt-1">
                {searchQuery || projectId
                  ? 'Try clearing your filters or search query.'
                  : 'Click "Create Job Definition" to get started.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-900/90 border-b border-zinc-800">
                  <tr>
                    <SortableHeader
                      label="Job Name"
                      column="name"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Method & Target URL"
                      column="httpMethod"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Schedule"
                      column="scheduleType"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <th className="py-3 px-4">Status</th>
                    <SortableHeader
                      label="Created At"
                      column="createdAt"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredJobs.map((job) => {
                    const isTriggering =
                      triggerMutation.isPending &&
                      triggerMutation.variables?.jobId === job._id;

                    return (
                      <tr key={job._id} className="hover:bg-zinc-800/30 transition-colors">
                        {/* Job Name & Project */}
                        <td className="py-3.5 px-4">
                          <div>
                            <span className="font-semibold text-zinc-100 hover:text-blue-400 cursor-pointer" onClick={() => navigate(`/jobs/${job._id}/edit`)}>
                              {job.name}
                            </span>
                            {job.project?.name && (
                              <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                                Project: {job.project.name}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* HTTP Method & Target URL */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-blue-400 font-bold border border-zinc-700/50">
                              {job.httpMethod || 'POST'}
                            </span>
                            <span className="font-mono text-zinc-300 truncate max-w-xs" title={job.targetUrl}>
                              {job.targetUrl}
                            </span>
                          </div>
                        </td>

                        {/* Schedule Type */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                job.scheduleType === 'CRON'
                                  ? 'purple'
                                  : job.scheduleType === 'ONE_SHOT'
                                  ? 'amber'
                                  : 'blue'
                              }
                            >
                              {job.scheduleType}
                            </Badge>
                            {job.scheduleType === 'CRON' && job.cronExpression && (
                              <span className="flex items-center gap-1 font-mono text-xs text-purple-400">
                                <Clock className="w-3 h-3" />
                                {job.cronExpression}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status / Enabled */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              job.enabled !== false
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                job.enabled !== false ? 'bg-emerald-400' : 'bg-zinc-500'
                              }`}
                            />
                            {job.enabled !== false ? 'ACTIVE' : 'DISABLED'}
                          </span>
                        </td>

                        {/* Created At */}
                        <td className="py-3.5 px-4 text-zinc-400 font-mono text-[11px]">
                          {job.createdAt ? new Date(job.createdAt).toLocaleString() : '—'}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={Play}
                              loading={isTriggering}
                              disabled={job.enabled === false}
                              onClick={() =>
                                triggerMutation.mutate({
                                  projectId: job.project?._id || job.project,
                                  jobId: job._id,
                                })
                              }
                            >
                              Trigger Now
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={Edit2}
                              onClick={() => navigate(`/jobs/${job._id}/edit`)}
                            />
                          </div>
                        </td>
                      </tr>
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

export default Jobs;
