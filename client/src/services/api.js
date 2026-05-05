import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach token
api.interceptors.request.use(
  (config) => {
    const stored = localStorage.getItem('smp-auth');
    if (stored) {
      try {
        const { state } = JSON.parse(stored);
        if (state?.accessToken) {
          config.headers.Authorization = `Bearer ${state.accessToken}`;
        }
      } catch {}
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor — handle 401 and retry
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const stored = localStorage.getItem('smp-auth');
        if (!stored) throw new Error('No stored auth state');
        const parsed = JSON.parse(stored);
        const state = parsed.state || {};
        if (!state.refreshToken) throw new Error('No refresh token');

        const { data } = await api.post('/auth/refresh', {
          refreshToken: state.refreshToken,
        });
        const newToken = data.data.accessToken;

        // Update stored token
        const updated = {
          ...JSON.parse(stored),
          state: { ...state, accessToken: newToken },
        };
        localStorage.setItem('smp-auth', JSON.stringify(updated));

        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('smp-auth');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;

// ─── Service modules ──────────────────────────────────────────────────────────

export const authService = {
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  updatePassword: (data) => api.put('/auth/update-password', data),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) =>
    api.put(`/auth/reset-password/${token}`, { password }),
};

export const userService = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/auth/register', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  toggleStatus: (id) => api.patch(`/users/${id}/toggle-status`),
  delete: (id) => api.delete(`/users/${id}`),
  uploadAvatar: (id, file) => {
    const form = new FormData();
    form.append('avatar', file);
    return api.post(`/users/${id}/avatar`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getByClass: (classId) => api.get(`/users/students/class/${classId}`),
};

export const classService = {
  getAll: () => api.get('/classes'),
  getById: (id) => api.get(`/classes/${id}`),
  create: (data) => api.post('/classes', data),
  update: (id, data) => api.put(`/classes/${id}`, data),
  delete: (id) => api.delete(`/classes/${id}`),
};

export const subjectService = {
  getAll: () => api.get('/subjects'),
  create: (data) => api.post('/subjects', data),
  update: (id, data) => api.put(`/subjects/${id}`, data),
};

export const attendanceService = {
  mark: (data) => api.post('/attendance/mark', data),
  getClassAttendance: (classId, params) =>
    api.get(`/attendance/class/${classId}`, { params }),
  getStudentSummary: (studentId, params) =>
    api.get(`/attendance/student/${studentId}/summary`, { params }),
};

export const examService = {
  getAll: (params) => api.get('/exams', { params }),
  create: (data) => api.post('/exams', data),
  update: (id, data) => api.put(`/exams/${id}`, data),
};

export const resultService = {
  upsert: (data) => api.post('/results', data),
  bulkUpsert: (data) => api.post('/results/bulk', data),
  publish: (data) => api.post('/results/publish', data),
  getReportCard: (studentId, params) =>
    api.get(`/results/report-card/${studentId}`, { params }),
  getClassResults: (classId, params) =>
    api.get(`/results/class/${classId}`, { params }),
  getHistory: (studentId) => api.get(`/results/student/${studentId}/history`),
};

export const feeService = {
  getAll: (params) => api.get('/fees', { params }),
  getById: (id) => api.get(`/fees/${id}`),
  create: (data) => api.post('/fees', data),
  update: (id, data) => api.put(`/fees/${id}`, data),
};

export const paymentService = {
  initPaystack: (data) => api.post('/payments/initialize/paystack', data),
  verifyPaystack: (reference) =>
    api.post('/payments/verify/paystack', { reference }),
  initFlutterwave: (data) => api.post('/payments/initialize/flutterwave', data),
  recordManual: (data) => api.post('/payments/manual', data),
  getStudentPayments: (studentId, params) =>
    api.get(`/payments/student/${studentId}`, { params }),
  getReport: (params) => api.get('/payments/report', { params }),
};

export const assignmentService = {
  getAll: (params) => api.get('/assignments', { params }),
  create: (data) => {
    const form = new FormData();
    Object.entries(data).forEach(([k, v]) => {
      if (k === 'attachments' && Array.isArray(v))
        v.forEach((f) => form.append('attachments', f));
      else form.append(k, v);
    });
    return api.post('/assignments', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  update: (id, data) => api.put(`/assignments/${id}`, data),
  delete: (id) => api.delete(`/assignments/${id}`),
};

export const submissionService = {
  submit: (data) => {
    const form = new FormData();
    form.append('assignmentId', data.assignmentId);
    if (data.comment) form.append('comment', data.comment);
    (data.files || []).forEach((f) => form.append('files', f));
    return api.post('/submissions', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  grade: (id, data) => api.patch(`/submissions/${id}/grade`, data),
  getForAssignment: (assignmentId) =>
    api.get(`/submissions/assignment/${assignmentId}`),
  getMine: () => api.get('/submissions/mine'),
};

export const parentService = {
  getAll: (params) => api.get('/parents', { params }),
  create: (data) => api.post('/parents', data),
  update: (id, data) => api.put(`/parents/${id}`, data),
  delete: (id) => api.delete(`/parents/${id}`),
  linkChild: (parentId, childId) =>
    api.patch(`/parents/${parentId}/children`, { action: 'link', childId }),
  unlinkChild: (parentId, childId) =>
    api.patch(`/parents/${parentId}/children`, { action: 'unlink', childId }),
  getUnlinkedStudents: (params) =>
    api.get('/parents/students/unlinked', { params }),
};

export const announcementService = {
  getAll: () => api.get('/announcements'),
  create: (data) => api.post('/announcements', data),
  markRead: (id) => api.patch(`/announcements/${id}/read`),
  delete: (id) => api.delete(`/announcements/${id}`),
};

export const dashboardService = {
  getAdmin: (params) => api.get('/dashboard/admin', { params }),
  getTeacher: (params) => api.get('/dashboard/teacher', { params }),
  getStudent: (params) => api.get('/dashboard/student', { params }),
  getParent: (params) => api.get('/dashboard/parent', { params }),
};

export const timetableService = {
  // Admin
  getAll: (params) => api.get('/timetables', { params }),
  getById: (id) => api.get(`/timetables/${id}`),
  create: (data) => api.post('/timetables', data),
  update: (id, data) => api.put(`/timetables/${id}`, data),
  delete: (id) => api.delete(`/timetables/${id}`),
  upsertPeriod: (id, data) => api.patch(`/timetables/${id}/period`, data),
  deletePeriod: (id, data) =>
    api.patch(`/timetables/${id}/period/delete`, data),
  publish: (id) => api.patch(`/timetables/${id}/publish`),
  unpublish: (id) => api.patch(`/timetables/${id}/unpublish`),
  // All roles — contextual
  getMine: (params) => api.get('/timetables/mine', { params }),
};

export const libraryService = {
  // Books
  getBooks: (params) => api.get('/library/books', { params }),
  getBook: (id) => api.get(`/library/books/${id}`),
  getCategories: () => api.get('/library/books/categories'),
  createBook: (data) => api.post('/library/books', data),
  updateBook: (id, d) => api.put(`/library/books/${id}`, d),
  deleteBook: (id) => api.delete(`/library/books/${id}`),
  // Borrow
  borrowBook: (data) => api.post('/library/borrow', data),
  returnBook: (id) => api.post(`/library/return/${id}`),
  renewBook: (id) => api.post(`/library/renew/${id}`),
  payFine: (id) => api.patch(`/library/fine/${id}/pay`),
  // Records
  getRecords: (params) => api.get('/library/records', { params }),
  getMyRecords: () => api.get('/library/records/mine'),
  getOverdue: () => api.get('/library/overdue'),
  getStats: () => api.get('/library/stats'),
};

export const calendarService = {
  getAll: () => api.get('/calendar'),
  getActive: () => api.get('/calendar/active'),
  getById: (id) => api.get(`/calendar/${id}`),
  create: (data) => api.post('/calendar', data),
  update: (id, d) => api.put(`/calendar/${id}`, d),
  delete: (id) => api.delete(`/calendar/${id}`),
  addEvent: (id, d) => api.post(`/calendar/${id}/event`, d),
  updateEvent: (id, eid, d) => api.put(`/calendar/${id}/event/${eid}`, d),
  deleteEvent: (id, eid) => api.delete(`/calendar/${id}/event/${eid}`),
  publish: (id) => api.patch(`/calendar/${id}/publish`),
  activate: (id) => api.patch(`/calendar/${id}/activate`),
};

// Exam Schedule API
export const examScheduleService = {
  create: (data) => api.post('/exam-schedules', data),
  getAll: (params) => api.get('/exam-schedules', { params }),
  getById: (id) => api.get(`/exam-schedules/${id}`),
  update: (id, data) => api.put(`/exam-schedules/${id}`, data),
  publish: (id) => api.post(`/exam-schedules/${id}/publish`),
  delete: (id) => api.delete(`/exam-schedules/${id}`),
  getTeacherInvigilations: (params) =>
    api.get('/exam-schedules/teacher/invigilations', { params }),
  checkConflicts: (data) => api.post('/exam-schedules/check-conflicts', data),
};

export const caTrackingService = {
  sync: (data) => api.post('/ca-tracking/sync', data),
  getStudentTracking: (studentId, params) =>
    api.get(`/ca-tracking/student/${studentId}`, { params }),
  getClassTracking: (classId, subjectId, params) =>
    api.get(`/ca-tracking/class/${classId}/subject/${subjectId}`, { params }),
  getAnalytics: (studentId, params) =>
    api.get(`/ca-tracking/analytics/${studentId}`, { params }),
  getChartData: (studentId, subjectId, params) =>
    api.get(`/ca-tracking/chart/${studentId}/${subjectId}`, { params }),
};

export const promotionService = {
  create: (data) => api.post('/promotions', data),
  getAll: (params) => api.get('/promotions', { params }),
  getById: (id) => api.get(`/promotions/${id}`),
  autoProcess: (id) => api.post(`/promotions/${id}/auto-process`),
  updateStudentStatus: (id, studentId, data) =>
    api.put(`/promotions/${id}/student/${studentId}`, data),
  apply: (id) => api.post(`/promotions/${id}/apply`),
  delete: (id) => api.delete(`/promotions/${id}`),
  getStats: (id) => api.get(`/promotions/${id}/stats`),
};

export const certificateService = {
  generateReportCard: (data) => api.post('/certificates/report-card', data),
  generateLeavingCertificate: (data) =>
    api.post('/certificates/leaving-certificate', data),
  generateAdmissionLetter: (data) =>
    api.post('/certificates/admission-letter', data),
  getAll: (params) => api.get('/certificates', { params }),
  getById: (id) => api.get(`/certificates/${id}`),
  revoke: (id, data) => api.put(`/certificates/${id}/revoke`, data),
};
