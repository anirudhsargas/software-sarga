import React, { useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import './Pagination.css';

const Pagination = React.memo(({ page, totalPages, total, limit = 20, onPageChange, loading }) => {
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  // Generate page numbers to show
  const getPages = useMemo(() => {
    const pages = [];
    const delta = 2;

    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) {
      pages.push(i);
    }

    if (pages[0] > 1) {
      if (pages[0] > 2) pages.unshift('...');
      pages.unshift(1);
    }

    if (pages[pages.length - 1] < totalPages) {
      if (pages[pages.length - 1] < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  }, [page, totalPages]);

  const handlePageChange = useCallback((newPage) => {
    onPageChange(newPage);
  }, [onPageChange]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      const val = Math.max(1, Math.min(totalPages, Number(e.target.value)));
      onPageChange(val);
    }
  }, [totalPages, onPageChange]);

  if (totalPages <= 1) return null;

  return (
    <div className="pagination" role="navigation" aria-label="Pagination Navigation">
      {/* Record count */}
      <span className="pagination__info">
        Showing {start}–{end} of {total}
      </span>

      <div className="pagination__controls">
        {/* First page */}
        <button
          className="pagination__btn"
          onClick={() => handlePageChange(1)}
          disabled={page === 1 || loading}
          title="First page"
          aria-label="First page"
        >
          <ChevronsLeft size={15} aria-hidden="true" />
        </button>

        {/* Previous */}
        <button
          className="pagination__btn"
          onClick={() => handlePageChange(page - 1)}
          disabled={page === 1 || loading}
          title="Previous page"
          aria-label="Previous page"
        >
          <ChevronLeft size={15} aria-hidden="true" />
        </button>

        {/* Page numbers */}
        {getPages.map((p, i) => (
          p === '...'
            ? <span key={`dots-${i}`} className="pagination__dots" aria-hidden="true">···</span>
            : <button
                key={p}
                className={`pagination__btn ${page === p ? 'pagination__btn--active' : ''}`}
                onClick={() => handlePageChange(p)}
                disabled={loading}
                aria-label={`Page ${p}`}
                aria-current={page === p ? 'page' : undefined}
              >
                {p}
              </button>
        ))}

        {/* Next */}
        <button
          className="pagination__btn"
          onClick={() => handlePageChange(page + 1)}
          disabled={page === totalPages || loading}
          title="Next page"
          aria-label="Next page"
        >
          <ChevronRight size={15} aria-hidden="true" />
        </button>

        {/* Last page */}
        <button
          className="pagination__btn"
          onClick={() => handlePageChange(totalPages)}
          disabled={page === totalPages || loading}
          title="Last page"
          aria-label="Last page"
        >
          <ChevronsRight size={15} aria-hidden="true" />
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
          onKeyDown={handleKeyDown}
          aria-label="Go to page"
        />
        <span className="pagination__jump-label">of {totalPages}</span>
      </div>
    </div>
  );
});

export default Pagination;
