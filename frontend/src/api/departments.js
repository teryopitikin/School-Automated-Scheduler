import api from './client';

export const fetchDepartments = (params) => api.get('/departments/', { params });
export const createDepartment = (data) => api.post('/departments/', data);
export const updateDepartment = (id, data) => api.put(`/departments/${id}/`, data);
export const deleteDepartment = (id) => api.delete(`/departments/${id}/`);
