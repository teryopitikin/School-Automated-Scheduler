import api from './client';

export const importExcel = (file, academicPeriodId) => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('academic_period', academicPeriodId);
  return api.post('/import/', fd);
};

export const exportExcel = (params) =>
  api.get('/export/', { params, responseType: 'blob' });

export const importFullExport = (file, academicPeriodId) => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('academic_period', academicPeriodId);
  return api.post('/import-full-export/', fd);
};

export const importMetadata = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post('/import-metadata/', fd);
};

export const wipeSchedule = () => api.post('/wipe-schedule/');
