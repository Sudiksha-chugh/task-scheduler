import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  GitFork,
  Play,
  Plus,
  Save,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  Radio,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { workflowService } from '../services/workflowService';
import { projectService } from '../services/projectService';
import { jobService } from '../services/jobService';
import { useStream } from '../providers/StreamProvider';

// Custom React Flow Node Component for Jobs
function JobNode({ data }) {
  const status = data.status || 'IDLE';

  const statusStyles = {
    IDLE: 'border-zinc-800 bg-zinc-950/90 text-zinc-300',
    PENDING: 'border-amber-500/50 bg-amber-950/20 text-amber-300',
    LEASED: 'border-purple-500/50 bg-purple-950/20 text-purple-300',
    RUNNING: 'border-blue-500 bg-blue-950/40 text-blue-300 animate-pulse ring-2 ring-blue-500/30',
    SUCCESS: 'border-emerald-500/80 bg-emerald-950/30 text-emerald-300',
    FAILED: 'border-rose-500/80 bg-rose-950/30 text-rose-300',
    DEAD: 'border-red-600 bg-red-950/50 text-red-300',
  };

  return (
    <div
      className={`p-3.5 rounded-xl border-2 shadow-2xl min-w-[210px] max-w-[260px] transition-all backdrop-blur-md ${
        statusStyles[status] || statusStyles.IDLE
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-blue-500 border-2 border-zinc-950"
      />

      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-extrabold text-xs text-white truncate" title={data.jobName}>
          {data.jobName || 'Job Node'}
        </span>
        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-zinc-800 text-blue-400 border border-zinc-700/50">
          {data.httpMethod || 'POST'}
        </span>
      </div>

      {data.targetUrl && (
        <p className="text-[10px] font-mono text-zinc-400 truncate mb-2.5" title={data.targetUrl}>
          {data.targetUrl}
        </p>
      )}

      <div className="flex items-center justify-between text-[10px] font-mono pt-2 border-t border-zinc-800/80">
        <span className="text-zinc-500">Status:</span>
        <span className="font-bold uppercase tracking-wider">{status}</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-blue-500 border-2 border-zinc-950"
      />
    </div>
  );
}

// DFS Cycle Detection to enforce Directed Acyclic Graph (DAG)
function hasCycle(nodes, edges) {
  const adj = {};
  nodes.forEach((n) => {
    adj[n.id] = [];
  });

  edges.forEach((e) => {
    if (adj[e.source] && adj[e.target]) {
      adj[e.source].push(e.target);
    }
  });

  const visited = {}; // 0 = unvisited, 1 = visiting, 2 = visited

  function dfs(nodeId) {
    visited[nodeId] = 1;
    const neighbors = adj[nodeId] || [];
    for (const neighbor of neighbors) {
      if (visited[neighbor] === 1) {
        return true; // Cycle detected!
      }
      if (!visited[neighbor]) {
        if (dfs(neighbor)) return true;
      }
    }
    visited[nodeId] = 2;
    return false;
  }

  for (const node of nodes) {
    if (!visited[node.id]) {
      if (dfs(node.id)) return true;
    }
  }

  return false;
}

export function Workflows() {
  const queryClient = useQueryClient();
  const { connected: sseConnected, lastEvent } = useStream();

  const [projectId, setProjectId] = useState('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [workflowName, setWorkflowName] = useState('New Job DAG Workflow');
  const [selectedJobToAdd, setSelectedJobToAdd] = useState('');
  const [activeRunId, setActiveRunId] = useState(null);
  const [workflowRunStatus, setWorkflowRunStatus] = useState(null);

  const [notification, setNotification] = useState(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const nodeTypes = useMemo(() => ({ jobNode: JobNode }), []);

  // Fetch Projects list
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: projectService.getProjects,
  });

  const projectsList = projectsData?.projects || [];

  // Set default project ID
  useEffect(() => {
    if (projectsList.length > 0 && !projectId) {
      setProjectId(projectsList[0]._id);
    }
  }, [projectsList, projectId]);

  // Fetch Workflows for selected project
  const { data: workflowsData, isLoading: isLoadingWorkflows } = useQuery({
    queryKey: ['workflows', projectId],
    queryFn: () => workflowService.getWorkflows(projectId || undefined),
    enabled: Boolean(projectId),
  });

  // Fetch Jobs for adding nodes to canvas
  const { data: jobsData } = useQuery({
    queryKey: ['jobs', projectId],
    queryFn: () => jobService.getJobs(projectId || undefined, { limit: 100 }),
    enabled: Boolean(projectId),
  });

  const workflowsList = workflowsData?.workflows || [];
  const jobsList = jobsData?.jobs || [];

  // Set default selected job to add
  useEffect(() => {
    if (jobsList.length > 0 && !selectedJobToAdd) {
      setSelectedJobToAdd(jobsList[0]._id);
    }
  }, [jobsList, selectedJobToAdd]);

  // Load existing workflow when selected from dropdown
  useEffect(() => {
    if (selectedWorkflowId) {
      const found = workflowsList.find((w) => w._id === selectedWorkflowId);
      if (found) {
        setWorkflowName(found.name || 'Workflow DAG');
        if (found.definition?.nodes) {
          setNodes(found.definition.nodes);
        } else {
          setNodes([]);
        }
        if (found.definition?.edges) {
          setEdges(found.definition.edges);
        } else {
          setEdges([]);
        }
      }
    }
  }, [selectedWorkflowId, workflowsList, setNodes, setEdges]);

  // Handle connecting edges on canvas
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#3b82f6', strokeWidth: 2 } }, eds)),
    [setEdges],
  );

  // Add Job Node to ReactFlow Canvas
  const handleAddJobNode = () => {
    if (!selectedJobToAdd) return;
    const job = jobsList.find((j) => j._id === selectedJobToAdd);
    if (!job) return;

    const newNodeId = `node_${Date.now()}`;
    const newNode = {
      id: newNodeId,
      type: 'jobNode',
      position: {
        x: 150 + (nodes.length % 4) * 220,
        y: 100 + Math.floor(nodes.length / 4) * 140,
      },
      data: {
        jobId: job._id,
        jobName: job.name,
        httpMethod: job.httpMethod || 'POST',
        targetUrl: job.targetUrl,
        status: 'IDLE',
      },
    };

    setNodes((nds) => [...nds, newNode]);
  };

  // Save Workflow Mutation (with Cycle Validation)
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (hasCycle(nodes, edges)) {
        throw new Error('CYCLE_DETECTED');
      }

      const definition = { nodes, edges };
      const payload = {
        name: workflowName,
        definition,
      };

      if (selectedWorkflowId) {
        return workflowService.updateWorkflow(projectId, selectedWorkflowId, payload);
      }

      return workflowService.createWorkflow(projectId, payload);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      setNotification({
        type: 'success',
        message: `Workflow "${workflowName}" saved successfully!`,
      });
      if (data?._id) {
        setSelectedWorkflowId(data._id);
      }
      setTimeout(() => setNotification(null), 4000);
    },
    onError: (err) => {
      const apiCode = err.response?.data?.error?.code;
      if (err.message === 'CYCLE_DETECTED' || apiCode === 'CYCLE_DETECTED') {
        setNotification({
          type: 'error',
          message: 'Cycle detected! Workflows must be a Directed Acyclic Graph (DAG). Remove cyclic connections before saving.',
        });
      } else {
        setNotification({
          type: 'error',
          message: `Save failed: ${err.response?.data?.error?.message || err.message}`,
        });
      }
      setTimeout(() => setNotification(null), 5000);
    },
  });

  // Trigger Workflow Mutation
  const triggerMutation = useMutation({
    mutationFn: () => {
      if (!selectedWorkflowId) {
        throw new Error('Please save or select a workflow before executing.');
      }
      return workflowService.triggerWorkflow(projectId, selectedWorkflowId);
    },
    onSuccess: (res) => {
      const runId = res?.workflowRun?._id || res?._id;
      setActiveRunId(runId);
      setWorkflowRunStatus(res?.workflowRun?.status || 'RUNNING');
      setNodes((prevNodes) =>
        prevNodes.map((n) => ({
          ...n,
          data: { ...n.data, status: 'PENDING' },
        })),
      );

      setNotification({
        type: 'success',
        message: `Workflow DAG triggered successfully! Execution Run ID: ${runId || 'active'}`,
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

  // Live SSE updates scoped to the active workflow run
  useEffect(() => {
    if (!lastEvent || !activeRunId) return;

    const eventType = lastEvent.eventType || lastEvent.type;
    const payload = lastEvent.payload || lastEvent;
    const workflowRunId =
      lastEvent.workflowRunId || payload.workflowRunId || payload.workflowRun;

    if (workflowRunId && String(workflowRunId) !== String(activeRunId)) {
      return;
    }

    if (
      eventType === 'NODE_EXECUTION_UPDATED' ||
      eventType === 'node_execution_updated'
    ) {
      const targetNodeId = lastEvent.nodeId || payload.nodeId;
      const newStatus = lastEvent.status || payload.status;

      if (!targetNodeId || !newStatus) return;

      setNodes((prevNodes) =>
        prevNodes.map((node) => {
          if (String(node.id) === String(targetNodeId)) {
            return {
              ...node,
              data: {
                ...node.data,
                status: newStatus,
              },
            };
          }
          return node;
        }),
      );
      return;
    }

    if (
      eventType === 'WORKFLOW_RUN_UPDATED' ||
      eventType === 'workflow_run_updated'
    ) {
      const newRunStatus = lastEvent.status || payload.status;
      if (newRunStatus) {
        setWorkflowRunStatus(newRunStatus);
      }
    }
  }, [lastEvent, activeRunId, setNodes]);

  const handleNewWorkflow = () => {
    setSelectedWorkflowId('');
    setWorkflowName(`DAG Workflow ${workflowsList.length + 1}`);
    setNodes([]);
    setEdges([]);
    setActiveRunId(null);
    setWorkflowRunStatus(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <GitFork className="w-6 h-6 text-purple-400" /> Visual DAG Workflows Canvas
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Build, validate DAG cycle safety, save, and monitor multi-job DAG execution runs live via SSE.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border bg-zinc-900 border-zinc-800 text-zinc-400">
            <Radio
              className={`w-3 h-3 ${
                sseConnected ? 'text-emerald-400 animate-ping' : 'text-zinc-600'
              }`}
            />
            {sseConnected ? 'SSE Live Stream Active' : 'SSE Disconnected'}
          </span>

          <Button variant="outline" size="sm" icon={Plus} onClick={handleNewWorkflow}>
            New Workflow
          </Button>

          <Button
            variant="secondary"
            size="sm"
            icon={Save}
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Save DAG Workflow
          </Button>

          <Button
            size="sm"
            icon={Play}
            loading={triggerMutation.isPending}
            disabled={!selectedWorkflowId}
            onClick={() => triggerMutation.mutate()}
          >
            Trigger DAG Run
          </Button>
        </div>
      </div>

      {/* Toast Notification */}
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

      {/* Control Bar: Project Select, Workflow Name & Add Job Node */}
      <Card className="p-4 bg-zinc-900/70 border-zinc-800/80">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Project Selection */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Project Workspace
            </label>
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setSelectedWorkflowId('');
              }}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              {projectsList.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} ({p.slug})
                </option>
              ))}
            </select>
          </div>

          {/* Workflow Selector / Name */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Select or Name Workflow
            </label>
            <div className="flex gap-2">
              <select
                value={selectedWorkflowId}
                onChange={(e) => setSelectedWorkflowId(e.target.value)}
                className="w-1/2 rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                <option value="">(New Workflow)</option>
                {workflowsList.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                placeholder="Workflow Name"
                className="w-1/2 rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
          </div>

          {/* Add Job Node Dropdown */}
          <div className="md:col-span-2 flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Add Job Node to Canvas
              </label>
              <select
                value={selectedJobToAdd}
                onChange={(e) => setSelectedJobToAdd(e.target.value)}
                className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                {jobsList.length === 0 ? (
                  <option value="">No registered jobs in project</option>
                ) : (
                  jobsList.map((j) => (
                    <option key={j._id} value={j._id}>
                      {j.name} ({j.httpMethod || 'POST'})
                    </option>
                  ))
                )}
              </select>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={handleAddJobNode}
              disabled={!selectedJobToAdd}
              className="mt-6"
            >
              Add Node
            </Button>
          </div>
        </div>
      </Card>

      {/* React Flow Canvas Container */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">
        <div className="h-[580px] w-full rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden relative shadow-2xl">
          <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          colorMode="dark"
        >
          <Controls className="!bg-zinc-900 !border-zinc-800 !text-zinc-200 fill-zinc-200" />
          <MiniMap className="!bg-zinc-900/90 !border-zinc-800" maskColor="rgba(0,0,0,0.6)" />
          <Background color="#334155" gap={20} size={1} />

          {/* Top Panel Instructions & Legend */}
          <Panel position="top-left" className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-300 space-y-1.5 backdrop-blur-md">
            <div className="flex items-center gap-2 font-bold text-white">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>DAG Builder Guide</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Drag nodes to move. Connect bottom output handle of a job to top input handle of dependent job.
            </p>
            <div className="flex items-center gap-2 pt-1 border-t border-zinc-800 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-zinc-400"><span className="w-2 h-2 rounded-full bg-zinc-600" /> IDLE</span>
              <span className="flex items-center gap-1 text-amber-400"><span className="w-2 h-2 rounded-full bg-amber-400" /> PENDING</span>
              <span className="flex items-center gap-1 text-blue-400"><span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" /> RUNNING</span>
              <span className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-400" /> SUCCESS</span>
              <span className="flex items-center gap-1 text-rose-400"><span className="w-2 h-2 rounded-full bg-rose-400" /> FAILED</span>
            </div>
          </Panel>
        </ReactFlow>
        </div>

        <Card className="h-[580px] flex flex-col bg-zinc-900/70 border-zinc-800/80">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              Workflow Run Monitor
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 space-y-4 text-xs">
            {!activeRunId ? (
              <div className="text-zinc-500 text-center py-8">
                Trigger a workflow to watch live node statuses via SSE.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Run ID</span>
                    <span className="font-mono text-zinc-300 truncate max-w-[160px]" title={activeRunId}>
                      {activeRunId}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 items-center">
                    <span className="text-zinc-500">Run Status</span>
                    <Badge variant={workflowRunStatus === 'SUCCESS' ? 'green' : workflowRunStatus === 'FAILED' ? 'red' : 'amber'}>
                      {workflowRunStatus || 'RUNNING'}
                    </Badge>
                  </div>
                  <div className="flex justify-between gap-2 items-center">
                    <span className="text-zinc-500">SSE</span>
                    <span className={sseConnected ? 'text-emerald-400' : 'text-zinc-500'}>
                      {sseConnected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                </div>

                <div className="border-t border-zinc-800 pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                    Node Statuses
                  </p>
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {nodes.length === 0 ? (
                      <p className="text-zinc-500">No nodes on canvas.</p>
                    ) : (
                      nodes.map((node) => (
                        <div
                          key={node.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/80 px-2.5 py-2"
                        >
                          <span className="truncate text-zinc-300" title={node.data?.jobName}>
                            {node.data?.jobName || node.id}
                          </span>
                          <span className="font-mono text-[10px] uppercase text-blue-300">
                            {node.data?.status || 'IDLE'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default Workflows;
