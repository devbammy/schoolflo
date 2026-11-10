import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  KeyRound,
  Plus,
  ShieldAlert,
  UserCheck,
  UserX,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { userService } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import useAuthStore from '../../store/authStore';

/**
 * Who runs the portal.
 *
 * There was no way to add a second admin at all: `pnpm seed` makes the first
 * one and then refuses, and its message pointed at a page that did not exist.
 * A school with one admin is one forgotten password, or one person on leave,
 * away from nobody being able to enrol a child or record a payment.
 *
 * No routes of its own. It creates through POST /auth/register with role
 * Admin, which sends the welcome email, and switches access through the same
 * toggle as every other account. The server refuses an admin deactivating
 * themselves and refuses to deactivate the last active admin, so the school
 * cannot lock itself out from here (tests/integration/administrators.test.js).
 */

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
};

// Read once, by a person setting up an account, so legible beats short: no
// O/0 or l/1/I, as on the generated import passwords.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const generatePassword = (length = 12) => {
  const bytes = new Uint32Array(length);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
};

const fmtDate = (d) => (d ? format(new Date(d), 'dd MMM yyyy') : '—');

export default function AdministratorsPage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toggleTarget, setToggleTarget] = useState(null);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userService.getAll({ role: 'Admin', limit: 100 });
      setAdmins(res.data.data || []);
    } catch {
      toast.error('Could not load the administrators');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeCount = admins.filter((a) => a.isActive).length;
  const isMe = (a) => String(a._id) === String(me?._id);

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, password: generatePassword() });
    setAdding(true);
  };

  const setField = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await userService.create({ ...form, role: 'Admin' });
      toast.success(
        `${form.firstName} is now an administrator. Their password has been emailed to them.`,
      );
      setAdding(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not add the admin');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await userService.toggleStatus(toggleTarget._id);
      toast.success(res.data.message);
      setToggleTarget(null);
      load();
    } catch (err) {
      // The server's own reason, e.g. "the last active admin", is the one
      // worth reading here.
      toast.error(err.response?.data?.message || 'Could not change access');
    } finally {
      setToggling(false);
    }
  };

  const deactivating = toggleTarget?.isActive;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Administrators</h1>
          <p className="page-header__subtitle">
            {activeCount} active admin{activeCount === 1 ? '' : 's'} · full
            access to the whole portal
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn--primary" onClick={openAdd}>
            <Plus size={16} /> Add Administrator
          </button>
        </div>
      </div>

      <div
        className="card"
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          padding: '14px 18px',
          marginBottom: 20,
        }}
      >
        <ShieldAlert
          size={20}
          style={{ color: 'var(--clr-warning)', flexShrink: 0, marginTop: 2 }}
        />
        <p
          style={{
            margin: 0,
            fontSize: '0.875rem',
            color: 'var(--clr-text-2)',
            lineHeight: 1.55,
            minWidth: 0,
          }}
        >
          An administrator can see and change everything: every child&apos;s
          records, fees and payments, and every account, including other admins.
          Add only people who need it. Deactivating an admin signs them out at
          once; you can reactivate them later. You cannot deactivate yourself,
          and the last active admin cannot be deactivated.
        </p>
      </div>

      <div className="card">
        <div
          className="table-wrapper"
          style={{ border: 'none', borderRadius: 0 }}
        >
          <table className="table">
            <thead>
              <tr>
                <th>Administrator</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Last signed in</th>
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 32 }}>
                    <span className="spinner" />
                  </td>
                </tr>
              ) : admins.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: 'center',
                      padding: 32,
                      color: 'var(--clr-text-3)',
                    }}
                  >
                    No administrators found.
                  </td>
                </tr>
              ) : (
                admins.map((a) => (
                  <tr key={a._id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {a.firstName} {a.lastName}{' '}
                        {isMe(a) && (
                          <span className="badge badge--info">You</span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: '0.8125rem',
                          color: 'var(--clr-text-3)',
                          wordBreak: 'break-all',
                        }}
                      >
                        {a.email}
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{a.phone || '—'}</td>
                    <td>
                      <span
                        className={`badge badge--${a.isActive ? 'success' : 'danger'}`}
                      >
                        {a.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td
                      style={{
                        color: 'var(--clr-text-3)',
                        fontSize: '0.875rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {a.lastLogin ? fmtDate(a.lastLogin) : 'Never'}
                    </td>
                    <td
                      style={{
                        color: 'var(--clr-text-3)',
                        fontSize: '0.875rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {fmtDate(a.createdAt)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn--ghost btn--sm btn--icon"
                          onClick={() => navigate(`/admin/users/${a._id}`)}
                          title="View profile"
                        >
                          <Eye size={14} />
                        </button>
                        {/* No switch on your own row: the server refuses it,
                            and a button that only ever errors is a trap. */}
                        {!isMe(a) && (
                          <button
                            className="btn btn--ghost btn--sm btn--icon"
                            onClick={() => setToggleTarget(a)}
                            title={a.isActive ? 'Deactivate' : 'Reactivate'}
                          >
                            {a.isActive ? (
                              <UserX size={14} />
                            ) : (
                              <UserCheck size={14} />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add an administrator"
        maxWidth={620}
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => setAdding(false)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
              type="submit"
              form="add-admin-form"
              disabled={saving}
            >
              {saving ? 'Adding…' : 'Add Administrator'}
            </button>
          </>
        }
      >
        <form id="add-admin-form" onSubmit={handleAdd}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(min(220px, 100%), 1fr))',
              gap: 16,
            }}
          >
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="admin-first">First name</label>
              <input
                id="admin-first"
                className="form-control"
                required
                value={form.firstName}
                onChange={setField('firstName')}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="admin-last">Last name</label>
              <input
                id="admin-last"
                className="form-control"
                required
                value={form.lastName}
                onChange={setField('lastName')}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="admin-email">Email</label>
              <input
                id="admin-email"
                type="email"
                className="form-control"
                required
                value={form.email}
                onChange={setField('email')}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="admin-phone">Phone (optional)</label>
              <input
                id="admin-phone"
                type="tel"
                className="form-control"
                value={form.phone}
                onChange={setField('phone')}
              />
            </div>
            <div
              className="form-group"
              style={{ marginBottom: 0, gridColumn: '1 / -1' }}
            >
              <label htmlFor="admin-password">Starting password</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  id="admin-password"
                  className="form-control"
                  style={{ flex: '1 1 200px', minWidth: 0 }}
                  required
                  minLength={8}
                  value={form.password}
                  onChange={setField('password')}
                  autoComplete="new-password"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() =>
                    setForm((f) => ({ ...f, password: generatePassword() }))
                  }
                >
                  <KeyRound size={14} /> New password
                </button>
              </div>
            </div>
          </div>
          <p
            style={{
              fontSize: '0.8125rem',
              color: 'var(--clr-text-3)',
              marginBottom: 0,
            }}
          >
            The password is emailed to them with the sign-in link. They should
            change it after signing in, from the menu under their name.
          </p>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        onClose={() => setToggleTarget(null)}
        onConfirm={handleToggle}
        title={
          deactivating
            ? 'Deactivate administrator?'
            : 'Reactivate administrator?'
        }
        message={
          deactivating
            ? `${toggleTarget?.firstName} ${toggleTarget?.lastName} will be signed out everywhere and will not be able to sign in. You can reactivate them later.`
            : `${toggleTarget?.firstName} ${toggleTarget?.lastName} will be able to sign in again, with full admin access.`
        }
        confirmLabel={deactivating ? 'Deactivate' : 'Reactivate'}
        danger={deactivating}
        loading={toggling}
      />
    </>
  );
}
