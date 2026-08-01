import api from './api';

export const workflowService = {
  getWorkflows: async (projectId) => {
    const url = projectId ? `/projects/${projectId}/workflows` : '/workflows';
    const response = await api.get(url);
    return response.data;
  },

  createWorkflow: async (projectId, workflowData) => {
    const response = await api.post(`/projects/${projectId}/workflows`, workflowData);
    return response.data;
  },

  triggerWorkflow: async (projectId, workflowId) => {
    const response = await api.post(`/projects/${projectId}/workflows/${workflowId}/trigger`);
    return response.data;
  },
};
