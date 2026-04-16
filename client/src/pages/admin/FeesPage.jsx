import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Edit2, Trash2, DollarSign, Calendar } from 'lucide-react';
import { feeService, classService } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const TERMS = ['First Term', 'Second Term', 'Third Term'];
const EMPTY_ITEM = { label: '', amount: '', isCompulsory: true };
const EMPTY_FORM = {
  title: '',
  class: '',
  term: 'First Term',
  academicYear: '2024/2025',
  dueDate: '',
  lateFee: 0,
  items: [
    { ...EMPTY_ITEM, label: 'Tuition Fee' },
    { ...EMPTY_ITEM, label: 'Books & Materials' },
  ],
};

export default function FeesPage() {
  const [fees, setFees] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ term: '', academicYear: '' });
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.term) params.term = filters.term;
      if (filters.academicYear) params.academicYear = filters.academicYear;
      const res = await feeService.getAll(params);
      setFees(res.data.data?.fees || []);
    } catch {
      toast.error('Failed to load fee structures');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    classService.getAll().then((r) => setClasses(r.data.data.classes || []));
  }, []);

  const totalAmount = (items) =>
    items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setSelected(null);
    setModal('form');
  };
  const openEdit = (fee) => {
    setSelected(fee);
    setForm({
      title: fee.title,
      class: fee.class?._id || '',
      term: fee.term,
      academicYear: fee.academicYear,
      dueDate: fee.dueDate ? fee.dueDate.split('T')[0] : '',
      lateFee: fee.lateFee || 0,
      items: fee.items?.map((i) => ({
        label: i.label,
        amount: i.amount,
        isCompulsory: i.isCompulsory,
      })) || [EMPTY_ITEM],
    });
    setModal('form');
  };

  const setItem = (i, key, val) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((item, idx) =>
        idx === i ? { ...item, [key]: val } : item,
      ),
    }));
  const addItem = () =>
    setForm((f) => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }));
  const removeItem = (i) =>
    setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.class) return toast.error('Please select a class');
    if (!form.items.length) return toast.error('Add at least one fee item');
    if (!form.dueDate) return toast.error('Due date is required');
    setSaving(true);
    try {
      const payload = { ...form, totalAmount: totalAmount(form.items) };
      if (!selected) {
        await feeService.create(payload);
        toast.success('Fee structure created');
      } else {
        await feeService.update(selected._id, payload);
        toast.success('Fee structure updated');
      }
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await feeService.update(deleteTarget, { isActive: false });
      toast.success('Fee structure removed');
      setDeleteTarget(null);
      load();
    } catch {
      toast.error('Failed');
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Fee Structures</h1>
          <p className="page-header__subtitle">
            Define and manage school fees per class and term
          </p>
        </div>
        <button className="btn btn--primary" onClick={openCreate}>
          <Plus size={16} /> Create Fee Structure
        </button>
      </div>

      {/* Filters */}
      <div
        style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}
      >
        <select
          className="form-control"
          style={{ width: 'auto', minWidth: 160 }}
          value={filters.term}
          onChange={(e) => setFilters((f) => ({ ...f, term: e.target.value }))}
        >
          <option value="">All Terms</option>
          {TERMS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input
          className="form-control"
          style={{ width: 140 }}
          placeholder="Academic Year"
          value={filters.academicYear}
          onChange={(e) =>
            setFilters((f) => ({ ...f, academicYear: e.target.value }))
          }
        />
      </div>

      {/* Fee Cards */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div className="spinner" />
        </div>
      ) : fees.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <DollarSign size={48} className="empty-state__icon" />
            <p className="empty-state__title">No fee structures</p>
            <p className="empty-state__text">
              Create a fee structure to assign to a class and term
            </p>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 18,
          }}
        >
          {fees.map((fee) => (
            <div key={fee._id} className="card">
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--clr-border)',
                  background: 'linear-gradient(135deg, #f0f4fb, #e8eff9)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      fontSize: '1rem',
                      marginBottom: 4,
                    }}
                  >
                    {fee.title}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className="badge badge--info">
                      {fee.class?.name || '—'}
                    </span>
                    <span className="badge badge--neutral">{fee.term}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn--ghost btn--sm btn--icon"
                    onClick={() => openEdit(fee)}
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    className="btn btn--ghost btn--sm btn--icon"
                    style={{ color: 'var(--clr-danger)' }}
                    onClick={() => setDeleteTarget(fee._id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div style={{ padding: '14px 20px' }}>
                {/* Fee Items */}
                {(fee.items || []).map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 0',
                      borderBottom:
                        i < fee.items.length - 1
                          ? '1px dashed var(--clr-border)'
                          : 'none',
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <span
                        style={{
                          fontSize: '0.875rem',
                          color: 'var(--clr-text-2)',
                        }}
                      >
                        {item.label}
                      </span>
                      {!item.isCompulsory && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            color: 'var(--clr-text-3)',
                            border: '1px solid var(--clr-border)',
                            borderRadius: 4,
                            padding: '1px 5px',
                          }}
                        >
                          optional
                        </span>
                      )}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                      ₦{item.amount.toLocaleString()}
                    </span>
                  </div>
                ))}
                {/* Total */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: '2px solid var(--clr-border)',
                  }}
                >
                  <span style={{ fontWeight: 700, color: 'var(--clr-text-1)' }}>
                    Total
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      fontSize: '1.25rem',
                      color: 'var(--clr-primary)',
                    }}
                  >
                    ₦{fee.totalAmount?.toLocaleString()}
                  </span>
                </div>
                {/* Due date */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 10,
                    fontSize: '0.8125rem',
                    color: 'var(--clr-text-3)',
                  }}
                >
                  <Calendar size={13} />
                  Due:{' '}
                  {fee.dueDate
                    ? format(new Date(fee.dueDate), 'dd MMM yyyy')
                    : '—'}
                  {fee.lateFee > 0 && (
                    <span
                      style={{ marginLeft: 8, color: 'var(--clr-warning)' }}
                    >
                      Late fee: ₦{fee.lateFee.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={modal === 'form'}
        onClose={() => setModal(null)}
        title={selected ? 'Edit Fee Structure' : 'Create Fee Structure'}
        maxWidth={620}
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => setModal(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? 'Saving...' : 'Save Fee Structure'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSave}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div
              className="form-group"
              style={{ gridColumn: '1/-1', marginBottom: 0 }}
            >
              <label>Title *</label>
              <input
                className="form-control"
                required
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="e.g. JSS1 First Term Fees 2024/2025"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Class *</label>
              <select
                className="form-control"
                required
                value={form.class}
                onChange={(e) =>
                  setForm((f) => ({ ...f, class: e.target.value }))
                }
              >
                <option value="">Select class</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Term *</label>
              <select
                className="form-control"
                value={form.term}
                onChange={(e) =>
                  setForm((f) => ({ ...f, term: e.target.value }))
                }
              >
                {TERMS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Academic Year *</label>
              <input
                className="form-control"
                required
                value={form.academicYear}
                onChange={(e) =>
                  setForm((f) => ({ ...f, academicYear: e.target.value }))
                }
                placeholder="2024/2025"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Payment Due Date *</label>
              <input
                type="date"
                className="form-control"
                required
                value={form.dueDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dueDate: e.target.value }))
                }
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Late Payment Fee (₦)</label>
              <input
                type="number"
                min={0}
                className="form-control"
                value={form.lateFee}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    lateFee: parseFloat(e.target.value) || 0,
                  }))
                }
              />
            </div>
          </div>

          {/* Fee Items */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <label style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>
                Fee Items *
              </label>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={addItem}
              >
                <Plus size={13} /> Add Item
              </button>
            </div>
            {form.items.map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 120px auto auto',
                  gap: 8,
                  marginBottom: 8,
                  alignItems: 'center',
                }}
              >
                <input
                  className="form-control"
                  placeholder="Item label (e.g. Tuition Fee)"
                  value={item.label}
                  onChange={(e) => setItem(i, 'label', e.target.value)}
                  style={{ padding: '8px 12px' }}
                />
                <div style={{ position: 'relative' }}>
                  <span
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--clr-text-3)',
                      fontSize: '0.875rem',
                    }}
                  >
                    ₦
                  </span>
                  <input
                    type="number"
                    min={0}
                    className="form-control"
                    placeholder="0"
                    value={item.amount}
                    onChange={(e) => setItem(i, 'amount', e.target.value)}
                    style={{ padding: '8px 12px 8px 24px' }}
                  />
                </div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.8125rem',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={item.isCompulsory}
                    onChange={(e) =>
                      setItem(i, 'isCompulsory', e.target.checked)
                    }
                  />
                  Required
                </label>
                {form.items.length > 1 && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm btn--icon"
                    style={{ color: 'var(--clr-danger)' }}
                    onClick={() => removeItem(i)}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
            {/* Running total */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: 12,
                padding: '10px 14px',
                background: 'var(--clr-bg)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  marginRight: 16,
                  color: 'var(--clr-text-2)',
                }}
              >
                Total Amount:
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: '1.125rem',
                  color: 'var(--clr-primary)',
                }}
              >
                ₦{totalAmount(form.items).toLocaleString()}
              </span>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove Fee Structure"
        message="This fee structure will be deactivated. Existing payment records will be preserved."
        confirmLabel="Remove"
        danger
      />
    </>
  );
}
