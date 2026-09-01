import api from './client';

// Assistant turns run a server-side tool loop against Claude and routinely
// take longer than the client's default 30s timeout — especially with a file
// attached or on a large timetable. Give them room (the server caps at 300s).
const LONG = { timeout: 300000 };

export const assistantChat = ({ message, history, file }) => {
  if (!file) return api.post('/assistant/chat/', { message, history }, LONG);
  const fd = new FormData();
  fd.append('message', message);
  fd.append('history', JSON.stringify(history || []));
  fd.append('file', file);
  return api.post('/assistant/chat/', fd, LONG);
};

export const assistantExecute = (data) => api.post('/assistant/execute/', data, LONG);
export const fetchAssistantConfig = () => api.get('/assistant/config/');
export const saveAssistantKey = (apiKey) => api.post('/assistant/config/', { api_key: apiKey });
export const testAssistantKey = () => api.post('/assistant/config/test/', {}, { timeout: 60000 });
