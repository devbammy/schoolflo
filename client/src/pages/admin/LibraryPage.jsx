import React, { useEffect, useState, useCallback } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Edit2,
  Trash2,
  ArrowLeftRight,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  DollarSign,
  BookMarked,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { libraryService, userService } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import toast from 'react-hot-toast';
import { format, isPast } from 'date-fns';

const TABS = ['Books', 'Borrow / Return', 'Overdue', 'Statistics'];

// ── Stat card helper ──────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="stat-card" style={{ '--accent-color': color }}>
      <div className="stat-card__icon">
        <Icon size={22} />
      </div>
      <div className="stat-card__content">
        <div className="stat-card__label">{label}</div>
        <div className="stat-card__value">{value}</div>
        {sub && <div className="stat-card__meta">{sub}</div>}
      </div>
    </div>
  );
}

// ── Empty book form ───────────────────────────────────────────────────────────
const EMPTY_BOOK = {
  title: '',
  author: '',
  isbn: '',
  category: '',
  publisher: '',
  publishYear: '',
  edition: '',
  language: 'English',
  description: '',
  totalCopies: 1,
  shelf: '',
};

export default function LibraryPage() {
  const [tab, setTab] = useState('Books');
  const [books, setBooks] = useState([]);
  const [records, setRecords] = useState([]);
  const [overdue, setOverdue] = useState([]);
  const [stats, setStats] = useState(null);
  const [categories, setCategories] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pagination
  const [bookPage, setBookPage] = useState(1);
  const [bookMeta, setBookMeta] = useState({ total: 0, pages: 1 });
  const [recPage, setRecPage] = useState(1);
  const [recMeta, setRecMeta] = useState({ total: 0, pages: 1 });

  // Filters
  const [bookSearch, setBookSearch] = useState('');
  const [bookCategory, setBookCategory] = useState('');
  const [bookAvailable, setBookAvailable] = useState('');
  const [recStatus, setRecStatus] = useState('');

  // Modals
  const [bookModal, setBookModal] = useState(null); // null | 'create' | 'edit'
  const [selectedBook, setSelectedBook] = useState(null);
  const [bookForm, setBookForm] = useState(EMPTY_BOOK);
  const [savingBook, setSavingBook] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Issue modal
  const [issueModal, setIssueModal] = useState(false);
  const [issueBookId, setIssueBookId] = useState('');
  const [issueTo, setIssueTo] = useState('');
  const [issueRole, setIssueRole] = useState('Student');
  const [loanDays, setLoanDays] = useState(14);
  const [issuing, setIssuing] = useState(false);

  // ── Loaders ────────────────────────────────────────────────────────────
  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: bookPage, limit: 15 };
      if (bookSearch) params.search = bookSearch;
      if (bookCategory) params.category = bookCategory;
      if (bookAvailable) params.available = bookAvailable;
      const r = await libraryService.getBooks(params);
      setBooks(r.data.data || []);
      setBookMeta(r.data.meta || { total: 0, pages: 1 });
    } catch {
      toast.error('Failed to load books');
    } finally {
      setLoading(false);
    }
  }, [bookPage, bookSearch, bookCategory, bookAvailable]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: recPage, limit: 15 };
      if (recStatus) params.status = recStatus;
      const r = await libraryService.getRecords(params);
      setRecords(r.data.data || []);
      setRecMeta(r.data.meta || { total: 0, pages: 1 });
    } catch {
      toast.error('Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [recPage, recStatus]);

  const loadOverdue = useCallback(async () => {
    setLoading(true);
    try {
      const r = await libraryService.getOverdue();
      setOverdue(r.data.data?.records || []);
    } catch {
      toast.error('Failed to load overdue');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const r = await libraryService.getStats();
      setStats(r.data.data);
    } catch {}
  }, []);

  useEffect(() => {
    libraryService
      .getCategories()
      .then((r) => setCategories(r.data.data?.categories || []));
    Promise.all([
      userService.getAll({ role: 'Student', limit: 200 }),
      userService.getAll({ role: 'Teacher', limit: 100 }),
    ]).then(([s, t]) => {
      setStudents(s.data.data || []);
      setTeachers(t.data.data || []);
    });
    loadStats();
  }, []);

  useEffect(() => {
    if (tab === 'Books') {
      loadBooks();
    } else if (tab === 'Borrow / Return') {
      loadRecords();
    } else if (tab === 'Overdue') {
      loadOverdue();
    } else if (tab === 'Statistics') {
      loadStats();
    }
  }, [tab, loadStats]);

  // ── Book CRUD ──────────────────────────────────────────────────────────
  const openCreate = () => {
    setBookForm(EMPTY_BOOK);
    setSelectedBook(null);
    setBookModal('form');
  };
  const openEdit = (b) => {
    setSelectedBook(b);
    setBookForm({
      title: b.title,
      author: b.author,
      isbn: b.isbn || '',
      category: b.category,
      publisher: b.publisher || '',
      publishYear: b.publishYear || '',
      edition: b.edition || '',
      language: b.language || 'English',
      description: b.description || '',
      totalCopies: b.totalCopies,
      shelf: b.shelf || '',
    });
    setBookModal('form');
  };

  const handleBookSave = async (e) => {
    e.preventDefault();
    setSavingBook(true);
    try {
      if (!selectedBook) {
        await libraryService.createBook(bookForm);
        toast.success('Book added to library');
      } else {
        await libraryService.updateBook(selectedBook._id, bookForm);
        toast.success('Book updated');
      }
      setBookModal(null);
      loadBooks();
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSavingBook(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await libraryService.deleteBook(deleteTarget);
      toast.success('Book removed');
      setDeleteTarget(null);
      loadBooks();
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  // ── Issue book ─────────────────────────────────────────────────────────
  const handleIssue = async (e) => {
    e.preventDefault();
    if (!issueBookId || !issueTo)
      return toast.error('Select a book and borrower');
    setIssuing(true);
    try {
      await libraryService.borrowBook({
        bookId: issueBookId,
        borrowerId: issueTo,
        loanDays,
      });
      toast.success('Book issued successfully');
      setIssueModal(false);
      setIssueBookId('');
      setIssueTo('');
      setLoanDays(14);
      loadBooks();
      loadRecords();
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Issue failed');
    } finally {
      setIssuing(false);
    }
  };

  // ── Return / Renew ─────────────────────────────────────────────────────
  const handleReturn = async (id) => {
    try {
      const r = await libraryService.returnBook(id);
      const fine = r.data.data?.fine;
      if (fine > 0) toast.success(`Book returned — ₦${fine} fine applies`);
      else toast.success('Book returned successfully');
      loadRecords();
      loadOverdue();
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Return failed');
    }
  };

  const handleRenew = async (id) => {
    try {
      const r = await libraryService.renewBook(id);
      toast.success(r.data.message);
      loadRecords();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Renewal failed');
    }
  };

  const handlePayFine = async (id) => {
    try {
      await libraryService.payFine(id);
      toast.success('Fine marked as paid');
      loadRecords();
      loadOverdue();
      loadStats();
    } catch {
      toast.error('Failed');
    }
  };

  // ── Borrowers list for issue modal ─────────────────────────────────────
  const borrowers = issueRole === 'Student' ? students : teachers;

  // ── Status badge helper ────────────────────────────────────────────────
  const statusBadge = (status) => {
    const map = {
      Borrowed: 'info',
      Returned: 'success',
      Overdue: 'danger',
      Lost: 'danger',
    };
    return (
      <span className={`badge badge--${map[status] || 'neutral'}`}>
        {status}
      </span>
    );
  };

  // ──────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Library</h1>
          <p className="page-header__subtitle">
            Book inventory, borrowing and return management
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn--secondary"
            onClick={() => setIssueModal(true)}
          >
            <ArrowLeftRight size={15} /> Issue Book
          </button>
          <button className="btn btn--primary" onClick={openCreate}>
            <Plus size={15} /> Add Book
          </button>
        </div>
      </div>

      {/* ── Quick stats strip ──────────────────────────────────────── */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <StatCard
            label="Total Titles"
            value={stats.totalBooks}
            icon={BookOpen}
            color="#1A4FAB"
            sub={`${stats.totalCopies} copies`}
          />
          <StatCard
            label="Available"
            value={stats.availableCopies}
            icon={CheckCircle}
            color="#10B981"
            sub="copies on shelf"
          />
          <StatCard
            label="Currently Borrowed"
            value={stats.borrowed}
            icon={BookMarked}
            color="#0891B2"
          />
          <StatCard
            label="Overdue"
            value={stats.overdue}
            icon={AlertTriangle}
            color="#EF4444"
            sub={`₦${(stats.unpaidFines || 0).toLocaleString()} unpaid fines`}
          />
        </div>
      )}

      {/* ── Tab bar ────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 20,
          borderBottom: '1px solid var(--clr-border)',
          paddingBottom: 0,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 18px',
              background: 'none',
              border: 'none',
              borderBottom: `2.5px solid ${tab === t ? 'var(--clr-primary)' : 'transparent'}`,
              color: tab === t ? 'var(--clr-primary)' : 'var(--clr-text-3)',
              fontFamily: 'var(--font-body)',
              fontWeight: tab === t ? 600 : 400,
              fontSize: '0.9375rem',
              cursor: 'pointer',
              marginBottom: -1,
              transition: 'all 0.15s',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          TAB: BOOKS
      ════════════════════════════════════════════════════════════════ */}
      {tab === 'Books' && (
        <>
          {/* Filters */}
          <div
            style={{
              display: 'flex',
              gap: 10,
              marginBottom: 20,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 11,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--clr-text-3)',
                }}
              />
              <input
                className="form-control"
                style={{ paddingLeft: 34 }}
                placeholder="Search title, author, ISBN..."
                value={bookSearch}
                onChange={(e) => {
                  setBookSearch(e.target.value);
                  setBookPage(1);
                }}
              />
            </div>
            <select
              className="form-control"
              style={{ width: 'auto', minWidth: 150 }}
              value={bookCategory}
              onChange={(e) => {
                setBookCategory(e.target.value);
                setBookPage(1);
              }}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              className="form-control"
              style={{ width: 'auto', minWidth: 150 }}
              value={bookAvailable}
              onChange={(e) => {
                setBookAvailable(e.target.value);
                setBookPage(1);
              }}
            >
              <option value="">All Availability</option>
              <option value="true">Available Only</option>
            </select>
          </div>

          <div className="card">
            <div
              className="table-wrapper"
              style={{ border: 'none', borderRadius: 0 }}
            >
              <table className="table">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Category</th>
                    <th>ISBN</th>
                    <th>Copies</th>
                    <th>Available</th>
                    <th>Shelf</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{ textAlign: 'center', padding: 48 }}
                      >
                        <div className="spinner" style={{ margin: '0 auto' }} />
                      </td>
                    </tr>
                  ) : books.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          textAlign: 'center',
                          padding: 48,
                          color: 'var(--clr-text-3)',
                        }}
                      >
                        No books found
                      </td>
                    </tr>
                  ) : (
                    books.map((b) => (
                      <tr key={b._id}>
                        <td>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                            }}
                          >
                            <div
                              style={{
                                width: 36,
                                height: 44,
                                borderRadius: 4,
                                background: '#dbeafe',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                overflow: 'hidden',
                              }}
                            >
                              {b.coverImage?.url ? (
                                <img
                                  src={b.coverImage.url}
                                  alt=""
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                  }}
                                />
                              ) : (
                                <BookOpen size={16} color="#1e40af" />
                              )}
                            </div>
                            <div>
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize: '0.9375rem',
                                }}
                              >
                                {b.title}
                              </div>
                              <div
                                style={{
                                  fontSize: '0.8125rem',
                                  color: 'var(--clr-text-3)',
                                }}
                              >
                                by {b.author}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className="badge badge--info"
                            style={{ fontSize: '0.75rem' }}
                          >
                            {b.category}
                          </span>
                        </td>
                        <td
                          style={{
                            fontSize: '0.8125rem',
                            color: 'var(--clr-text-3)',
                            fontFamily: 'var(--font-display)',
                          }}
                        >
                          {b.isbn || '—'}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>
                          {b.totalCopies}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            style={{
                              fontWeight: 700,
                              color:
                                b.availableCopies > 0
                                  ? 'var(--clr-success)'
                                  : 'var(--clr-danger)',
                            }}
                          >
                            {b.availableCopies}
                          </span>
                        </td>
                        <td
                          style={{
                            fontSize: '0.875rem',
                            color: 'var(--clr-text-3)',
                          }}
                        >
                          {b.shelf || '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="btn btn--ghost btn--sm btn--icon"
                              onClick={() => openEdit(b)}
                              title="Edit"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              className="btn btn--ghost btn--sm btn--icon"
                              style={{ color: 'var(--clr-danger)' }}
                              onClick={() => setDeleteTarget(b._id)}
                              title="Remove"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {bookMeta.pages > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 20px',
                  borderTop: '1px solid var(--clr-border)',
                }}
              >
                <span
                  style={{ fontSize: '0.875rem', color: 'var(--clr-text-3)' }}
                >
                  {bookMeta.total} books total
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn--secondary btn--sm btn--icon"
                    disabled={bookPage === 1}
                    onClick={() => setBookPage((p) => p - 1)}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span
                    style={{
                      fontSize: '0.875rem',
                      padding: '4px 8px',
                      color: 'var(--clr-text-2)',
                    }}
                  >
                    Page {bookPage} / {bookMeta.pages}
                  </span>
                  <button
                    className="btn btn--secondary btn--sm btn--icon"
                    disabled={bookPage >= bookMeta.pages}
                    onClick={() => setBookPage((p) => p + 1)}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB: BORROW / RETURN
      ════════════════════════════════════════════════════════════════ */}
      {tab === 'Borrow / Return' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <select
              className="form-control"
              style={{ width: 'auto', minWidth: 160 }}
              value={recStatus}
              onChange={(e) => {
                setRecStatus(e.target.value);
                setRecPage(1);
              }}
            >
              <option value="">All Status</option>
              {['Borrowed', 'Returned', 'Overdue', 'Lost'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="card">
            <div
              className="table-wrapper"
              style={{ border: 'none', borderRadius: 0 }}
            >
              <table className="table">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Borrower</th>
                    <th>Issue Date</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>Fine</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{ textAlign: 'center', padding: 48 }}
                      >
                        <div className="spinner" style={{ margin: '0 auto' }} />
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          textAlign: 'center',
                          padding: 48,
                          color: 'var(--clr-text-3)',
                        }}
                      >
                        No records found
                      </td>
                    </tr>
                  ) : (
                    records.map((r) => (
                      <tr key={r._id}>
                        <td>
                          <div
                            style={{ fontWeight: 600, fontSize: '0.9375rem' }}
                          >
                            {r.book?.title}
                          </div>
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              color: 'var(--clr-text-3)',
                            }}
                          >
                            by {r.book?.author}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>
                            {r.borrower?.firstName} {r.borrower?.lastName}
                          </div>
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              color: 'var(--clr-text-3)',
                            }}
                          >
                            {r.borrowerRole}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.875rem' }}>
                          {format(new Date(r.issueDate), 'dd MMM yyyy')}
                        </td>
                        <td
                          style={{
                            fontSize: '0.875rem',
                            color:
                              r.status === 'Overdue'
                                ? 'var(--clr-danger)'
                                : 'var(--clr-text-2)',
                            fontWeight: r.status === 'Overdue' ? 600 : 400,
                          }}
                        >
                          {format(new Date(r.dueDate), 'dd MMM yyyy')}
                          {r.renewalCount > 0 && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                color: 'var(--clr-text-3)',
                                marginLeft: 4,
                              }}
                            >
                              R×{r.renewalCount}
                            </span>
                          )}
                        </td>
                        <td>{statusBadge(r.status)}</td>
                        <td>
                          {r.fine?.amount > 0 ? (
                            <div>
                              <span
                                style={{
                                  fontWeight: 700,
                                  color: r.fine.paid
                                    ? 'var(--clr-success)'
                                    : 'var(--clr-danger)',
                                }}
                              >
                                ₦{r.fine.amount.toLocaleString()}
                              </span>
                              {!r.fine.paid && (
                                <span
                                  style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--clr-text-3)',
                                    display: 'block',
                                  }}
                                >
                                  Unpaid
                                </span>
                              )}
                              {r.fine.paid && (
                                <span
                                  style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--clr-success)',
                                    display: 'block',
                                  }}
                                >
                                  Paid ✓
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--clr-text-3)' }}>
                              —
                            </span>
                          )}
                        </td>
                        <td>
                          {(r.status === 'Borrowed' ||
                            r.status === 'Overdue') && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                className="btn btn--primary btn--sm"
                                onClick={() => handleReturn(r._id)}
                                title="Return book"
                              >
                                <RotateCcw size={12} /> Return
                              </button>
                              {r.renewalCount < 2 &&
                                r.status === 'Borrowed' && (
                                  <button
                                    className="btn btn--secondary btn--sm"
                                    onClick={() => handleRenew(r._id)}
                                    title="Renew loan"
                                  >
                                    +7d
                                  </button>
                                )}
                            </div>
                          )}
                          {r.status === 'Returned' &&
                            r.fine?.amount > 0 &&
                            !r.fine.paid && (
                              <button
                                className="btn btn--secondary btn--sm"
                                onClick={() => handlePayFine(r._id)}
                              >
                                <DollarSign size={12} /> Pay Fine
                              </button>
                            )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {recMeta.pages > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 6,
                  padding: '12px 20px',
                  borderTop: '1px solid var(--clr-border)',
                }}
              >
                <button
                  className="btn btn--secondary btn--sm btn--icon"
                  disabled={recPage === 1}
                  onClick={() => setRecPage((p) => p - 1)}
                >
                  <ChevronLeft size={14} />
                </button>
                <span
                  style={{
                    fontSize: '0.875rem',
                    padding: '4px 8px',
                    color: 'var(--clr-text-2)',
                  }}
                >
                  {recPage} / {recMeta.pages}
                </span>
                <button
                  className="btn btn--secondary btn--sm btn--icon"
                  disabled={recPage >= recMeta.pages}
                  onClick={() => setRecPage((p) => p + 1)}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB: OVERDUE
      ════════════════════════════════════════════════════════════════ */}
      {tab === 'Overdue' && (
        <div className="card">
          {loading ? (
            <div
              style={{ display: 'flex', justifyContent: 'center', padding: 60 }}
            >
              <div className="spinner" />
            </div>
          ) : overdue.length === 0 ? (
            <div className="empty-state" style={{ padding: '56px 24px' }}>
              <CheckCircle
                size={44}
                className="empty-state__icon"
                style={{ color: 'var(--clr-success)' }}
              />
              <p className="empty-state__title">No overdue books</p>
              <p className="empty-state__text">
                All borrowed books are within their due dates
              </p>
            </div>
          ) : (
            <div
              className="table-wrapper"
              style={{ border: 'none', borderRadius: 0 }}
            >
              <table className="table">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Borrower</th>
                    <th>Due Date</th>
                    <th>Days Overdue</th>
                    <th>Fine (₦50/day)</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {overdue.map((r) => {
                    const days = Math.floor(
                      (Date.now() - new Date(r.dueDate)) /
                        (1000 * 60 * 60 * 24),
                    );
                    const fine = days * 50;
                    return (
                      <tr key={r._id} style={{ background: '#fff8f8' }}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.book?.title}</div>
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              color: 'var(--clr-text-3)',
                            }}
                          >
                            {r.book?.author}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>
                            {r.borrower?.firstName} {r.borrower?.lastName}
                          </div>
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              color: 'var(--clr-text-3)',
                            }}
                          >
                            {r.borrowerRole}
                          </div>
                        </td>
                        <td
                          style={{
                            color: 'var(--clr-danger)',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                          }}
                        >
                          {format(new Date(r.dueDate), 'dd MMM yyyy')}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            style={{
                              fontWeight: 800,
                              color: 'var(--clr-danger)',
                              fontFamily: 'var(--font-display)',
                            }}
                          >
                            {days}
                          </span>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--clr-text-3)',
                              marginLeft: 4,
                            }}
                          >
                            days
                          </span>
                        </td>
                        <td
                          style={{
                            fontWeight: 700,
                            color: 'var(--clr-danger)',
                          }}
                        >
                          ₦{fine.toLocaleString()}
                        </td>
                        <td>
                          <button
                            className="btn btn--primary btn--sm"
                            onClick={() => handleReturn(r._id)}
                          >
                            <RotateCcw size={12} /> Return
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB: STATISTICS
      ════════════════════════════════════════════════════════════════ */}
      {tab === 'Statistics' && stats && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          {[
            {
              label: 'Total Book Titles',
              value: stats.totalBooks,
              color: '#1A4FAB',
              icon: BookOpen,
            },
            {
              label: 'Total Copies',
              value: stats.totalCopies,
              color: '#0891B2',
              icon: BookMarked,
            },
            {
              label: 'Available Copies',
              value: stats.availableCopies,
              color: '#10B981',
              icon: CheckCircle,
            },
            {
              label: 'Currently Borrowed',
              value: stats.borrowed,
              color: '#7C3AED',
              icon: Users,
            },
            {
              label: 'Overdue Books',
              value: stats.overdue,
              color: '#EF4444',
              icon: AlertTriangle,
            },
            {
              label: 'Total Returned',
              value: stats.returned,
              color: '#059669',
              icon: RotateCcw,
            },
            {
              label: 'Unpaid Fines',
              value: `₦${(stats.unpaidFines || 0).toLocaleString()}`,
              color: '#F59E0B',
              icon: DollarSign,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="stat-card"
              style={{ '--accent-color': s.color }}
            >
              <div className="stat-card__icon">
                <s.icon size={22} />
              </div>
              <div className="stat-card__content">
                <div className="stat-card__label">{s.label}</div>
                <div className="stat-card__value">{s.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Book Modal ───────────────────────────────────── */}
      <Modal
        open={bookModal === 'form'}
        onClose={() => setBookModal(null)}
        title={selectedBook ? 'Edit Book' : 'Add Book to Library'}
        maxWidth={620}
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => setBookModal(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
              disabled={savingBook}
              onClick={handleBookSave}
            >
              {savingBook ? 'Saving...' : 'Save Book'}
            </button>
          </>
        }
      >
        <form onSubmit={handleBookSave}>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}
          >
            <div
              className="form-group"
              style={{ gridColumn: '1/-1', marginBottom: 0 }}
            >
              <label>Title *</label>
              <input
                className="form-control"
                required
                value={bookForm.title}
                onChange={(e) =>
                  setBookForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Author *</label>
              <input
                className="form-control"
                required
                value={bookForm.author}
                onChange={(e) =>
                  setBookForm((f) => ({ ...f, author: e.target.value }))
                }
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Category *</label>
              <input
                className="form-control"
                required
                list="cats"
                value={bookForm.category}
                onChange={(e) =>
                  setBookForm((f) => ({ ...f, category: e.target.value }))
                }
                placeholder="e.g. Mathematics, Fiction..."
              />
              <datalist id="cats">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>ISBN</label>
              <input
                className="form-control"
                value={bookForm.isbn}
                onChange={(e) =>
                  setBookForm((f) => ({ ...f, isbn: e.target.value }))
                }
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Publisher</label>
              <input
                className="form-control"
                value={bookForm.publisher}
                onChange={(e) =>
                  setBookForm((f) => ({ ...f, publisher: e.target.value }))
                }
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Publish Year</label>
              <input
                type="number"
                min={1900}
                max={2030}
                className="form-control"
                value={bookForm.publishYear}
                onChange={(e) =>
                  setBookForm((f) => ({ ...f, publishYear: e.target.value }))
                }
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Edition</label>
              <input
                className="form-control"
                placeholder="e.g. 3rd"
                value={bookForm.edition}
                onChange={(e) =>
                  setBookForm((f) => ({ ...f, edition: e.target.value }))
                }
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Language</label>
              <input
                className="form-control"
                value={bookForm.language}
                onChange={(e) =>
                  setBookForm((f) => ({ ...f, language: e.target.value }))
                }
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Total Copies *</label>
              <input
                type="number"
                min={1}
                className="form-control"
                required
                value={bookForm.totalCopies}
                onChange={(e) =>
                  setBookForm((f) => ({
                    ...f,
                    totalCopies: parseInt(e.target.value) || 1,
                  }))
                }
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Shelf / Location</label>
              <input
                className="form-control"
                placeholder="e.g. Shelf A3, Row 2"
                value={bookForm.shelf}
                onChange={(e) =>
                  setBookForm((f) => ({ ...f, shelf: e.target.value }))
                }
              />
            </div>
            <div
              className="form-group"
              style={{ gridColumn: '1/-1', marginBottom: 0 }}
            >
              <label>Description</label>
              <textarea
                className="form-control"
                rows={2}
                value={bookForm.description}
                onChange={(e) =>
                  setBookForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Issue Book Modal ────────────────────────────────────────── */}
      <Modal
        open={issueModal}
        onClose={() => setIssueModal(false)}
        title="Issue Book"
        maxWidth={500}
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => setIssueModal(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
              disabled={issuing}
              onClick={handleIssue}
            >
              {issuing ? 'Issuing...' : 'Issue Book'}
            </button>
          </>
        }
      >
        <form onSubmit={handleIssue}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Select Book *</label>
              <select
                className="form-control"
                required
                value={issueBookId}
                onChange={(e) => setIssueBookId(e.target.value)}
              >
                <option value="">Choose book...</option>
                {books
                  .filter((b) => b.availableCopies > 0)
                  .map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.title} — {b.availableCopies} available
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Borrower Type</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['Student', 'Teacher'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setIssueRole(r);
                      setIssueTo('');
                    }}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: 'var(--radius-md)',
                      border: `1.5px solid ${issueRole === r ? 'var(--clr-primary)' : 'var(--clr-border)'}`,
                      background:
                        issueRole === r ? 'var(--clr-primary)' : 'transparent',
                      color: issueRole === r ? '#fff' : 'var(--clr-text-2)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                      fontWeight: 500,
                      fontSize: '0.875rem',
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Select {issueRole} *</label>
              <select
                className="form-control"
                required
                value={issueTo}
                onChange={(e) => setIssueTo(e.target.value)}
              >
                <option value="">Choose {issueRole.toLowerCase()}...</option>
                {borrowers.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.firstName} {u.lastName}
                    {u.studentProfile?.admissionNumber
                      ? ` — ${u.studentProfile.admissionNumber}`
                      : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Loan Duration (days)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[7, 14, 21, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setLoanDays(d)}
                    style={{
                      flex: 1,
                      padding: '7px',
                      borderRadius: 'var(--radius-md)',
                      border: `1.5px solid ${loanDays === d ? 'var(--clr-primary)' : 'var(--clr-border)'}`,
                      background:
                        loanDays === d ? 'var(--clr-primary)' : 'transparent',
                      color: loanDays === d ? '#fff' : 'var(--clr-text-2)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                      fontWeight: 500,
                      fontSize: '0.875rem',
                    }}
                  >
                    {d}d
                  </button>
                ))}
              </div>
              <div
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--clr-text-3)',
                  marginTop: 6,
                }}
              >
                Due date:{' '}
                <strong>
                  {format(
                    new Date(Date.now() + loanDays * 86400000),
                    'dd MMM yyyy',
                  )}
                </strong>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove Book"
        message="This book will be removed from the library catalogue. Only possible if no copies are currently borrowed."
        confirmLabel="Remove Book"
        danger
        loading={deleting}
      />
    </>
  );
}
