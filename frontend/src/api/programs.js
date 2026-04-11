import api from './client';

export const fetchPrograms = (params) => api.get('/programs/', { params });
export const createProgram = (data) => api.post('/programs/', data);
export const updateProgram = (id, data) => api.put(`/programs/${id}/`, data);
export const deleteProgram = (id) => api.delete(`/programs/${id}/`);
