import React from 'react';
import { Loader2 } from 'lucide-react';
import './SkeletonLoader.css';

const SkeletonLoader = ({ type = 'cards', count = 6 }) => {
  if (type === 'cards') {
    return (
      <div className="skeleton-grid skeleton-grid--cards">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton-card-content">
              <div className="skeleton-card-icon"></div>
              <div className="skeleton-card-text">
                <div className="skeleton-box skeleton-card-title"></div>
                <div className="skeleton-box skeleton-card-value"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'table') {
    const columnWidths = {
      jobDetails: '180px',
      customer: '140px',
      branch: '100px',
      status: '90px',
      amount: '80px',
      balance: '80px',
      delivery: '100px',
      actions: '60px'
    };

    return (
      <div className="skeleton-table-wrapper">
        <div className="skeleton-table">
          <div className="skeleton-row skeleton-row--header" style={{
            gridTemplateColumns: `${columnWidths.jobDetails} ${columnWidths.customer} ${columnWidths.branch} ${columnWidths.status} ${columnWidths.amount} ${columnWidths.balance} ${columnWidths.delivery} ${columnWidths.actions}`
          }}>
            {['Job Details', 'Customer', 'Branch', 'Status', 'Amount', 'Balance', 'Delivery', 'Actions'].map((col, i) => (
              <div key={i} className="skeleton-cell skeleton-cell--header">{col}</div>
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton-row" style={{
              gridTemplateColumns: `${columnWidths.jobDetails} ${columnWidths.customer} ${columnWidths.branch} ${columnWidths.status} ${columnWidths.amount} ${columnWidths.balance} ${columnWidths.delivery} ${columnWidths.actions}`
            }}>
              <div className="skeleton-cell skeleton-cell--job-details">
                <div className="skeleton-box skeleton-box--line"></div>
                <div className="skeleton-box skeleton-box--line"></div>
              </div>
              <div className="skeleton-cell">
                <div className="skeleton-box skeleton-box--line"></div>
              </div>
              <div className="skeleton-cell">
                <div className="skeleton-box skeleton-box--line"></div>
              </div>
              <div className="skeleton-cell">
                <div className="skeleton-box skeleton-box--pill"></div>
              </div>
              <div className="skeleton-cell">
                <div className="skeleton-box skeleton-box--line"></div>
              </div>
              <div className="skeleton-cell">
                <div className="skeleton-box skeleton-box--line"></div>
              </div>
              <div className="skeleton-cell">
                <div className="skeleton-box skeleton-box--line"></div>
              </div>
              <div className="skeleton-cell">
                <div className="skeleton-box skeleton-box--line"></div>
              </div>
            </div>
          ))}
        </div>
        <div className="skeleton-loading-footer">
          <Loader2 className="skeleton-loading-spinner" size={16} />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (type === 'form') {
    return (
      <div className="skeleton-form">
        <div className="skeleton-form-row">
          <div className="skeleton-form-group skeleton-form-group--full">
            <div className="skeleton-label"></div>
            <div className="skeleton-input"></div>
          </div>
        </div>
        <div className="skeleton-form-row">
          <div className="skeleton-form-group">
            <div className="skeleton-label"></div>
            <div className="skeleton-input"></div>
          </div>
          <div className="skeleton-form-group">
            <div className="skeleton-label"></div>
            <div className="skeleton-input"></div>
          </div>
        </div>
        <div className="skeleton-form-row">
          <div className="skeleton-form-group skeleton-form-group--full">
            <div className="skeleton-label"></div>
            <div className="skeleton-input"></div>
          </div>
        </div>
        <div className="skeleton-form-row">
          <div className="skeleton-button"></div>
        </div>
      </div>
    );
  }

  return null;
};

export default SkeletonLoader;
