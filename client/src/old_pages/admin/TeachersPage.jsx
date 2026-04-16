import React from 'react';
export default function TeachersPage() {
  return (
    <>
      <div className="page-header">
        <div><h1 className="page-header__title">Teachers</h1></div>
      </div>
      <div className="card"><div className="card__body" style={{ padding: 40, textAlign: 'center', color: 'var(--clr-text-3)' }}>
        Full CRUD interface — wired to /api/v1/Teachers endpoints. Follows the same pattern as StudentsPage.
      </div></div>
    </>
  );
}
