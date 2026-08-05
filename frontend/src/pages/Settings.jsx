import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../providers/AuthProvider';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Badge } from '../components/ui/Badge';
import { apiKeyService } from '../services/apiKeyService';
import { Shield, Key, Database, Cpu, Copy, CheckCircle2, Trash2, AlertTriangle } from 'lucide-react';

export function Settings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createError, setCreateError] = useState('');
  const [revealedKey, setRevealedKey] = useState(null); // { key, apiKey } shown once after creation
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: apiKeyService.getApiKeys,
  });

  const createMutation = useMutation({
    mutationFn: apiKeyService.createApiKey,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setCreateOpen(false);
      setNewKeyName('');
      setRevealedKey(res); // { key, apiKey }
    },
    onError: (err) => {
      setCreateError(err.response?.data?.error?.message || 'Failed to generate API key');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: apiKeyService.revokeApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    setCreateError('');
    createMutation.mutate({ name: newKeyName });
  };

  const handleCopy = async () => {
    if (!revealedKey?.key) return;
    try {
      await navigator.clipboard.writeText(revealedKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable; user can still select+copy manually
    }
  };

  const apiKeys = data?.apiKeys || [];

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
              <CardDescription>Generate and manage API keys for programmatic access.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-900 border border-zinc-800">
            <div>
              <p className="text-sm font-semibold text-zinc-200">JWT Access Token Lifetime</p>
              <p className="text-xs text-zinc-500">Configured in api-service env.js</p>
            </div>
            <span className="px-3 py-1 rounded-lg bg-zinc-800 font-mono text-xs text-amber-400 font-bold">
              15 Minutes
            </span>
          </div>

          {/* API Keys List */}
          <div className="space-y-2">
            {isLoading ? (
              <p className="text-xs text-zinc-500 p-4">Loading API keys...</p>
            ) : apiKeys.length === 0 ? (
              <p className="text-xs text-zinc-500 p-4 text-center border border-dashed border-zinc-800 rounded-xl">
                No API keys yet. Generate one to access JobFlow programmatically.
              </p>
            ) : (
              apiKeys.map((k) => (
                <div
                  key={k._id}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900 border border-zinc-800"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-zinc-300">{k.keyPrefix}...</span>
                    <span className="text-sm text-zinc-200 font-medium">{k.name}</span>
                    {k.enabled ? (
                      <Badge variant="green">Active</Badge>
                    ) : (
                      <Badge variant="gray">Revoked</Badge>
                    )}
                  </div>
                  {k.enabled && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      loading={revokeMutation.isPending && revokeMutation.variables === k._id}
                      onClick={() => revokeMutation.mutate(k._id)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" icon={Key} onClick={() => setCreateOpen(true)}>
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

      {/* Create Key Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Generate New API Key"
        description="Give it a name so you can identify it later."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {createError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
              {createError}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Key Name
            </label>
            <input
              type="text"
              required
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. CI Pipeline"
              className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Generate Key
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Reveal Key Dialog -- shown exactly once, right after creation */}
      <Dialog
        open={Boolean(revealedKey)}
        onClose={() => setRevealedKey(null)}
        title="API Key Generated"
        description="Copy this now — you won't be able to see it again."
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>This key will only be shown once. Store it somewhere safe before closing this dialog.</span>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-xl bg-zinc-950 border border-zinc-800">
            <code className="flex-1 text-xs font-mono text-emerald-400 break-all">
              {revealedKey?.key}
            </code>
            <Button variant="ghost" size="sm" icon={copied ? CheckCircle2 : Copy} onClick={handleCopy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setRevealedKey(null)}>
              Done
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}