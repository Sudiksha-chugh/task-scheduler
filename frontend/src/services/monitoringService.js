import api from './api';

export const monitoringService = {
  getWorkers: async () => {
    const response = await api.get('/monitoring/workers');
    return response.data;
  },

  getQueues: async () => {
    const response = await api.get('/monitoring/queues');
    return response.data;
  },

  subscribeToStream: (onMessage, onError) => {
    const token = localStorage.getItem('token');
    const configuredBase = import.meta.env.VITE_API_BASE_URL;
    const base = configuredBase ? configuredBase.replace(/\/$/, '') : '';
    const url = `${base}/api/v1/monitoring/stream?token=${encodeURIComponent(token || '')}`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (onMessage) onMessage(data);
      } catch (err) {
        console.error('Failed to parse SSE message:', err);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      if (onError) onError(error);
    };

    return () => {
      eventSource.close();
    };
  },
};