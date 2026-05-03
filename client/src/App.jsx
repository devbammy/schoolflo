import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './store/authStore';
import api from './services/api';
import './styles/main.scss';

// Auth Pages
import LoginPage from './pages/auth/LoginPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';

// Layout
import DashboardLayout from './components/layout/DashboardLayout';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import StudentsPage from './pages/admin/StudentsPage';
import TeachersPage from './pages/admin/TeachersPage';
import ParentsPage from './pages/admin/ParentsPage';
import ClassesPage from './pages/admin/ClassesPage';
import SubjectsPage from './pages/admin/SubjectsPage';
import FeesPage from './pages/admin/FeesPage';
import PaymentsPage from './pages/admin/PaymentsPage';
import AnnouncementsPage from './pages/admin/AnnouncementsPage';
import ResultsAdminPage from './pages/admin/ResultsAdminPage';
import TimetablePage from './pages/admin/TimetablePage';
import LibraryPage from './pages/admin/LibraryPage';
import AcademicCalendarPage from './pages/admin/AcademicCalendarPage';
import ExamSchedules from './pages/admin/ExamSchedules';
import Promotions from './pages/admin/Promotions';
import Certificates from './pages/admin/Certificates';

// Teacher Pages
import TeacherDashboard from './pages/teacher/TeacherDashboard';
import AttendancePage from './pages/teacher/AttendancePage';
import AssignmentsTeacherPage from './pages/teacher/AssignmentsPage';
import GradesPage from './pages/teacher/GradesPage';
import TeacherTimetable from './pages/teacher/TeacherTimetable';

// Student Pages
import StudentDashboard from './pages/student/StudentDashboard';
import StudentResults from './pages/student/StudentResults';
import StudentAssignments from './pages/student/StudentAssignments';
import StudentPayments from './pages/student/StudentPayments';
import StudentTimetable from './pages/student/StudentTimetable';
import CATracking from './pages/student/CATracking';

// Parent Pages
import ParentDashboard from './pages/parent/ParentDashboard';
import ParentResults from './pages/parent/ParentResults';
import ParentPayments from './pages/parent/ParentPayments';
import ParentTimetable from './pages/parent/ParentTimetable';

// Shared Pages
import MyLibraryPage from './pages/shared/MyLibraryPage';
import CalendarViewPage from './pages/shared/CalendarViewPage';
import ViewResults from './pages/shared/ViewResults';

// Guards
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/unauthorized" replace />;
  }
  return children;
};

const RoleRedirect = () => {
  const { user } = useAuthStore();

  const map = {
    Admin: '/admin',
    Teacher: '/teacher',
    Student: '/student',
    Parent: '/parent',
  };
  return <Navigate to={map[user?.role] || '/login'} replace />;
};

export default function App() {
  const { accessToken } = useAuthStore();

  useEffect(() => {
    if (accessToken) {
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    }
  }, [accessToken]);

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

      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

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
          <Route path="parents" element={<ParentsPage />} />
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
          <Route path="timetable" element={<ParentTimetable />} />
          <Route path="calendar" element={<CalendarViewPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="print-results" element={<ViewResults />} />
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
              <p>You don't have permission to view this page.</p>
            </div>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
