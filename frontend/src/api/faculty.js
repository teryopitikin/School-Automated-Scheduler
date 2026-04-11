import api from './client';

export const fetchFaculty = (params) => api.get('/faculty/', { params });
export const fetchFacultyMember = (id) => api.get(`/faculty/${id}/`);
export const createFaculty = (data) => api.post('/faculty/', data);
export const updateFaculty = (id, data) => api.put(`/faculty/${id}/`, data);
export const deleteFaculty = (id) => api.delete(`/faculty/${id}/`);

export const fetchAvailability = (facultyId, params) =>
  api.get(`/faculty/${facultyId}/availability/`, { params });
export const createAvailability = (facultyId, data) =>
  api.post(`/faculty/${facultyId}/availability/`, data);
export const updateAvailability = (facultyId, id, data) =>
  api.put(`/faculty/${facultyId}/availability/${id}/`, data);
export const deleteAvailability = (facultyId, id) =>
  api.delete(`/faculty/${facultyId}/availability/${id}/`);
