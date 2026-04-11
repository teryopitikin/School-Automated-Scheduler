import api from './client';

export const fetchConfig = (params) => api.get('/config/', { params });
export const updateConfig = (id, data) => api.put(`/config/${id}/`, data);
