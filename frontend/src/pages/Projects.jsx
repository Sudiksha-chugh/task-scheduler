import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderKanban, Plus, FolderPlus, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { projectService } from '../services/projectService';
import { useNavigate } from 'react-router-dom';

export function Projects() {
  const [openCreate, setOpenCreate] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectService.getProjects,
  });

  const createMutation = useMutation({
    mutationFn: projectService.createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setOpenCreate(false);
      setName('');
      setSlug('');
      setDescription('');
    },
    onError: (err) => {
      setError(err.response?.data?.error?.message || 'Failed to create project');
    },
  });

  const handleNameChange = (e) => {
    const val = e.target.value;
    setName(val);
    setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''));
  };

  const handleCreate = (e) => {
    e.preventDefault();
    setError('');
    createMutation.mutate({ name, slug, description });
  };

  const projects = data?.projects || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Project Workspaces</h1>
          <p className="text-sm text-zinc-400 mt-1">Organize your jobs and workflows into isolated project environments.</p>
        </div>
        <Button icon={Plus} onClick={() => setOpenCreate(true)}>
          New Project
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-xl bg-zinc-900/60 animate-pulse border border-zinc-800" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <FolderKanban className="w-12 h-12 text-zinc-600 mb-3 stroke-1" />
          <CardTitle>No Projects Found</CardTitle>
          <CardDescription className="max-w-md mt-1 mb-6">
            Get started by creating your first project workspace to group and schedule jobs.
          </CardDescription>
          <Button icon={FolderPlus} onClick={() => setOpenCreate(true)}>
            Create Project
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((proj) => (
            <Card key={proj._id} hover className="flex flex-col justify-between">
              <div>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{proj.name}</CardTitle>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-blue-400 border border-zinc-700">
                      {proj.slug}
                    </span>
                  </div>
                  <CardDescription>{proj.description || 'No description provided.'}</CardDescription>
                </CardHeader>
              </div>

              <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between">
                <span className="text-xs font-mono text-zinc-500">ID: {proj._id.slice(-8)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/jobs?projectId=${proj._id}`)}
                >
                  Explore Jobs <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Dialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title="Create New Project"
        description="Projects isolate jobs, scheduling rules, and workflow graphs."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Project Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={handleNameChange}
              placeholder="e.g. Production Data Pipeline"
              className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Slug Identifier
            </label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm font-mono text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Description (Optional)
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of this project workspace"
              className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Create Project
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
