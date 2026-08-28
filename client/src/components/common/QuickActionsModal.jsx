import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  GraduationCap,
  Heart,
  Bell,
  School,
  BookOpen,
  DollarSign,
  CreditCard,
  CalendarCheck,
  CalendarDays,
  BookMarked,
  CheckSquare,
  ClipboardList,
  UserCheck,
  BarChart3,
  Timer,
  FileText,
  Printer,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import Modal from './Modal';

/**
 * Config is keyed by role. Every entry points at the page that already owns the
 * relevant form or workflow — this modal never re-implements one.
 *
 * `action` (optional) is the key the destination page hands to `useQuickAction`,
 * so a create form springs open the moment that page mounts. Entries without an
 * `action` are plain shortcuts: they just navigate.
 */
const CONFIG = {
  Admin: [
    {
      heading: 'People',
      actions: [
        {
          action: 'student',
          to: '/admin/students',
          icon: Users,
          label: 'Add Student',
          hint: 'Enrol a new student',
        },
        {
          action: 'teacher',
          to: '/admin/teachers',
          icon: GraduationCap,
          label: 'Add Teacher',
          hint: 'Register a staff member',
        },
        {
          action: 'parent',
          to: '/admin/parents',
          icon: Heart,
          label: 'Add Parent',
          hint: 'Create a guardian account',
        },
      ],
    },
    {
      heading: 'Academic',
      actions: [
        {
          action: 'class',
          to: '/admin/classes',
          icon: School,
          label: 'Add Class',
          hint: 'Create a class or section',
        },
        {
          action: 'subject',
          to: '/admin/subjects',
          icon: BookOpen,
          label: 'Add Subject',
          hint: 'Define a subject',
        },
        {
          action: 'exam',
          to: '/admin/exam-schedules',
          icon: CalendarCheck,
          label: 'New Exam Schedule',
          hint: 'Schedule an exam sitting',
        },
        {
          action: 'event',
          to: '/admin/calendar',
          icon: CalendarDays,
          label: 'Add Calendar Event',
          hint: 'Add to the school calendar',
        },
        {
          action: 'book',
          to: '/admin/library',
          icon: BookMarked,
          label: 'Add Library Book',
          hint: 'Catalogue a new title',
        },
      ],
    },
    {
      heading: 'Finance',
      actions: [
        {
          action: 'fee',
          to: '/admin/fees',
          icon: DollarSign,
          label: 'New Fee Structure',
          hint: 'Set up billing for a term',
        },
        {
          action: 'payment',
          to: '/admin/payments',
          icon: CreditCard,
          label: 'Record Payment',
          hint: 'Log a manual payment',
        },
      ],
    },
    {
      heading: 'Operations',
      actions: [
        {
          action: 'announcement',
          to: '/admin/announcements',
          icon: Bell,
          label: 'New Announcement',
          hint: 'Post news to the school',
        },
        {
          action: 'task',
          to: '/admin/tasks',
          icon: CheckSquare,
          label: 'Assign Task',
          hint: 'Send work to a staff member',
        },
      ],
    },
  ],

  Teacher: [
    {
      heading: 'Classroom',
      actions: [
        {
          action: 'assignment',
          to: '/teacher/assignments',
          icon: ClipboardList,
          label: 'Create Assignment',
          hint: 'Set work for a class',
        },
        {
          to: '/teacher/attendance',
          icon: UserCheck,
          label: 'Mark Attendance',
          hint: "Take today's register",
        },
        {
          to: '/teacher/grades',
          icon: BarChart3,
          label: 'Enter Grades',
          hint: 'Record results & scores',
        },
      ],
    },
    {
      heading: 'My Day',
      actions: [
        {
          to: '/teacher/clock',
          icon: Timer,
          label: 'Clock In / Out',
          hint: 'Log your working hours',
        },
        {
          to: '/teacher/tasks',
          icon: CheckSquare,
          label: 'My Tasks',
          hint: 'Work assigned to you',
        },
        {
          to: '/teacher/exam-schedules',
          icon: CalendarCheck,
          label: 'Exam Schedules',
          hint: 'Upcoming exam sittings',
        },
      ],
    },
  ],

  Student: [
    {
      heading: 'Academic',
      actions: [
        {
          to: '/student/assignments',
          icon: ClipboardList,
          label: 'Submit Assignment',
          hint: 'Upload your work',
        },
        {
          to: '/student/results',
          icon: FileText,
          label: 'View My Results',
          hint: 'Latest scores & reports',
        },
        {
          to: '/student/timetable',
          icon: Calendar,
          label: 'My Timetable',
          hint: "This week's lessons",
        },
        {
          to: '/student/exam-schedules',
          icon: CalendarCheck,
          label: 'Exam Schedules',
          hint: 'When your exams are',
        },
      ],
    },
    {
      heading: 'More',
      actions: [
        {
          to: '/student/payments',
          icon: CreditCard,
          label: 'Make a Payment',
          hint: 'Pay outstanding fees',
        },
        {
          to: '/student/library',
          icon: BookMarked,
          label: 'Browse Library',
          hint: 'Find & borrow books',
        },
        {
          to: '/student/print-results',
          icon: Printer,
          label: 'Print Results',
          hint: 'Download a report sheet',
        },
      ],
    },
  ],

  Parent: [
    {
      heading: 'My Children',
      actions: [
        {
          to: '/parent/payments',
          icon: CreditCard,
          label: 'Make a Payment',
          hint: 'Settle school fees',
        },
        {
          to: '/parent/results',
          icon: BarChart3,
          label: 'View Results',
          hint: 'Academic performance',
        },
        {
          to: '/parent/assignments',
          icon: ClipboardList,
          label: 'View Assignments',
          hint: 'What has been set',
        },
      ],
    },
    {
      heading: 'More',
      actions: [
        {
          to: '/parent/timetable',
          icon: Calendar,
          label: 'Timetables',
          hint: "Your children's lessons",
        },
        {
          to: '/parent/exam-schedules',
          icon: CalendarCheck,
          label: 'Exam Schedules',
          hint: 'Upcoming exam sittings',
        },
        {
          to: '/parent/certificates',
          icon: ShieldCheck,
          label: 'Certificates',
          hint: 'Awards & documents',
        },
      ],
    },
  ],
};

export default function QuickActionsModal({ open, onClose, role }) {
  const navigate = useNavigate();
  const groups = CONFIG[role] || [];

  const run = (item) => {
    onClose();
    navigate(
      item.to,
      item.action ? { state: { quickAction: item.action } } : undefined,
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Quick Actions" maxWidth={640}>
      <div className="quick-actions">
        {groups.map((group) => (
          <div key={group.heading} className="quick-actions__group">
            <div className="quick-actions__heading">{group.heading}</div>
            <div className="quick-actions__grid">
              {group.actions.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="quick-action"
                  onClick={() => run(item)}
                >
                  <span className="quick-action__icon">
                    <item.icon size={18} />
                  </span>
                  <span className="quick-action__text">
                    <span className="quick-action__label">{item.label}</span>
                    <span className="quick-action__hint">{item.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
