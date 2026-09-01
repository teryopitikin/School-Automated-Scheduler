import api from './client';

export const fetchSchedules = (params) => api.get('/schedules/', { params });
export const fetchSchedule = (id) => api.get(`/schedules/${id}/`);
export const createSchedule = (data) => api.post('/schedules/', data);
export const updateSchedule = (id, data) => api.put(`/schedules/${id}/`, data);
export const patchSchedule = (id, data) => api.patch(`/schedules/${id}/`, data);
export const deleteSchedule = (id) => api.delete(`/schedules/${id}/`);
export const editScheduleGroup = (id, data) => api.post(`/schedules/${id}/edit-group/`, data);
export const deleteScheduleGroup = (id) => api.post(`/schedules/${id}/delete-group/`);
export const suggestSlots = (data) => api.post('/schedules/suggest/', data);
export const fetchConflicts = (params) => api.get('/schedules/conflicts/', { params });
export const fetchFreeRooms = (id) => api.get(`/schedules/${id}/free-rooms/`);
export const fetchStats = (params) => api.get('/schedules/stats/', { params });
export const dismissConflict = (data) => api.post('/schedules/dismiss-conflict/', data);
export const fetchDismissals = (params) => api.get('/schedules/dismissals/', { params });
export const restoreDismissal = (id) => api.post('/schedules/restore-dismissal/', { id });
