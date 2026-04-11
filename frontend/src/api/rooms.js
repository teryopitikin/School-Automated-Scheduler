import api from './client';

export const fetchRooms = (params) => api.get('/rooms/', { params });
export const createRoom = (data) => api.post('/rooms/', data);
export const updateRoom = (id, data) => api.put(`/rooms/${id}/`, data);
export const deleteRoom = (id) => api.delete(`/rooms/${id}/`);
