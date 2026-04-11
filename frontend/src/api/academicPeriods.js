import api from './client';

export const fetchAcademicPeriods = (params) => api.get('/academic-periods/', { params });
export const fetchAcademicPeriod = (id) => api.get(`/academic-periods/${id}/`);
export const createAcademicPeriod = (data) => api.post('/academic-periods/', data);
export const updateAcademicPeriod = (id, data) => api.put(`/academic-periods/${id}/`, data);
export const deleteAcademicPeriod = (id) => api.delete(`/academic-periods/${id}/`);
export const cloneAcademicPeriod = (id, data) => api.post(`/academic-periods/${id}/clone/`, data);
