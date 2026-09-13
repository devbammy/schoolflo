import React, { useEffect, useState, useCallback } from 'react';
import {
  BookOpen,
  Search,
  Clock,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  BookMarked,
} from 'lucide-react';
import { libraryService } from '../../services/api';
import toast from 'react-hot-toast';
import { format, isPast } from 'date-fns';

const TABS = ['Browse Books', 'My Borrowed Books'];

const STATUS_CONFIG = {
  Borrowed: { badge: 'info', icon: BookMarked },
  Returned: { badge: 'success', icon: CheckCircle },
  Overdue: { badge: 'danger', icon: AlertTriangle },
  Lost: { badge: 'danger', icon: AlertTriangle },
};

export default function MyLibraryPage() {
  const [tab, setTab] = useState('Browse Books');
  const [books, setBooks] = useState([]);
  const [myRecords, setMyRecords] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [available, setAvailable] = useState('');

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 30 };
      if (search) params.search = search;
      if (category) params.category = category;
      if (available) params.available = available;
      const r = await libraryService.getBooks(params);
      setBooks(r.data.data || []);
    } catch {
      toast.error('Failed to load books');
    } finally {
      setLoading(false);
    }
  }, [search, category, available]);

  const loadMyRecords = useCallback(async () => {
    setLoading(true);
    try {
      const r = await libraryService.getMyRecords();
      setMyRecords(r.data.data?.records || []);
    } catch {
      toast.error('Failed to load your records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    libraryService
      .getCategories()
      .then((r) => setCategories(r.data.data?.categories || []));
  }, []);

  useEffect(() => {
    if (tab === 'Browse Books') loadBooks();
  }, [tab, loadBooks]);
  useEffect(() => {
    if (tab === 'My Borrowed Books') loadMyRecords();
  }, [tab, loadMyRecords]);

  // Active borrows
  const activeBorrows = myRecords.filter(
    (r) => r.status === 'Borrowed' || r.status === 'Overdue',
  );
  const hasOverdue = myRecords.some((r) => r.status === 'Overdue');

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Library</h1>
          <p className="page-header__subtitle">
            Browse the book catalogue and track your loans
          </p>
        </div>
        {activeBorrows.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              background: hasOverdue ? '#fee2e2' : '#dbeafe',
              border: `1px solid ${hasOverdue ? '#fca5a5' : '#93c5fd'}`,
            }}
          >
            {hasOverdue ? (
              <AlertTriangle size={15} color="#dc2626" />
            ) : (
              <BookMarked size={15} color="#2563eb" />
            )}
            <span
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: hasOverdue ? '#dc2626' : '#1e40af',
              }}
            >
              {activeBorrows.length} book{activeBorrows.length > 1 ? 's' : ''}{' '}
              borrowed
              {hasOverdue && ' — overdue!'}
            </span>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 20,
          borderBottom: '1px solid var(--clr-border)',
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
            }}
          >
            {t}
            {t === 'My Borrowed Books' && activeBorrows.length > 0 && (
              <span
                style={{
                  marginLeft: 6,
                  background: hasOverdue ? '#dc2626' : 'var(--clr-primary)',
                  color: '#fff',
                  borderRadius: 10,
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  fontWeight: 700,
                }}
              >
                {activeBorrows.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── BROWSE BOOKS ───────────────────────────────────────────── */}
      {tab === 'Browse Books' && (
        <>
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
                placeholder="Search title, author or ISBN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="form-control"
              style={{ width: 'auto', minWidth: 150 }}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              className="form-control"
              style={{ width: 'auto', minWidth: 150 }}
              value={available}
              onChange={(e) => setAvailable(e.target.value)}
            >
              <option value="">All Books</option>
              <option value="true">Available Only</option>
            </select>
          </div>

          {loading ? (
            <div
              style={{ display: 'flex', justifyContent: 'center', padding: 60 }}
            >
              <div className="spinner" />
            </div>
          ) : books.length === 0 ? (
            <div className="card">
              <div className="empty-state" style={{ padding: '48px 24px' }}>
                <BookOpen size={44} className="empty-state__icon" />
                <p className="empty-state__title">No books found</p>
                <p className="empty-state__text">
                  Try a different search or category
                </p>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))',
                gap: 14,
              }}
            >
              {books.map((book) => (
                <div
                  key={book._id}
                  className="card"
                  style={{ overflow: 'hidden', padding: '10px' }}
                >
                  {/* Cover area */}
                  <div
                    style={{
                      height: 120,
                      background: 'linear-gradient(135deg, #dbeafe, #ede9fe)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {book.coverImage?.url ? (
                      <img
                        src={book.coverImage.url}
                        alt={book.title}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <BookOpen
                        size={44}
                        color="#6366f1"
                        style={{ opacity: 0.5 }}
                      />
                    )}
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        marginBottom: 2,
                        lineHeight: 1.3,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {book.title}
                    </div>
                    <div
                      style={{
                        fontSize: '0.8125rem',
                        color: 'var(--clr-text-3)',
                        marginBottom: 8,
                      }}
                    >
                      by {book.author}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        className="badge badge--info"
                        style={{ fontSize: '0.7rem' }}
                      >
                        {book.category}
                      </span>
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          fontWeight: 700,
                          color:
                            book.availableCopies > 0
                              ? 'var(--clr-success)'
                              : 'var(--clr-danger)',
                        }}
                      >
                        {book.availableCopies > 0
                          ? `${book.availableCopies} available`
                          : 'Not available'}
                      </span>
                    </div>
                    {book.shelf && (
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--clr-text-3)',
                          marginTop: 6,
                        }}
                      >
                        📍 {book.shelf}
                      </div>
                    )}
                    {book.availableCopies > 0 && (
                      <div
                        style={{
                          marginTop: 10,
                          padding: '6px 10px',
                          background: '#eff6ff',
                          borderRadius: 6,
                          fontSize: '0.75rem',
                          color: '#1e40af',
                          textAlign: 'center',
                        }}
                      >
                        Visit the library to borrow this book
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── MY BORROWED BOOKS ──────────────────────────────────────── */}
      {tab === 'My Borrowed Books' && (
        <div className="card">
          {loading ? (
            <div
              style={{ display: 'flex', justifyContent: 'center', padding: 60 }}
            >
              <div className="spinner" />
            </div>
          ) : myRecords.length === 0 ? (
            <div className="empty-state" style={{ padding: '56px 24px' }}>
              <BookOpen size={44} className="empty-state__icon" />
              <p className="empty-state__title">No borrow history</p>
              <p className="empty-state__text">
                You haven't borrowed any books yet. Visit the library to get
                started.
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
                    <th>Issued</th>
                    <th>Due Date</th>
                    <th>Returned</th>
                    <th>Status</th>
                    <th>Fine</th>
                  </tr>
                </thead>
                <tbody>
                  {myRecords.map((r) => {
                    const cfg =
                      STATUS_CONFIG[r.status] || STATUS_CONFIG.Borrowed;
                    return (
                      <tr
                        key={r._id}
                        style={{
                          background:
                            r.status === 'Overdue' ? '#fff8f8' : 'transparent',
                        }}
                      >
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
                                width: 32,
                                height: 40,
                                borderRadius: 4,
                                background: '#ede9fe',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <BookOpen size={14} color="#7c3aed" />
                            </div>
                            <div>
                              <div style={{ fontWeight: 600 }}>
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
                            </div>
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
                          {r.status === 'Overdue' && (
                            <div
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--clr-danger)',
                              }}
                            >
                              {Math.floor(
                                (Date.now() - new Date(r.dueDate)) / 86400000,
                              )}{' '}
                              days overdue
                            </div>
                          )}
                          {r.renewalCount > 0 && (
                            <div
                              style={{
                                fontSize: '0.7rem',
                                color: 'var(--clr-text-3)',
                              }}
                            >
                              Renewed ×{r.renewalCount}
                            </div>
                          )}
                        </td>
                        <td
                          style={{
                            fontSize: '0.875rem',
                            color: 'var(--clr-text-3)',
                          }}
                        >
                          {r.returnDate
                            ? format(new Date(r.returnDate), 'dd MMM yyyy')
                            : '—'}
                        </td>
                        <td>
                          <span className={`badge badge--${cfg.badge}`}>
                            {r.status}
                          </span>
                        </td>
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
                              <div
                                style={{
                                  fontSize: '0.75rem',
                                  color: r.fine.paid
                                    ? 'var(--clr-success)'
                                    : 'var(--clr-danger)',
                                }}
                              >
                                {r.fine.paid
                                  ? 'Paid ✓'
                                  : 'Unpaid — pay at library'}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--clr-text-3)' }}>
                              —
                            </span>
                          )}
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
    </>
  );
}
