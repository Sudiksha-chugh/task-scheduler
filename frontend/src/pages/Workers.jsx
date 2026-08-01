import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cpu, ShieldCheck, Clock, Activity } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { monitoringService } from '../services/monitoringService';

export function Workers() {
  const { data, isLoading } = useQuery({
    queryKey: ['monitoring-workers'],
    queryFn: monitoringService.getWorkers,
    refetchInterval: 3000,
  });

  const workersList = data?.workers || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Worker Fleet Health</h1>
          <p className="text-sm text-zinc-400 mt-1">Live worker heartbeats, current execution leases, and cluster nodes.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wider text-zinc-400">Total Active Workers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Cpu className="w-8 h-8 text-emerald-400" />
              <span className="text-3xl font-extrabold text-white font-mono">{workersList.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wider text-zinc-400">Lease Fencing Mode</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-blue-400" />
              <span className="text-sm font-semibold text-zinc-200">Atomic SET NX PX + Fencing</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wider text-zinc-400">Heartbeat Interval</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-purple-400" />
              <span className="text-3xl font-extrabold text-white font-mono">10s</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Active Worker Instances ({workersList.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-8 text-center text-zinc-500 animate-pulse">Scanning worker fleet...</div>
          ) : workersList.length === 0 ? (
            <div className="p-12 text-center text-zinc-500">
              <Cpu className="w-10 h-10 mx-auto mb-2 stroke-1 text-zinc-600" />
              <p className="text-sm font-medium">No active worker instances registered.</p>
              <p className="text-xs text-zinc-600 mt-1">Start a worker-service instance to register heartbeats.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {workersList.map((w, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-3 hover:border-zinc-700 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                      <span className="font-mono text-sm font-bold text-zinc-100">{w.workerId}</span>
                    </div>
                    <Badge variant="green">ONLINE</Badge>
                  </div>

                  <div className="space-y-1.5 text-xs text-zinc-400 font-mono">
                    <div className="flex items-center justify-between">
                      <span>Claimed Execution:</span>
                      <span className="text-blue-400 font-semibold">{w.executionId || 'Idle'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Last Heartbeat:</span>
                      <span className="text-zinc-300">
                        {w.lastSeen ? new Date(w.lastSeen).toLocaleTimeString() : 'Just now'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
