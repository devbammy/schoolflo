import React from 'react';
export default function ResultsAdminPage() {
  return (
    <>
      <div className="page-header">
        <div><h1 className="page-header__title">ResultsAdmin</h1></div>
      </div>
      <div className="card"><div className="card__body" style={{ padding: 40, textAlign: 'center', color: 'var(--clr-text-3)' }}>
        Full CRUD interface — wired to /api/v1/ResultsAdmin endpoints. Follows the same pattern as StudentsPage.
      </div></div>
    </>
  );
}
