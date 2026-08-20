import React from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../store/authStore';

const ROLE_HOME = {
  Admin: '/admin',
  Teacher: '/teacher',
  Student: '/student',
  Parent: '/parent',
};

/**
 * A real 404. The catch-all route used to redirect to '/', which silently
 * swallowed typos and broken links — a mistyped URL looked identical to a
 * successful navigation.
 */
export default function NotFound() {
  const { user, isAuthenticated } = useAuthStore();
  const home = isAuthenticated ? ROLE_HOME[user?.role] || '/' : '/login';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '70vh',
        gap: 12,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 56, fontWeight: 800, margin: 0, color: '#1a4fab' }}>
        404
      </p>
      <h2 style={{ margin: 0 }}>We couldn&apos;t find that page</h2>
      <p style={{ color: '#7889a8', maxWidth: 420 }}>
        The link may be out of date, or the page may have moved.
      </p>
      <Link to={home} className="btn btn--primary" style={{ marginTop: 8 }}>
        {isAuthenticated ? 'Back to dashboard' : 'Go to login'}
      </Link>
    </div>
  );
}
