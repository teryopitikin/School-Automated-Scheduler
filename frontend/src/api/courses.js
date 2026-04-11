import api from './client';

export const fetchCourses = (params) => api.get('/courses/', { params });
export const createCourse = (data) => api.post('/courses/', data);
export const updateCourse = (id, data) => api.put(`/courses/${id}/`, data);
export const deleteCourse = (id) => api.delete(`/courses/${id}/`);
