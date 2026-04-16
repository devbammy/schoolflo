import React from 'react';
export default function AssignmentsPage() {
  return (
    <>
      <div className="page-header"><div><h1 className="page-header__title">Assignments</h1></div></div>
      <div className="card"><div className="card__body" style={{ padding: 40, textAlign: 'center', color: 'var(--clr-text-3)' }}>
        Create assignments, upload attachments, view and grade submissions.
      </div></div>
    </>
  );
}
