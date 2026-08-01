import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Zap, Plus, Play, Clock, Edit2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { jobService } from '../services/jobService';

export function Jobs() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId');

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['jobs', projectId],
    queryFn: () => jobService.getJobs(projectId),
  });

  const triggerMutation = useMutation({
    mutationFn: ({ projectId: pId, jobId }) => jobService.triggerJob(pId, jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recent-executions'] });
      alert('Job triggered successfully! Check Executions tab for progress.');
    },
    onError: (err) => {
      alert(`Trigger failed: ${err.response?.data?.error?.message || err.message}`);
    },
  });

  const jobsList = data?.jobs || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Job Definitions</h1>
          <p className="text-sm text-zinc-400 mt-1">Configured cron schedules, one-shot tasks, and manual dispatch targets.</p>
        </div>
        <Button icon={Plus} onClick={() => navigate('/jobs/new')}>
          Create Job Definition
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Configured Jobs ({jobsList.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-8 text-center text-zinc-500 animate-pulse">Loading jobs...</div>
          ) : jobsList.length === 0 ? (
            <div className="p-12 text-center text-zinc-500">
              <Zap className="w-10 h-10 mx-auto mb-2 stroke-1 text-zinc-600" />
              <p className="text-sm font-medium">No job definitions configured yet.</p>
              <Button size="sm" className="mt-4" onClick={() => navigate('/jobs/new')}>
                Add First Job
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800 pb-2">
                  <tr>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Method & Target URL</th>
                    <th className="py-3 px-4">Schedule</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {jobsList.map((job) => (
                    <tr key={job._id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-4 px-4 font-semibold text-zinc-100">{job.name}</td>
                      <td className="py-4 px-4">
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
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-blue-400 font-bold">
                            {job.httpMethod || 'POST'}
                          </span>
                          <span className="font-mono text-zinc-300 truncate max-w-xs">{job.targetUrl}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-zinc-400 font-mono">
                        {job.scheduleType === 'CRON' ? (
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-purple-400" />
                            {job.cronExpression}
                          </div>
                        ) : (
                          'Manual / Event'
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Play}
                            loading={triggerMutation.isPending}
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
