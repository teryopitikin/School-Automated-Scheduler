import api from './client';

export const fetchSchedules = (params) => api.get('/schedules/', { params });
export const fetchSchedule = (id) => api.get(`/schedules/${id}/`);
export const createSchedule = (data) => api.post('/schedules/', data);
export const updateSchedule = (id, data) => api.put(`/schedules/${id}/`, data);
export const deleteSchedule = (id) => api.delete(`/schedules/${id}/`);
export const suggestSlots = (data) => api.post('/schedules/suggest/', data);
export const fetchConflicts = (params) => api.get('/schedules/conflicts/', { params });
export const fetchStats = (params) => api.get('/schedules/stats/', { params });
