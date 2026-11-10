import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  DollarSign,
  Bell,
  ClipboardList,
  Calendar,
  FileText,
  BarChart3,
  Menu,
  School,
  CreditCard,
  Heart,
  BookMarked,
  CalendarDays,
  CalendarCheck,
  Medal,
  ShieldCheck,
  Printer,
  BookCheck,
  ScrollText,
  CheckSquare,
  UserRoundCheck,
  Timer,
  UserCog,
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import useFeatureStore from '../../store/featureStore';
import GlobalSearch from '../common/GlobalSearch';
import QuickActionsModal from '../common/QuickActionsModal';
import ChangePasswordModal from '../common/ChangePasswordModal';
import UserMenu from './UserMenu';

const NAV_CONFIG = {
  Admin: [
    {
      section: 'Overview',
      items: [
        { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
      ],
    },
    {
      section: 'People',
      items: [
        { to: '/admin/students', icon: Users, label: 'Students' },
        { to: '/admin/teachers', icon: GraduationCap, label: 'Teachers' },
        { to: '/admin/parents', icon: Heart, label: 'Parents' },
        {
          to: '/admin/administrators',
          icon: UserCog,
          label: 'Administrators',
        },
      ],
    },
    {
      section: 'Academic',
      items: [
        { to: '/admin/classes', icon: School, label: 'Classes' },
        { to: '/admin/subjects', icon: BookOpen, label: 'Subjects' },
        {
          to: '/admin/calendar',
          icon: CalendarDays,
          label: 'Academic Calendar',
        },
        { to: '/admin/timetables', icon: Calendar, label: 'Timetables' },
        { to: '/admin/results', icon: BarChart3, label: 'Results & Reports' },
        { to: '/admin/library', icon: BookMarked, label: 'Library' },
        {
          label: 'Exam Schedules',
          icon: CalendarCheck,
          to: '/admin/exam-schedules',
        },
        {
          label: 'Promotions',
          icon: Medal,
          to: '/admin/promotions',
        },
        {
          label: 'Certificates',
          icon: ShieldCheck,
          to: '/admin/certificates',
        },
      ],
    },
    {
      section: 'Finance',
      items: [
        { to: '/admin/fees', icon: DollarSign, label: 'Fee Structures' },
        { to: '/admin/payments', icon: CreditCard, label: 'Payments' },
      ],
    },
    {
      section: 'Comms',
      items: [
        { to: '/admin/announcements', icon: Bell, label: 'Announcements' },
      ],
    },
    {
      section: 'Oversight',
      items: [
        { to: '/admin/tasks', icon: CheckSquare, label: 'Tasks & Approvals' },
        {
          to: '/admin/staff-attendance',
          icon: UserRoundCheck,
          label: 'Staff Attendance',
          feature: 'staffAttendance',
        },
        { to: '/admin/audit', icon: ScrollText, label: 'Audit Log' },
      ],
    },
  ],

  Teacher: [
    {
      section: 'Overview',
      items: [
        {
          to: '/teacher',
          icon: LayoutDashboard,
          label: 'Dashboard',
          end: true,
        },
      ],
    },
    {
      section: 'Classroom',
      items: [
        { to: '/teacher/attendance', icon: Users, label: 'Attendance' },
        { to: '/teacher/grades', icon: BarChart3, label: 'Grades & Results' },
        {
          to: '/teacher/assignments',
          icon: ClipboardList,
          label: 'Assignments',
        },
        { to: '/teacher/timetable', icon: Calendar, label: 'My Timetable' },
        {
          to: '/teacher/exam-schedules',
          icon: CalendarCheck,
          label: 'Exam Schedules',
        },
        {
          to: '/teacher/calendar',
          icon: CalendarDays,
          label: 'School Calendar',
        },
        { to: '/teacher/library', icon: BookMarked, label: 'Library' },
        { to: '/teacher/tasks', icon: CheckSquare, label: 'My Tasks' },
        {
          to: '/teacher/clock',
          icon: Timer,
          label: 'Clock In / Out',
          feature: 'staffAttendance',
        },
      ],
    },
    {
      section: 'Comms',
      items: [
        { to: '/teacher/announcements', icon: Bell, label: 'Announcements' },
      ],
    },
  ],

  Student: [
    {
      section: 'Overview',
      items: [
        {
          to: '/student',
          icon: LayoutDashboard,
          label: 'Dashboard',
          end: true,
        },
      ],
    },
    {
      section: 'Academic',
      items: [
        { to: '/student/results', icon: FileText, label: 'My Results' },
        {
          to: '/student/assignments',
          icon: ClipboardList,
          label: 'Assignments',
        },
        { to: '/student/timetable', icon: Calendar, label: 'Timetable' },
        {
          to: '/student/exam-schedules',
          icon: CalendarCheck,
          label: 'Exam Schedules',
        },
        {
          to: '/student/calendar',
          icon: CalendarDays,
          label: 'School Calendar',
        },
        { to: '/student/library', icon: BookMarked, label: 'Library' },
        {
          label: 'CA Tracking',
          icon: BookCheck,
          to: '/student/ca-tracking',
        },
        {
          label: 'Print My Results',
          icon: Printer,
          to: '/student/print-results',
        },
        {
          label: 'My Certificates',
          icon: ShieldCheck,
          to: '/student/certificates',
        },
      ],
    },
    {
      section: 'Finance',
      items: [{ to: '/student/payments', icon: CreditCard, label: 'Payments' }],
    },
    {
      section: 'Comms',
      items: [
        { to: '/student/announcements', icon: Bell, label: 'Announcements' },
      ],
    },
  ],

  Parent: [
    {
      section: 'Overview',
      items: [
        { to: '/parent', icon: LayoutDashboard, label: 'Dashboard', end: true },
      ],
    },
    {
      section: 'My Children',
      items: [
        { to: '/parent/results', icon: BarChart3, label: 'Academic Results' },
        {
          to: '/parent/assignments',
          icon: ClipboardList,
          label: 'Assignments',
        },
        { to: '/parent/payments', icon: CreditCard, label: 'Fee Payments' },
        { to: '/parent/timetable', icon: Calendar, label: 'Timetables' },
        {
          to: '/parent/exam-schedules',
          icon: CalendarCheck,
          label: 'Exam Schedules',
        },
        {
          to: '/parent/calendar',
          icon: CalendarDays,
          label: 'School Calendar',
        },
        {
          label: 'Certificates',
          icon: ShieldCheck,
          to: '/parent/certificates',
        },
        {
          label: 'Print My Results',
          icon: Printer,
          to: '/parent/print-results',
        },
      ],
    },
    {
      section: 'Comms',
      items: [
        { to: '/parent/announcements', icon: Bell, label: 'Announcements' },
      ],
    },
  ],
};

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const features = useFeatureStore((s) => s.features);
  const schoolName = useFeatureStore((s) => s.school?.name);
  const roleHome = user?.role ? `/${user.role.toLowerCase()}` : '/';

  // Drop entries this school does not run, and any section left empty by
  // that — a heading over nothing reads as a broken page.
  const navItems = (NAV_CONFIG[user?.role] || [])
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.feature || features[item.feature] !== false,
      ),
    }))
    .filter((section) => section.items.length > 0);

  const handleLogout = async () => {
    // Awaited so the server-side session is revoked before we navigate away.
    await logout();
    navigate('/login');
  };

  const SidebarContent = () => (
    <>
      <div className="sidebar__logo">
        <div className="sidebar__logo-icon">S</div>
        {!collapsed && (
          <div className="sidebar__logo-text">SchoolFlo</div>
        )}
      </div>

      <nav className="sidebar__nav">
        {navItems.map((section) => (
          <div key={section.section}>
            {!collapsed && (
              <div className="sidebar__section-label">{section.section}</div>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `sidebar__item${isActive ? ' active' : ''}`
                }
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.label : ''}
              >
                <item.icon size={18} />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <div className="app-layout">
      {/* Desktop Sidebar */}
      <aside
        className={`sidebar hidden-mobile ${collapsed ? 'collapsed' : ''}`}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div
          className="mobile-drawer"
          style={{ position: 'fixed', inset: 0, zIndex: 150 }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
            }}
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="sidebar"
            style={{ position: 'relative', zIndex: 151 }}
          >
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className={`main-content ${collapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Topbar */}
        <header className={`topbar ${collapsed ? 'sidebar-collapsed' : ''}`}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flex: 1,
              minWidth: 0,
            }}
          >
            <button
              className="btn btn--ghost btn--icon hidden-mobile"
              onClick={() => setCollapsed(!collapsed)}
              title="Toggle sidebar"
            >
              <Menu size={20} />
            </button>
            <button
              className="btn btn--ghost btn--icon only-mobile"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>

            <div className="topbar__school">
              <span className="topbar__school-mark" aria-hidden="true">
                {(schoolName || 'SchoolFlo')[0]}
              </span>
              <span className="topbar__school-name">
                {schoolName || 'SchoolFlo'}
              </span>
            </div>

            <GlobalSearch />
          </div>

          <div className="topbar__actions">
            {user?.role && (
              <button
                type="button"
                className="topbar__icon-btn"
                onClick={() => setQuickActionsOpen(true)}
                aria-label="Quick actions"
                title="Quick actions"
              >
                <LayoutGrid size={18} />
              </button>
            )}
            <NavLink
              to={`${roleHome}/announcements`}
              className="topbar__icon-btn"
              aria-label="Announcements"
              title="Announcements"
            >
              <Bell size={18} />
            </NavLink>
            <UserMenu
              user={user}
              onChangePassword={() => setPasswordOpen(true)}
              onLogout={handleLogout}
            />
          </div>
        </header>

        {/* Page Content */}
        <div className="page-wrapper">
          <main className="page-content">
            <Outlet />
          </main>
        </div>
      </div>

      <QuickActionsModal
        open={quickActionsOpen}
        onClose={() => setQuickActionsOpen(false)}
        role={user?.role}
      />

      <ChangePasswordModal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
      />
    </div>
  );
}
