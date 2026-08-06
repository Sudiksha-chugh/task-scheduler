import api from './api';

export const apiKeyService = {
  getApiKeys: async () => {
    const response = await api.get('/api-keys');
    return response.data;
  },

  createApiKey: async (data) => {
    const response = await api.post('/api-keys', data);
    return response.data;
  },

  revokeApiKey: async (id) => {
    const response = await api.delete(`/api-keys/${id}`);
    return response.data;
  },
};