import api from './client';

export const assistantChat = (data) => api.post('/assistant/chat/', data);
export const assistantExecute = (data) => api.post('/assistant/execute/', data);
export const fetchAssistantConfig = () => api.get('/assistant/config/');
export const saveAssistantKey = (apiKey) => api.post('/assistant/config/', { api_key: apiKey });
export const testAssistantKey = () => api.post('/assistant/config/test/');
