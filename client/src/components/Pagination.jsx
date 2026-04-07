import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import './Pagination.css';

const Pagination = ({ page, totalPages, total, limit = 20, onPageChange, loading }) => {
  if (totalPages <= 1) return null;

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  // Generate page numbers to show
  const getPages = () => {
    const pages = [];
    const delta = 2; // Pages around current

    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) {
      pages.push(i);
    }

    // Add first page
    if (pages[0] > 1) {
      if (pages[0] > 2) pages.unshift('...');
      pages.unshift(1);
    }

    // Add last page
    if (pages[pages.length - 1] < totalPages) {
      if (pages[pages.length - 1] < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="pagination">
      {/* Record count */}
      <span className="pagination__info">
        Showing {start}–{end} of {total}
      </span>

      <div className="pagination__controls">
        {/* First page */}
        <button
          className="pagination__btn"
          onClick={() => onPageChange(1)}
          disabled={page === 1 || loading}
          title="First page"
        >
          <ChevronsLeft size={15} />
        </button>

        {/* Previous */}
        <button
          className="pagination__btn"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1 || loading}
          title="Previous page"
        >
          <ChevronLeft size={15} />
        </button>

        {/* Page numbers */}
        {getPages().map((p, i) => (
          p === '...'
            ? <span key={`dots-${i}`} className="pagination__dots">···</span>
            : <button
                key={p}
                className={`pagination__btn ${page === p ? 'pagination__btn--active' : ''}`}
                onClick={() => onPageChange(p)}
                disabled={loading}
              >
                {p}
              </button>
        ))}

        {/* Next */}
        <button
          className="pagination__btn"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages || loading}
          title="Next page"
        >
          <ChevronRight size={15} />
        </button>

        {/* Last page */}
        <button
          className="pagination__btn"
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages || loading}
          title="Last page"
        >
          <ChevronsRight size={15} />
        </button>
      </div>

      {/* Jump to page */}
      <div className="pagination__jump">
        <span className="pagination__jump-label">Go to</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          defaultValue={page}
          className="pagination__jump-input"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = Math.max(1, Math.min(totalPages, Number(e.target.value)));
              onPageChange(val);
            }
          }}
        />
        <span className="pagination__jump-label">of {totalPages}</span>
      </div>
    </div>
  );
};

export default Pagination;
