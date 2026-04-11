import { today } from './constants';

export const defaultPayForm = {
  type: 'Utility', payee_name: '', amount: '', payment_method: 'Cash',
  cash_amount: '', upi_amount: '', reference_number: '', description: '',
  payment_date: today(), vendor_id: '', branch_id: '', category: '', sub_category: '',
  bill_total_amount: '', is_partial_payment: false
};
