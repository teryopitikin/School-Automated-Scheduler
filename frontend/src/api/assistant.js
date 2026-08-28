import api from './client';

export const assistantChat = ({ message, history, file }) => {
  if (!file) return api.post('/assistant/chat/', { message, history });
  const fd = new FormData();
  fd.append('message', message);
  fd.append('history', JSON.stringify(history || []));
  fd.append('file', file);
  return api.post('/assistant/chat/', fd);
};
export const assistantExecute = (data) => api.post('/assistant/execute/', data);
export const fetchAssistantConfig = () => api.get('/assistant/config/');
export const saveAssistantKey = (apiKey) => api.post('/assistant/config/', { api_key: apiKey });
export const testAssistantKey = () => api.post('/assistant/config/test/');
