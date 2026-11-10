import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './store/authStore';
import useFeatureStore, { useFeature } from './store/featureStore';
import api from './services/api';
import ErrorBoundary from './components/common/ErrorBoundary';
import './styles/main.scss';

// Layout and login are needed on first paint, so they stay in the main bundle.
import DashboardLayout from './components/layout/DashboardLayout';
import LoginPage from './pages/auth/LoginPage';

// Everything else is split per route. Previously all 45 pages were imported
// eagerly, so a parent checking one result downloaded the entire admin panel.
const ForgotPasswordPage = lazy(
  () => import('./pages/auth/ForgotPasswordPage'),
);
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Admin
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const StudentsPage = lazy(() => import('./pages/admin/StudentsPage'));
const TeachersPage = lazy(() => import('./pages/admin/TeachersPage'));
const AdministratorsPage = lazy(() =>
  import('./pages/admin/AdministratorsPage'),
);
const ParentsPage = lazy(() => import('./pages/admin/ParentsPage'));
const UserProfilePage = lazy(() => import('./pages/admin/UserProfilePage'));
const ClassesPage = lazy(() => import('./pages/admin/ClassesPage'));
const SubjectsPage = lazy(() => import('./pages/admin/SubjectsPage'));
const FeesPage = lazy(() => import('./pages/admin/FeesPage'));
const PaymentsPage = lazy(() => import('./pages/admin/PaymentsPage'));
const AnnouncementsPage = lazy(() => import('./pages/admin/AnnouncementsPage'));
const ResultsAdminPage = lazy(() => import('./pages/admin/ResultsAdminPage'));
const TimetablePage = lazy(() => import('./pages/admin/TimetablePage'));
const LibraryPage = lazy(() => import('./pages/admin/LibraryPage'));
const AcademicCalendarPage = lazy(
  () => import('./pages/admin/AcademicCalendarPage'),
);
const ExamSchedules = lazy(() => import('./pages/admin/ExamSchedules'));
const Promotions = lazy(() => import('./pages/admin/Promotions'));
const Certificates = lazy(() => import('./pages/admin/Certificates'));
const AuditLogPage = lazy(() => import('./pages/admin/AuditLogPage'));
const TasksPage = lazy(() => import('./pages/admin/TasksPage'));
const StaffAttendancePage = lazy(
  () => import('./pages/admin/StaffAttendancePage'),
);

// Teacher
const TeacherDashboard = lazy(() => import('./pages/teacher/TeacherDashboard'));
const AttendancePage = lazy(() => import('./pages/teacher/AttendancePage'));
const AssignmentsTeacherPage = lazy(
  () => import('./pages/teacher/AssignmentsPage'),
);
const GradesPage = lazy(() => import('./pages/teacher/GradesPage'));
const TeacherTimetable = lazy(() => import('./pages/teacher/TeacherTimetable'));
const MyTasksPage = lazy(() => import('./pages/teacher/MyTasksPage'));
const ClockPage = lazy(() => import('./pages/teacher/ClockPage'));
const TeacherExamSchedule = lazy(
  () => import('./pages/teacher/TeacherExamSchedule'),
);

// Student
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
const StudentResults = lazy(() => import('./pages/student/StudentResults'));
const StudentAssignments = lazy(
  () => import('./pages/student/StudentAssignments'),
);
const StudentPayments = lazy(() => import('./pages/student/StudentPayments'));
const StudentTimetable = lazy(() => import('./pages/student/StudentTimetable'));
const StudentExamSchedule = lazy(
  () => import('./pages/student/StudentExamSchedule'),
);
const StudentCertificates = lazy(
  () => import('./pages/student/StudentCertificates'),
);
const CATracking = lazy(() => import('./pages/student/CATracking'));

// Parent
const ParentDashboard = lazy(() => import('./pages/parent/ParentDashboard'));
const ParentResults = lazy(() => import('./pages/parent/ParentResults'));
const ParentPayments = lazy(() => import('./pages/parent/ParentPayments'));
const ParentTimetable = lazy(() => import('./pages/parent/ParentTimetable'));
const ParentExamSchedule = lazy(
  () => import('./pages/parent/ParentExamSchedule'),
);
const ParentAssignments = lazy(
  () => import('./pages/parent/ParentAssignments'),
);
const ParentCertificates = lazy(
  () => import('./pages/parent/ParentCertificates'),
);

// Shared
const MyLibraryPage = lazy(() => import('./pages/shared/MyLibraryPage'));
const CalendarViewPage = lazy(() => import('./pages/shared/CalendarViewPage'));
const ViewResults = lazy(() => import('./pages/shared/ViewResults'));
const PaymentVerifyPage = lazy(() => import('./pages/shared/PaymentVerifyPage'));

const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
    <div className="spinner" />
  </div>
);

// Guards
const ProtectedRoute = ({ children, allowedRoles }) => {
  // Selectors, so a guard does not re-render on every unrelated store change.
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.user?.role);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }
  return children;
};

/**
 * A route that belongs to a feature this school does not run.
 *
 * Hiding the nav entry is not enough: a bookmark, a link in an old email or a
 * typed URL still reaches the page, which would then sit there firing 404s at
 * a server that has no such route. Sending them home is the honest answer.
 */
const FeatureRoute = ({ feature, children }) => {
  const enabled = useFeature(feature);

  return enabled ? children : <Navigate to=".." replace />;
};

const RoleRedirect = () => {
  const role = useAuthStore((s) => s.user?.role);

  const map = {
    Admin: '/admin',
    Teacher: '/teacher',
    Student: '/student',
    Parent: '/parent',
  };
  return <Navigate to={map[role] || '/login'} replace />;
};

export default function App() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const loadFeatures = useFeatureStore((s) => s.load);
  const refreshFeatures = useFeatureStore((s) => s.refresh);
  const featuresLoaded = useFeatureStore((s) => s.loaded);

  useEffect(() => {
    if (accessToken) {
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    }
  }, [accessToken]);

  // Which features this school runs, before anything renders. Painting the
  // full navigation and then pulling items out of it as the answer arrives
  // looks like a bug to the person watching.
  useEffect(() => {
    loadFeatures();
  }, [loadFeatures]);

  // A teacher leaves the portal open all day. If the school's configuration
  // changes in that time, the tab would otherwise keep offering links to
  // routes the server has stopped serving until someone thought to reload.
  // Coming back to the tab is the cheapest honest moment to re-read.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshFeatures();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refreshFeatures]);

  if (!featuresLoaded) return <PageLoader />;

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            fontFamily: 'DM Sans, sans-serif',
            fontSize: '0.9375rem',
            borderRadius: '10px',
            boxShadow: '0 8px 30px rgba(15,28,63,0.15)',
          },
        }}
      />

      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route
              path="/reset-password/:token"
              element={<ResetPasswordPage />}
            />

            {/* Where the payment gateways send the payer back to. Any signed-in
                role can land here; the server checks the payment is theirs. */}
            <Route
              path="/payments/verify"
              element={
                <ProtectedRoute>
                  <PaymentVerifyPage />
                </ProtectedRoute>
              }
            />

            {/* Role redirect */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <RoleRedirect />
                </ProtectedRoute>
              }
            />

            {/* Admin */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="students" element={<StudentsPage />} />
              <Route path="teachers" element={<TeachersPage />} />
              <Route path="administrators" element={<AdministratorsPage />} />
              <Route path="parents" element={<ParentsPage />} />
              <Route path="users/:id" element={<UserProfilePage />} />
              <Route path="classes" element={<ClassesPage />} />
              <Route path="subjects" element={<SubjectsPage />} />
              <Route path="fees" element={<FeesPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="results" element={<ResultsAdminPage />} />
              <Route path="timetables" element={<TimetablePage />} />
              <Route path="library" element={<LibraryPage />} />
              <Route path="calendar" element={<AcademicCalendarPage />} />
              <Route path="announcements" element={<AnnouncementsPage />} />
              <Route path="exam-schedules" element={<ExamSchedules />} />
              <Route path="promotions" element={<Promotions />} />
              <Route path="certificates" element={<Certificates />} />
              <Route path="audit" element={<AuditLogPage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route
                path="staff-attendance"
                element={
                  <FeatureRoute feature="staffAttendance">
                    <StaffAttendancePage />
                  </FeatureRoute>
                }
              />
            </Route>

            {/* Teacher */}
            <Route
              path="/teacher"
              element={
                <ProtectedRoute allowedRoles={['Teacher']}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<TeacherDashboard />} />
              <Route path="attendance" element={<AttendancePage />} />
              <Route path="assignments" element={<AssignmentsTeacherPage />} />
              <Route path="grades" element={<GradesPage />} />
              <Route path="library" element={<MyLibraryPage />} />
              <Route path="announcements" element={<AnnouncementsPage />} />
              <Route path="calendar" element={<CalendarViewPage />} />
              <Route path="timetable" element={<TeacherTimetable />} />
              <Route path="exam-schedules" element={<TeacherExamSchedule />} />
              <Route path="tasks" element={<MyTasksPage />} />
              <Route
                path="clock"
                element={
                  <FeatureRoute feature="staffAttendance">
                    <ClockPage />
                  </FeatureRoute>
                }
              />
            </Route>

            {/* Student */}
            <Route
              path="/student"
              element={
                <ProtectedRoute allowedRoles={['Student']}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<StudentDashboard />} />
              <Route path="results" element={<StudentResults />} />
              <Route path="assignments" element={<StudentAssignments />} />
              <Route path="payments" element={<StudentPayments />} />
              <Route path="library" element={<MyLibraryPage />} />
              <Route path="timetable" element={<StudentTimetable />} />
              <Route path="calendar" element={<CalendarViewPage />} />
              <Route path="announcements" element={<AnnouncementsPage />} />
              <Route path="print-results" element={<ViewResults />} />
              <Route path="ca-tracking" element={<CATracking />} />
              <Route path="exam-schedules" element={<StudentExamSchedule />} />
              <Route path="certificates" element={<StudentCertificates />} />
            </Route>

            {/* Parent */}
            <Route
              path="/parent"
              element={
                <ProtectedRoute allowedRoles={['Parent']}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<ParentDashboard />} />
              <Route path="results" element={<ParentResults />} />
              <Route path="payments" element={<ParentPayments />} />
              <Route path="assignments" element={<ParentAssignments />} />
              <Route path="timetable" element={<ParentTimetable />} />
              <Route path="calendar" element={<CalendarViewPage />} />
              <Route path="announcements" element={<AnnouncementsPage />} />
              <Route path="print-results" element={<ViewResults />} />
              <Route path="exam-schedules" element={<ParentExamSchedule />} />
              <Route path="certificates" element={<ParentCertificates />} />
            </Route>

            <Route
              path="/unauthorized"
              element={
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    gap: 16,
                  }}
                >
                  <h2>Access Denied</h2>
                  <p>You don&apos;t have permission to view this page.</p>
                </div>
              }
            />

            {/* A real 404 — this used to redirect to '/', which hid typos and
                broken links behind a silent bounce to the dashboard. */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
