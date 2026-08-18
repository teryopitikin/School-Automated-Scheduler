import api from './client';

export const assistantChat = (data) => api.post('/assistant/chat/', data);
export const assistantExecute = (data) => api.post('/assistant/execute/', data);
