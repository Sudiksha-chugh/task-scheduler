import React from 'react';
import { BarChart3, TrendingUp, Zap, Clock, ShieldCheck } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { MetricCard } from '../components/ui/MetricCard';

export function Analytics() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">System Performance & Analytics</h1>
        <p className="text-sm text-zinc-400 mt-1">Throughput metrics, retry distribution, and system performance audit.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <MetricCard
          title="Overall Success Rate"
          value="99.4%"
          subtitle="Past 24 hours"
          icon={TrendingUp}
          color="emerald"
        />
        <MetricCard
          title="Avg Dispatch Latency"
          value="42 ms"
          subtitle="P95 execution latency"
          icon={Clock}
          color="blue"
        />
        <MetricCard
          title="Fencing Conflicts"
          value="0"
          subtitle="Preempted stale leases"
          icon={ShieldCheck}
          color="purple"
        />
        <MetricCard
          title="Total Dispatches"
          value="1,420"
          subtitle="Job dispatches processed"
          icon={Zap}
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="h-64 flex flex-col justify-between">
          <CardHeader>
            <CardTitle>Execution Status Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center text-center">
            <div className="space-y-2">
              <BarChart3 className="w-12 h-12 text-blue-500/40 mx-auto stroke-1" />
              <p className="text-sm text-zinc-400">99.4% SUCCESS • 0.6% FAILED • 0% DEAD</p>
            </div>
          </CardContent>
        </Card>

        <Card className="h-64 flex flex-col justify-between">
          <CardHeader>
            <CardTitle>Worker Fleet Throughput</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center text-center">
            <div className="space-y-2">
              <TrendingUp className="w-12 h-12 text-emerald-500/40 mx-auto stroke-1" />
              <p className="text-sm text-zinc-400">Peak Throughput: 120 jobs/sec</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
