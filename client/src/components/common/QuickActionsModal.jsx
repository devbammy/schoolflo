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
} from 'lucide-react';
import Modal from './Modal';

/**
 * Every shortcut points at the page that already owns the relevant create form.
 * `action` is the key the destination page hands to `useQuickAction`, so the
 * form opens the moment the page mounts — the modal never re-implements a form.
 */
const GROUPS = [
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
];

export default function QuickActionsModal({ open, onClose }) {
  const navigate = useNavigate();

  const run = (item) => {
    onClose();
    navigate(item.to, { state: { quickAction: item.action } });
  };

  return (
    <Modal open={open} onClose={onClose} title="Quick Actions" maxWidth={640}>
      <div className="quick-actions">
        {GROUPS.map((group) => (
          <div key={group.heading} className="quick-actions__group">
            <div className="quick-actions__heading">{group.heading}</div>
            <div className="quick-actions__grid">
              {group.actions.map((item) => (
                <button
                  key={item.action}
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
