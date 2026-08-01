import api from './api';

export const executionService = {
  getExecutions: async (params = {}) => {
    const response = await api.get('/executions', { params });
    return response.data;
  },

  getExecutionById: async (id) => {
    const response = await api.get(`/executions/${id}`);
    return response.data;
  },

  retryExecution: async (id) => {
    const response = await api.post(`/executions/${id}/retry`);
    return response.data;
  },
};
