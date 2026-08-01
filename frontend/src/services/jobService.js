import api from './api';

export const jobService = {
  getJobs: async (projectId, params = {}) => {
    const url = projectId ? `/projects/${projectId}/jobs` : '/jobs';
    const response = await api.get(url, { params });
    return response.data;
  },

  createJob: async (projectId, jobData) => {
    const response = await api.post(`/projects/${projectId}/jobs`, jobData);
    return response.data;
  },

  getJobById: async (jobId) => {
    const response = await api.get(`/jobs/${jobId}`);
    return response.data;
  },

  updateJob: async (jobId, jobData) => {
    const response = await api.put(`/jobs/${jobId}`, jobData);
    return response.data;
  },

  triggerJob: async (projectId, jobId) => {
    const response = await api.post(`/projects/${projectId}/jobs/${jobId}/trigger`);
    return response.data;
  },
};
