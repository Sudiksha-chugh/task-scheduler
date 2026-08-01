import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Zap } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { projectService } from '../services/projectService';
import { jobService } from '../services/jobService';

export function JobEditor() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [projectId, setProjectId] = useState('');
  const [name, setName] = useState('');
  const [targetUrl, setTargetUrl] = useState('https://httpbin.org/post');
  const [httpMethod, setHttpMethod] = useState('POST');
  const [scheduleType, setScheduleType] = useState('MANUAL');
  const [cronExpression, setCronExpression] = useState('*/5 * * * *');
  const [retryStrategy, setRetryStrategy] = useState('EXPONENTIAL_BACKOFF');
  const [retryMaxAttempts, setRetryMaxAttempts] = useState(3);
  const [headersJson, setHeadersJson] = useState('{\n  "Content-Type": "application/json"\n}');
  const [bodyJson, setBodyJson] = useState('{\n  "event": "triggered_job"\n}');
  const [error, setError] = useState('');

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: projectService.getProjects,
  });

  const { data: existingJob } = useQuery({
    queryKey: ['job', id],
    queryFn: () => jobService.getJobById(id),
    enabled: isEdit,
  });

  useEffect(() => {
    if (projectsData?.projects?.length > 0 && !projectId) {
      setProjectId(projectsData.projects[0]._id);
    }
  }, [projectsData, projectId]);

  useEffect(() => {
    if (existingJob) {
      setName(existingJob.name || '');
      setTargetUrl(existingJob.targetUrl || '');
      setHttpMethod(existingJob.httpMethod || 'POST');
      setScheduleType(existingJob.scheduleType || 'MANUAL');
      setCronExpression(existingJob.cronExpression || '*/5 * * * *');
      setRetryStrategy(existingJob.retryStrategy || 'EXPONENTIAL_BACKOFF');
      setRetryMaxAttempts(existingJob.retryMaxAttempts || 3);
      if (existingJob.headers) setHeadersJson(JSON.stringify(existingJob.headers, null, 2));
      if (existingJob.body) setBodyJson(JSON.stringify(existingJob.body, null, 2));
      if (existingJob.project) setProjectId(existingJob.project._id || existingJob.project);
    }
  }, [existingJob]);

  const saveMutation = useMutation({
    mutationFn: async (jobPayload) => {
      if (isEdit) {
        return jobService.updateJob(id, jobPayload);
      }
      return jobService.createJob(projectId, jobPayload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      navigate('/jobs');
    },
    onError: (err) => {
      setError(err.response?.data?.error?.message || 'Failed to save job definition');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    let parsedHeaders = {};
    let parsedBody = null;

    try {
      if (headersJson.trim()) parsedHeaders = JSON.parse(headersJson);
    } catch {
      setError('Invalid JSON in Headers configuration');
      return;
    }

    try {
      if (bodyJson.trim()) parsedBody = JSON.parse(bodyJson);
    } catch {
      setError('Invalid JSON in Payload Body configuration');
      return;
    }

    const payload = {
      name,
      targetUrl,
      httpMethod,
      scheduleType,
      cronExpression: scheduleType === 'CRON' ? cronExpression : undefined,
      retryStrategy,
      retryMaxAttempts: Number(retryMaxAttempts),
      headers: parsedHeaders,
      body: parsedBody,
    };

    saveMutation.mutate(payload);
  };

  const projectsList = projectsData?.projects || [];

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" icon={ArrowLeft} onClick={() => navigate('/jobs')}>
          Back to Jobs
        </Button>
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            {isEdit ? 'Edit Job Definition' : 'Configure New Job'}
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">Configure target URL, HTTP headers, payload, and retry policy.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Job Specification</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Project Workspace
                </label>
                <select
                  disabled={isEdit}
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  {projectsList.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} ({p.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Job Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sync Webhook Service"
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  HTTP Method
                </label>
                <select
                  value={httpMethod}
                  onChange={(e) => setHttpMethod(e.target.value)}
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm font-mono text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Target URL
                </label>
                <input
                  type="url"
                  required
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://api.domain.com/webhook"
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Schedule Type
                </label>
                <select
                  value={scheduleType}
                  onChange={(e) => setScheduleType(e.target.value)}
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="MANUAL">Manual / On-Demand</option>
                  <option value="CRON">CRON Expression</option>
                  <option value="ONE_SHOT">One Shot</option>
                </select>
              </div>

              {scheduleType === 'CRON' && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                    Cron Expression
                  </label>
                  <input
                    type="text"
                    required
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    placeholder="*/5 * * * *"
                    className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm font-mono text-purple-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Retry Strategy
                </label>
                <select
                  value={retryStrategy}
                  onChange={(e) => setRetryStrategy(e.target.value)}
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="EXPONENTIAL_BACKOFF">Exponential Backoff</option>
                  <option value="LINEAR">Linear Backoff</option>
                  <option value="FIXED">Fixed Interval</option>
                  <option value="NONE">No Retries</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Max Retries
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={retryMaxAttempts}
                  onChange={(e) => setRetryMaxAttempts(e.target.value)}
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                HTTP Headers (JSON)
              </label>
              <textarea
                rows={3}
                value={headersJson}
                onChange={(e) => setHeadersJson(e.target.value)}
                className="w-full rounded-xl bg-zinc-900 border border-zinc-800 p-4 text-xs font-mono text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Payload Body (JSON)
              </label>
              <textarea
                rows={4}
                value={bodyJson}
                onChange={(e) => setBodyJson(e.target.value)}
                className="w-full rounded-xl bg-zinc-900 border border-zinc-800 p-4 text-xs font-mono text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
              <Button type="button" variant="outline" onClick={() => navigate('/jobs')}>
                Cancel
              </Button>
              <Button type="submit" icon={Save} loading={saveMutation.isPending}>
                Save Job Definition
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
