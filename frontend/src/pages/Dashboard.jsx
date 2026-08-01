import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Zap,
  Activity,
  Cpu,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Radio,
  Clock,
} from 'lucide-react';
import { MetricCard } from '../components/ui/MetricCard';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Button } from '../components/ui/Button';
import { useStream } from '../providers/StreamProvider';
import { monitoringService } from '../services/monitoringService';
import { executionService } from '../services/executionService';
import { useNavigate } from 'react-router-dom';

export function Dashboard() {
  const navigate = useNavigate();
  const { events, connected } = useStream();

  const { data: queuesData } = useQuery({
    queryKey: ['monitoring-queues'],
    queryFn: monitoringService.getQueues,
    refetchInterval: 5000,
  });

  const { data: workersData } = useQuery({
    queryKey: ['monitoring-workers'],
    queryFn: monitoringService.getWorkers,
    refetchInterval: 5000,
  });

  const { data: executionsData } = useQuery({
    queryKey: ['recent-executions'],
    queryFn: () => executionService.getExecutions({ limit: 5 }),
    refetchInterval: 5000,
  });

  const activeWorkerCount = workersData?.workers?.length || 0;
  const execQueueWaiting = queuesData?.queues?.['execution-queue']?.waiting || 0;
  const execQueueActive = queuesData?.queues?.['execution-queue']?.active || 0;
  const executionsList = executionsData?.executions || [];

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">System Overview</h1>
          <p className="text-sm text-zinc-400 mt-1">Real-time status of workers, queues, and job execution pipeline.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/jobs')}>
            Manage Jobs
          </Button>
          <Button variant="primary" size="sm" icon={Zap} onClick={() => navigate('/jobs/new')}>
            New Job Definition
          </Button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard
          title="Active Workers"
          value={activeWorkerCount}
          subtitle="Heartbeats healthy"
          icon={Cpu}
          color="emerald"
        />
        <MetricCard
          title="Queue Waiting"
          value={execQueueWaiting}
          subtitle="BullMQ execution-queue"
          icon={Layers}
          color="amber"
        />
        <MetricCard
          title="Active Executions"
          value={execQueueActive}
          subtitle="Currently running HTTP dispatches"
          icon={Activity}
          color="blue"
        />
        <MetricCard
          title="Stream Status"
          value={connected ? 'Online' : 'Reconnecting'}
          subtitle="Redis Pub/Sub SSE Feed"
          icon={Radio}
          color={connected ? 'emerald' : 'rose'}
        />
      </div>

      {/* Main Grid: Live Events & Recent Executions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live SSE Event Feed */}
        <Card className="lg:col-span-1 flex flex-col h-[480px]">
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              <CardTitle>Live Event Stream</CardTitle>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">SSE</span>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto space-y-3 pr-1">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-zinc-500">
                <Clock className="w-8 h-8 mb-2 stroke-1" />
                <p className="text-xs">Listening for live execution events...</p>
              </div>
            ) : (
              events.map((evt, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800/80 text-xs space-y-1.5 transition-all hover:border-zinc-700"
                >
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="text-blue-400 font-semibold">{evt.type}</span>
                    <span className="text-zinc-500">{new Date(evt.timestamp || Date.now()).toLocaleTimeString()}</span>
                  </div>
                  {evt.status && (
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Status:</span>
                      <StatusBadge status={evt.status} />
                    </div>
                  )}
                  {evt.executionId && (
                    <p className="text-[10px] text-zinc-500 font-mono truncate">
                      ID: {evt.executionId}
                    </p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent Executions Table */}
        <Card className="lg:col-span-2 flex flex-col h-[480px]">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent Executions</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/executions')}>
              View All <ArrowUpRight className="w-3.5 h-3.5" />
            </Button>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto">
            {executionsList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-zinc-500 p-8">
                <Activity className="w-8 h-8 mb-2 stroke-1" />
                <p className="text-sm">No recent job executions found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800 pb-2">
                    <tr>
                      <th className="py-2.5 px-3">Execution ID</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Fencing Token</th>
                      <th className="py-2.5 px-3">Attempts</th>
                      <th className="py-2.5 px-3">Started</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {executionsList.map((exec) => (
                      <tr key={exec._id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-3 px-3 font-mono text-zinc-200">{exec._id.slice(-8)}</td>
                        <td className="py-3 px-3">
                          <StatusBadge status={exec.status} />
                        </td>
                        <td className="py-3 px-3 font-mono text-zinc-400">
                          {exec.fencingToken ? `#${exec.fencingToken}` : '—'}
                        </td>
                        <td className="py-3 px-3 font-mono">{exec.attempts?.length || 0}</td>
                        <td className="py-3 px-3 text-zinc-400">
                          {new Date(exec.createdAt).toLocaleTimeString()}
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
    </div>
  );
}
