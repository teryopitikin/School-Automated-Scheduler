import api from './client';

export const login = (data) => api.post('/auth/login/', data);
export const logout = () => api.post('/auth/logout/');
export const fetchCurrentUser = () => api.get('/auth/me/');
export const changePassword = (data) => api.post('/auth/change-password/', data);
