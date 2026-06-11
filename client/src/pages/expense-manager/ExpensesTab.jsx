import React, { useCallback } from 'react';
import { Receipt } from 'lucide-react';
import { EXPENSE_CATEGORIES } from './constants';

const ExpensesTab = ({ onPayment }) => {
  const handleCatClick = useCallback((cat) => () => onPayment({ type: 'Other', category: cat, payee_name: '' }), [onPayment]);
  return (
    <div className="em-section">
      <div className="em-section-title"><Receipt size={18} /> Quick Expense Entry</div>
      <div className="em-category-btns">
        {Object.keys(EXPENSE_CATEGORIES).map(cat => (
          <button key={cat} className="em-cat-btn" onClick={handleCatClick(cat)}>
            <Receipt size={14} /> {cat}
          </button>
        ))}
      </div>
    </div>
  );
};

export default React.memo(ExpensesTab);
