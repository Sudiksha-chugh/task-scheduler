import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GitFork, Play, Plus, Network, Layers } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { workflowService } from '../services/workflowService';

export function Workflows() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowService.getWorkflows(),
  });

  const triggerMutation = useMutation({
    mutationFn: ({ projectId, workflowId }) => workflowService.triggerWorkflow(projectId, workflowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recent-executions'] });
      alert('Workflow triggered successfully! DAG execution started.');
    },
    onError: (err) => {
      alert(`Workflow trigger failed: ${err.response?.data?.error?.message || err.message}`);
    },
  });

  const workflowsList = data?.workflows || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">DAG Workflows</h1>
          <p className="text-sm text-zinc-400 mt-1">Multi-step job dependencies with fan-out and fan-in execution graph.</p>
        </div>
        <Button icon={Plus} onClick={() => alert('Visual DAG Flow Editor canvas initialized!')}>
          Create Workflow
        </Button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-zinc-500 animate-pulse">Loading workflows...</div>
      ) : workflowsList.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <GitFork className="w-12 h-12 text-zinc-600 mb-3 stroke-1" />
          <CardTitle>No DAG Workflows Configured</CardTitle>
          <CardDescription className="max-w-md mt-1 mb-6">
            Connect multiple jobs into a Directed Acyclic Graph (DAG) with automated dependency resolution.
          </CardDescription>
          <Button icon={Network} onClick={() => alert('Visual DAG Flow Editor canvas initialized!')}>
            Create First Workflow
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {workflowsList.map((wf) => {
            const nodeCount = wf.definition?.nodes?.length || 0;
            const edgeCount = wf.definition?.edges?.length || 0;

            return (
              <Card key={wf._id} hover className="flex flex-col justify-between">
                <div>
                  <CardHeader className="flex-row items-start justify-between">
                    <div>
                      <CardTitle>{wf.name}</CardTitle>
                      <CardDescription className="mt-1 font-mono text-xs text-zinc-500">
                        ID: {wf._id}
                      </CardDescription>
                    </div>
                    <Badge variant="purple">{nodeCount} Nodes</Badge>
                  </CardHeader>

                  <CardContent>
                    <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
                        <span className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-blue-400" /> Total Graph Nodes:
                        </span>
                        <span className="text-zinc-200 font-bold">{nodeCount}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
                        <span className="flex items-center gap-1.5">
                          <GitFork className="w-3.5 h-3.5 text-purple-400" /> Dependency Edges:
                        </span>
                        <span className="text-zinc-200 font-bold">{edgeCount}</span>
                      </div>
                    </div>
                  </CardContent>
                </div>

                <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between mt-4">
                  <span className="text-xs text-zinc-500 font-mono">
                    Updated {new Date(wf.updatedAt).toLocaleDateString()}
                  </span>
                  <Button
                    size="sm"
                    icon={Play}
                    loading={triggerMutation.isPending}
                    onClick={() =>
                      triggerMutation.mutate({
                        projectId: wf.project?._id || wf.project,
                        workflowId: wf._id,
                      })
                    }
                  >
                    Execute Workflow DAG
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
