import api from './client';

export const fetchSections = (params) => api.get('/sections/', { params });
export const createSection = (data) => api.post('/sections/', data);
export const updateSection = (id, data) => api.put(`/sections/${id}/`, data);
export const deleteSection = (id) => api.delete(`/sections/${id}/`);
