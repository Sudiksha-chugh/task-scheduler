import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Save, Code, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { JsonEditor } from '../components/ui/JsonEditor';
import { projectService } from '../services/projectService';
import { jobService } from '../services/jobService';
import {
  jobFormSchema,
  jobFormDefaults,
  jobToFormValues,
  formValuesToJobPayload,
} from '../schemas/jobSchema';

export function JobEditor() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryParamProjectId = searchParams.get('projectId');
  const queryClient = useQueryClient();

  const [serverError, setServerError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(jobFormSchema),
    defaultValues: jobFormDefaults,
  });

  const watchScheduleType = watch('scheduleType');
  const watchProjectId = watch('projectId');

  // Fetch Projects for project select dropdown
  const { data: projectsData, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: projectService.getProjects,
  });

  // Fetch existing Job if in Edit Mode
  const { data: existingJob, isLoading: isLoadingJob } = useQuery({
    queryKey: ['job', id],
    queryFn: () => jobService.getJobById(id),
    enabled: isEdit,
  });

  const projectsList = projectsData?.projects || [];

  // Set default project ID on form if creating new job
  useEffect(() => {
    if (!isEdit && projectsList.length > 0) {
      if (queryParamProjectId && projectsList.some((p) => p._id === queryParamProjectId)) {
        setValue('projectId', queryParamProjectId);
      } else if (!watchProjectId) {
        setValue('projectId', projectsList[0]._id);
      }
    }
  }, [projectsList, isEdit, queryParamProjectId, watchProjectId, setValue]);

  // Populate form with existing job details when editing
  useEffect(() => {
    if (existingJob) {
      const values = jobToFormValues(existingJob);
      reset(values);
    }
  }, [existingJob, reset]);

  // Save Mutation (Create or Update)
  const saveMutation = useMutation({
    mutationFn: async (values) => {
      const payload = formValuesToJobPayload(values);
      if (isEdit) {
        return jobService.updateJob(id, payload);
      }
      return jobService.createJob(values.projectId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setSuccessMsg(isEdit ? 'Job specification updated successfully!' : 'Job created successfully!');
      setTimeout(() => {
        navigate('/jobs');
      }, 1000);
    },
    onError: (err) => {
      setServerError(err.response?.data?.error?.message || 'Failed to save job definition.');
    },
  });

  const onSubmit = (values) => {
    setServerError('');
    setSuccessMsg('');
    saveMutation.mutate(values);
  };

  if (isEdit && isLoadingJob) {
    return (
      <div className="p-12 text-center text-zinc-400 animate-pulse font-mono">
        Loading job specification details...
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" icon={ArrowLeft} onClick={() => navigate('/jobs')}>
          Back to Jobs
        </Button>
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            {isEdit ? 'Edit Job Specification' : 'Configure New Job Specification'}
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Define HTTP target URL, execution schedule, retry rules, and request body JSON payload.
          </p>
        </div>
      </div>

      {/* Main Form Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="w-5 h-5 text-blue-400" />
            Job Definition Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Server Error Alert */}
            {serverError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            {/* Success Alert */}
            {successMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Project & Job Name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Project Workspace *
                </label>
                <select
                  disabled={isEdit || isLoadingProjects}
                  {...register('projectId')}
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
                >
                  {projectsList.length === 0 ? (
                    <option value="">No projects available</option>
                  ) : (
                    projectsList.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} ({p.slug})
                      </option>
                    ))
                  )}
                </select>
                {errors.projectId && (
                  <p className="mt-1 text-xs text-rose-400">{errors.projectId.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Job Name *
                </label>
                <input
                  type="text"
                  {...register('name')}
                  placeholder="e.g. Sync Webhook Service"
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                {errors.name && <p className="mt-1 text-xs text-rose-400">{errors.name.message}</p>}
              </div>
            </div>

            {/* HTTP Method & Target URL */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  HTTP Method
                </label>
                <select
                  {...register('httpMethod')}
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm font-mono text-blue-400 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                  <option value="PATCH">PATCH</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Target URL *
                </label>
                <input
                  type="url"
                  {...register('targetUrl')}
                  placeholder="https://api.domain.com/webhook"
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                {errors.targetUrl && (
                  <p className="mt-1 text-xs text-rose-400">{errors.targetUrl.message}</p>
                )}
              </div>
            </div>

            {/* Schedule Type, Cron, Retry Strategy & Max Attempts */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Schedule Type
                </label>
                <select
                  {...register('scheduleType')}
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="MANUAL">Manual / On-Demand</option>
                  <option value="CRON">CRON Expression</option>
                  <option value="ONE_SHOT">One Shot</option>
                </select>
              </div>

              {watchScheduleType === 'CRON' ? (
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                    Cron Expression *
                  </label>
                  <input
                    type="text"
                    {...register('cronExpression')}
                    placeholder="*/5 * * * *"
                    className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm font-mono text-purple-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  {errors.cronExpression && (
                    <p className="mt-1 text-xs text-rose-400">{errors.cronExpression.message}</p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                    Timeout (Seconds)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="300"
                    {...register('timeoutSeconds')}
                    className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  {errors.timeoutSeconds && (
                    <p className="mt-1 text-xs text-rose-400">{errors.timeoutSeconds.message}</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Retry Strategy
                </label>
                <select
                  {...register('retryStrategy')}
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
                  {...register('retryMaxAttempts')}
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                {errors.retryMaxAttempts && (
                  <p className="mt-1 text-xs text-rose-400">{errors.retryMaxAttempts.message}</p>
                )}
              </div>
            </div>

            {/* Enabled Switch */}
            <div className="flex items-center gap-3 pt-1">
              <input
                type="checkbox"
                id="enabled"
                {...register('enabled')}
                className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-blue-600 focus:ring-blue-500/40 focus:ring-offset-zinc-950"
              />
              <label htmlFor="enabled" className="text-sm font-medium text-zinc-200 cursor-pointer">
                Job Active / Enabled for Execution
              </label>
            </div>

            {/* Monaco Editor for HTTP Headers JSON */}
            <div>
              <JsonEditor
                name="headersJson"
                control={control}
                label="HTTP Headers (JSON)"
                height={120}
                error={errors.headersJson}
              />
            </div>

            {/* Monaco Editor for Request Body JSON */}
            <div>
              <JsonEditor
                name="bodyJson"
                control={control}
                label="Request Body Payload (Monaco JSON Editor)"
                height={200}
                error={errors.bodyJson}
              />
            </div>

            {/* Form Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
              <Button type="button" variant="outline" onClick={() => navigate('/jobs')}>
                Cancel
              </Button>
              <Button type="submit" icon={Save} loading={saveMutation.isPending || isSubmitting}>
                {isEdit ? 'Update Job Specification' : 'Save Job Specification'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default JobEditor;
