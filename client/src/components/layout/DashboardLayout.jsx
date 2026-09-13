import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
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
  LogOut,
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
  Zap,
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import useFeatureStore from '../../store/featureStore';
import GlobalSearch from '../common/GlobalSearch';
import QuickActionsModal from '../common/QuickActionsModal';

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

const ROLE_COLORS = {
  Admin: '#7C3AED',
  Teacher: '#0891B2',
  Student: '#1A4FAB',
  Parent: '#059669',
};

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const features = useFeatureStore((s) => s.features);

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
  const initials = user ? `${user.firstName[0]}${user.lastName[0]}` : '?';

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
          <div className="sidebar__logo-text">
            SchoolPortal
            <span>Management System</span>
          </div>
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

      <div className="sidebar__footer">
        <div className="sidebar__user">
          <div
            className="sidebar__avatar"
            style={{ background: ROLE_COLORS[user?.role] || '#1A4FAB' }}
          >
            {user?.avatar?.url ? (
              <img
                src={user.avatar.url}
                alt={initials}
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              initials
            )}
          </div>
          {!collapsed && (
            <div
              className="sidebar__user-info"
              style={{ flex: 1, overflow: 'hidden' }}
            >
              <div className="sidebar__user-name">
                {user?.firstName} {user?.lastName}
              </div>
              <div className="sidebar__user-role">{user?.role}</div>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
                padding: '4px',
              }}
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
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

            <GlobalSearch />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {user?.role && (
              <button
                className="btn btn--primary btn--sm"
                onClick={() => setQuickActionsOpen(true)}
              >
                <Zap size={15} />{' '}
                <span className="hidden-mobile">Quick Actions</span>
              </button>
            )}
            <span
              className="badge"
              style={{
                background: `${ROLE_COLORS[user?.role]}20`,
                color: ROLE_COLORS[user?.role],
              }}
            >
              {user?.role}
            </span>
            {/* Desktop only. On a phone this name competed with the menu
                button for the same row and won, squeezing the button to zero
                width — the icon was still "there" and still clickable, just
                0px wide, which read as an invisible button. The avatar and
                role badge already identify who is signed in. */}
            <div className="hidden-mobile" style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--clr-text-1)',
                  whiteSpace: 'nowrap',
                }}
              >
                {user?.firstName} {user?.lastName}
              </div>
            </div>
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
    </div>
  );
}
