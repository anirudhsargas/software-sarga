import React from 'react';
import { Receipt } from 'lucide-react';
import { EXPENSE_CATEGORIES } from './constants';

const ExpensesTab = ({ onPayment }) => {
  return (
    <div className="em-section">
      <div className="em-section-title"><Receipt size={18} /> Quick Expense Entry</div>
      <div className="em-category-btns">
        {Object.keys(EXPENSE_CATEGORIES).map(cat => (
          <button key={cat} className="em-cat-btn" onClick={() => onPayment({ type: 'Other', category: cat, payee_name: '' })}>
            <Receipt size={14} /> {cat}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ExpensesTab;
