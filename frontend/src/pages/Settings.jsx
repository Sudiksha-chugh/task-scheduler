import React from 'react';
import { useAuth } from '../providers/AuthProvider';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Shield, Key, Database, Cpu } from 'lucide-react';

export function Settings() {
  const { user } = useAuth();

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Platform Settings</h1>
        <p className="text-sm text-zinc-400 mt-1">Manage tenant configurations, API credentials, and system parameters.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-blue-400" />
            <div>
              <CardTitle>Tenant Workspace Configuration</CardTitle>
              <CardDescription>Active tenant identification and isolation parameters.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                Tenant ID
              </label>
              <input
                type="text"
                readOnly
                value={user?.tenant || 'system-tenant'}
                className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm font-mono text-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                User Role
              </label>
              <input
                type="text"
                readOnly
                value={user?.role || 'ADMIN'}
                className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm font-mono text-purple-400"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Key className="w-5 h-5 text-amber-400" />
            <div>
              <CardTitle>API Access Tokens</CardTitle>
              <CardDescription>JWT secret configuration and access token lifetimes.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-900 border border-zinc-800">
            <div>
              <p className="text-sm font-semibold text-zinc-200">Access Token Lifetime</p>
              <p className="text-xs text-zinc-500">Configured in api-service env.js</p>
            </div>
            <span className="px-3 py-1 rounded-lg bg-zinc-800 font-mono text-xs text-amber-400 font-bold">
              15 Minutes
            </span>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => alert('API Key generated')}>
              Generate New API Key
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Cpu className="w-5 h-5 text-emerald-400" />
            <div>
              <CardTitle>Lease & Fencing Token Defaults</CardTitle>
              <CardDescription>Distributed lease lock TTL and heartbeat refresh intervals.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-xs font-mono p-3 rounded-lg bg-zinc-900 border border-zinc-800">
            <span className="text-zinc-400">LEASE_TTL_MS</span>
            <span className="text-emerald-400 font-bold">30,000 ms (30s)</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono p-3 rounded-lg bg-zinc-900 border border-zinc-800">
            <span className="text-zinc-400">HEARTBEAT_INTERVAL_MS</span>
            <span className="text-purple-400 font-bold">10,000 ms (10s)</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
