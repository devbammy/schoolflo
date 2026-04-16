import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ page, pages, total, limit, onChange }) {
  if (pages <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid var(--clr-border)' }}>
      <span style={{ fontSize: '0.875rem', color: 'var(--clr-text-3)' }}>
        Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
      </span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button className="btn btn--secondary btn--sm btn--icon" disabled={page === 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft size={15} />
        </button>
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
          let p;
          if (pages <= 5) p = i + 1;
          else if (page <= 3) p = i + 1;
          else if (page >= pages - 2) p = pages - 4 + i;
          else p = page - 2 + i;
          return (
            <button
              key={p}
              className={`btn btn--sm ${p === page ? 'btn--primary' : 'btn--secondary'}`}
              style={{ minWidth: 34, padding: '6px 10px' }}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          );
        })}
        <button className="btn btn--secondary btn--sm btn--icon" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
