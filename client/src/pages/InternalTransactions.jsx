import React from 'react';
import InternalTransfers from './InternalTransfers';

const InternalTransactions = () => {
  return (
    <div className="page-container" style={{ maxWidth: 1100 }}>
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="section-title">Internal Transactions</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Manage inter-branch movements and transfers</p>
        </div>
      </div>

      <InternalTransfers />
    </div>
  );
};

export default InternalTransactions;
