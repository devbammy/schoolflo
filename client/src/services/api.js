import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * The auth store registers itself here at start-up.
 *
 * api.js cannot import the store directly — the store imports api, and the
 * resulting cycle risks a temporal-dead-zone error at module init. This keeps
 * the dependency pointing one way while still giving the interceptors a single
 * source of truth for tokens, instead of hand-parsing localStorage and writing
 * refreshed tokens back by hand (two copies of the same state kept in sync
 * manually).
 */
let authBridge = {
  getAccessToken: () => null,
  getRefreshToken: () => null,
  setAccessToken: () => {},
  setRefreshToken: () => {},
  onSessionExpired: () => {},
};

export const registerAuthBridge = (bridge) => {
  authBridge = { ...authBridge, ...bridge };
};

/**
 * The feature store registers itself here, for the same reason the auth store
 * does: it imports api, so api cannot import it back.
 */
let featureBridge = { onStaleFeature: () => {} };

export const registerFeatureBridge = (bridge) => {
  featureBridge = { ...featureBridge, ...bridge };
};

// Two ways the server says "this school does not run that": the catch-all 404
// for a router that was never mounted, and requireFeature's own message for a
// route guarded inside a router that was.
const UNMOUNTED_ROUTE = /^Route .+ not found$/i;
const FEATURE_DISABLED = 'This feature is not enabled for this school.';

/**
 * A 404 for something the client still has a link to means our copy of the
 * feature set has gone stale — the flags changed while this tab was open.
 * Re-read them, and replace the message before it reaches a page, because
 * every page surfaces `err.response.data.message` directly and
 * "Route /api/v1/staff-attendance/today not found" tells a teacher nothing.
 */
const handlePossibleStaleFeature = (error) => {
  if (error.response?.status !== 404) return;

  const message = error.response?.data?.message || '';
  if (message !== FEATURE_DISABLED && !UNMOUNTED_ROUTE.test(message)) return;

  featureBridge.onStaleFeature();
  error.response.data.message = "This part of the portal isn't available.";
};

// Request interceptor — attach token
api.interceptors.request.use(
  (config) => {
    const token = authBridge.getAccessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor — refresh once on 401, queueing anything that arrives
// while the refresh is in flight.
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

    handlePossibleStaleFeature(error);

    const isAuthCall =
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/refresh');

    if (
      error.response?.status !== 401 ||
      originalRequest?._retry ||
      isAuthCall
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = authBridge.getRefreshToken();
      if (!refreshToken) throw new Error('No refresh token');

      const { data } = await api.post('/auth/refresh', { refreshToken });
      const newToken = data.data.accessToken;

      // Refresh tokens rotate server-side: each use retires the token that
      // was sent and issues a replacement. Storing it is not optional — keep
      // the old one and the next refresh is read as a replay and the session
      // is revoked. The server omits it only when this call raced another
      // rotation, in which case the token we already hold is still current.
      if (data.data.refreshToken) {
        authBridge.setRefreshToken(data.data.refreshToken);
      }

      authBridge.setAccessToken(newToken);
      api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

      processQueue(null, newToken);
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      authBridge.onSessionExpired();

      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
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
  /**
   * Every matching user, for a picker. The API pages lists at 100, so asking
   * for more is refused outright (the library asked for 200 and its borrower
   * list came back empty), and asking for exactly 100 quietly drops the 101st
   * student from a school's payment form.
   */
  getEvery: async (params) => {
    const everyone = [];
    for (let page = 1; ; page += 1) {
      const { data } = await api.get('/users', {
        params: { ...params, page, limit: 100 },
      });
      everyone.push(...(data.data || []));
      if (!data.meta?.hasNext) return everyone;
    }
  },
  getById: (id) => api.get(`/users/${id}`),
  getProfile: (id) => api.get(`/users/${id}/profile`),
  create: (data) => api.post('/auth/register', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  toggleStatus: (id) => api.patch(`/users/${id}/toggle-status`),
  // A new password for a student, returned once for a printed slip.
  issueLoginSlip: (id) => api.post(`/users/${id}/login-slip`),
  // A student's results access: { mode: 'auto' | 'open' | 'withheld', note }.
  getResultsAccess: (id) => api.get(`/users/${id}/results-access`),
  setResultsAccess: (id, data) =>
    api.put(`/users/${id}/results-access`, data),
  delete: (id) => api.delete(`/users/${id}`),
  uploadAvatar: (id, file) => {
    const form = new FormData();
    form.append('avatar', file);
    return api.post(`/users/${id}/avatar`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getByClass: (classId) => api.get(`/users/students/class/${classId}`),

  // Bulk import is two steps on purpose: preview writes nothing, commit does.
  importPreview: (file, role) => {
    const form = new FormData();
    form.append('file', file);
    form.append('role', role);
    return api.post('/users/import/preview', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  // Longer than the default: each account costs a bcrypt hash, and a parent on
  // the row costs a second one.
  importCommit: (rows, role) =>
    api.post('/users/import', { rows, role }, { timeout: 120000 }),
};

export const classService = {
  getAll: (params) => api.get('/classes', { params }),
  getById: (id) => api.get(`/classes/${id}`),
  create: (data) => api.post('/classes', data),
  update: (id, data) => api.put(`/classes/${id}`, data),
  delete: (id) => api.delete(`/classes/${id}`),
};

export const subjectService = {
  getAll: (params) => api.get('/subjects', { params }),
  create: (data) => api.post('/subjects', data),
  update: (id, data) => api.put(`/subjects/${id}`, data),
};

export const attendanceService = {
  mark: (data) => api.post('/attendance/mark', data),
  // One day's register: the class list plus whatever was already marked, so
  // reopening the page never silently resets everyone to Present.
  getClassRegister: (classId, params) =>
    api.get(`/attendance/class/${classId}`, { params }),
  getClassReport: (classId, params) =>
    api.get(`/attendance/class/${classId}/report`, { params }),
  // Only the classes the signed-in teacher may mark a register for.
  getMyClasses: () => api.get('/attendance/my-classes'),
  getStudentSummary: (studentId, params) =>
    api.get(`/attendance/student/${studentId}/summary`, { params }),
};

export const examService = {
  getAll: (params) => api.get('/exams', { params }),
  create: (data) => api.post('/exams', data),
  update: (id, data) => api.put(`/exams/${id}`, data),
  delete: (id) => api.delete(`/exams/${id}`),
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
  // What each fee still owes, split by how the money arrived. The authority
  // on whether a fee is settled — an individual part-payment record is not.
  getBalances: (studentId, params) =>
    api.get(`/payments/balance/${studentId}`, { params }),
  getReport: (params) => api.get('/payments/report', { params }),
};

export const assignmentService = {
  getAll: (params) => api.get('/assignments', { params }),
  getById: (id) => api.get(`/assignments/${id}`),
  create: (data) => {
    const form = new FormData();

    Object.entries(data).forEach(([key, value]) => {
      if (key === 'attachments' && Array.isArray(value)) {
        value.forEach((file) => {
          form.append('attachments', file);
        });
      } else if (value !== undefined && value !== null) {
        form.append(key, value);
      }
    });

    return api.post('/assignments', form, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  update: (id, data) => {
    const form = new FormData();

    Object.entries(data).forEach(([key, value]) => {
      if (key === 'attachments' && Array.isArray(value)) {
        value.forEach((file) => {
          form.append('attachments', file);
        });
      } else if (value !== undefined && value !== null) {
        form.append(key, value);
      }
    });

    return api.put(`/assignments/${id}`, form, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  publish: (id) => api.patch(`/assignments/${id}/publish`),
  delete: (id) => api.delete(`/assignments/${id}`),
};

export const submissionService = {
  submit: (data) => {
    const form = new FormData();

    form.append('assignmentId', data.assignmentId);

    if (data.comment) {
      form.append('comment', data.comment);
    }

    (data.files || []).forEach((file) => {
      form.append('files', file);
    });

    return api.post('/submissions', form, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  grade: (id, data) => api.patch(`/submissions/${id}/grade`, data),
  getForAssignment: (assignmentId) =>
    api.get(`/submissions/assignment/${assignmentId}`),
  getById: (id) => api.get(`/submissions/${id}`),
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
  getChildrenAssignments: () => api.get('/parents/children/assignments'),
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
  getStudentSchedules: (params) =>
    api.get('/exam-schedules/student/my-schedules', { params }),
  getParentSchedules: (params) =>
    api.get('/exam-schedules/parent/children-schedules', { params }),
  checkConflicts: (data) => api.post('/exam-schedules/check-conflicts', data),
};

export const caTrackingService = {
  sync: (data) => api.post('/ca-tracking/sync', data),
  syncClass: (data) => api.post('/ca-tracking/sync-class', data),
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
  getMyCertificates: () => api.get('/certificates/student/my-certificates'),
  getChildrenCertificates: () =>
    api.get('/certificates/parent/children-certificates'),
  revoke: (id, data) => api.put(`/certificates/${id}/revoke`, data),
  // The document itself. Asked for as a blob: it is a PDF, and it needs the
  // caller's token, which a plain link cannot carry.
  download: (id) =>
    api.get(`/certificates/${id}/download`, { responseType: 'blob' }),
};

export const taskService = {
  // Admin
  create: (data) => api.post('/tasks', data),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  review: (id, data) => api.post(`/tasks/${id}/review`, data),
  cancel: (id, data) => api.patch(`/tasks/${id}/cancel`, data),
  delete: (id) => api.delete(`/tasks/${id}`),
  // Teacher — the server scopes the list to the caller, so there is no
  // "my tasks" endpoint to get wrong.
  start: (id) => api.patch(`/tasks/${id}/start`),
  submit: (id, data) => api.post(`/tasks/${id}/submit`, data),
  // Both
  getAll: (params) => api.get('/tasks', { params }),
  getById: (id) => api.get(`/tasks/${id}`),
  getStats: () => api.get('/tasks/stats'),
};

export const staffAttendanceService = {
  // The caller's own clock. There is no endpoint that clocks somebody else
  // in — that is the point of a clock — so none of these take a staff id.
  getToday: () => api.get('/staff-attendance/today'),
  clockIn: (data) => api.post('/staff-attendance/clock-in', data),
  clockOut: (data) => api.post('/staff-attendance/clock-out', data),
  getMine: (params) => api.get('/staff-attendance/me', { params }),

  // Admin oversight.
  getDaily: (params) => api.get('/staff-attendance/daily', { params }),
  getSummary: (params) => api.get('/staff-attendance/summary', { params }),
  getAll: (params) => api.get('/staff-attendance', { params }),
  mark: (data) => api.post('/staff-attendance/mark', data),
  update: (id, data) => api.patch(`/staff-attendance/${id}`, data),
  delete: (id) => api.delete(`/staff-attendance/${id}`),
};

export const searchService = {
  query: (q, params, config) =>
    api.get('/search', { params: { q, ...params }, ...config }),
  getScopes: () => api.get('/search/scopes'),
};

export const auditService = {
  getLog: (params) => api.get('/audit', { params }),
  getSummary: (params) => api.get('/audit/summary', { params }),
  getActions: () => api.get('/audit/actions'),
  getStudentHistory: (studentId) => api.get(`/audit/student/${studentId}`),
  getEntityHistory: (entity, entityId) =>
    api.get(`/audit/entity/${entity}/${entityId}`),
};
