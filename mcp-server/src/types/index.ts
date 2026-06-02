/**
 * Sarga Prints MCP Server — TypeScript interfaces for all DB entities
 */

// ─── Vendor ──────────────────────────────────────────────
export interface Vendor {
  id: number;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  city: string | null;
  category: string;
  credit_days: number;
  credit_limit: number;
  vendor_code: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: Date;
}

export interface VendorInvoice {
  id: number;
  vendor_id: number;
  invoice_number: string | null;
  invoice_date: string;
  due_date: string;
  amount: number;
  paid_amount: number;
  status: 'pending' | 'partial' | 'paid' | 'overdue';
  branch: string;
  notes: string | null;
  created_at: Date;
}

export interface VendorPayment {
  id: number;
  vendor_invoice_id: number;
  vendor_id: number;
  amount: number;
  payment_date: string;
  payment_mode: string;
  reference_number: string | null;
  notes: string | null;
  created_at: Date;
}

// ─── Customer ────────────────────────────────────────────
export interface Customer {
  id: number;
  mobile: string;
  name: string;
  type: 'Walk-in' | 'Retail' | 'Offset';
  email: string | null;
  gst: string | null;
  address: string | null;
  branch_id: number | null;
  client_type: string;
  internal_branch: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── Customer Payment / Order ────────────────────────────
export interface CustomerPayment {
  id: number;
  customer_id: number | null;
  customer_name: string;
  customer_mobile: string | null;
  bill_amount: number;
  total_amount: number;
  net_amount: number;
  sgst_amount: number;
  cgst_amount: number;
  advance_paid: number;
  balance_amount: number;
  payment_method: string;
  cash_amount: number;
  upi_amount: number;
  branch_id: number | null;
  reference_number: string | null;
  description: string | null;
  discount_percent: number;
  discount_amount: number;
  payment_date: string;
  order_lines: unknown;
  book_type: string;
  created_at: Date;
}

// ─── Job ─────────────────────────────────────────────────
export interface Job {
  id: number;
  customer_id: number | null;
  product_id: number | null;
  branch_id: number | null;
  job_number: string;
  job_name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  advance_paid: number;
  balance_amount: number;
  category: string | null;
  subcategory: string | null;
  machine_id: number | null;
  status: string;
  payment_status: string;
  delivery_date: string | null;
  priority: string | null;
  paper_cost: number;
  machine_cost: number;
  labour_cost: number;
  total_cost: number;
  profit: number;
  margin: number;
  required_sheets: number;
  used_sheets: number;
  created_at: Date;
  updated_at: Date;
}

// ─── Inventory ───────────────────────────────────────────
export interface InventoryItem {
  id: number;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  quantity: number;
  reorder_level: number;
  cost_price: number;
  sell_price: number;
  hsn: string | null;
  item_type: 'Retail' | 'Consumable';
  vendor_name: string | null;
  created_at: Date;
}

// ─── Paper Inventory ─────────────────────────────────────
export interface PaperType {
  id: number;
  category: 'LASER' | 'OFFSET';
  size_name: string;
  width_mm: number;
  height_mm: number;
  gsm: number | null;
  brand: string | null;
  is_active: boolean;
  created_at: Date;
}

export interface PaperStockSummary {
  id: number;
  paper_type_id: number;
  branch_id: number;
  current_sheets: number;
  reorder_level: number;
  last_updated: Date;
}

// ─── Consumables ─────────────────────────────────────────
export interface Consumable {
  id: number;
  name: string;
  category: string;
  unit: string;
  quantity_in_stock: number;
  reorder_level: number;
  unit_cost: number;
  supplier_name: string | null;
  branch: string;
  notes: string | null;
  created_at: Date;
}

// ─── Payment (vendor/utility/salary) ─────────────────────
export interface Payment {
  id: number;
  branch_id: number;
  type: string;
  payee_name: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  description: string | null;
  payment_date: string;
  vendor_id: number | null;
  staff_id: number | null;
  created_at: Date;
}

// ─── Staff ───────────────────────────────────────────────
export interface Staff {
  id: number;
  user_id: string;
  role: string;
  name: string;
  branch_id: number | null;
  is_active: boolean;
  created_at: Date;
}

// ─── Branch ──────────────────────────────────────────────
export interface SargaBranch {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  short_name: string | null;
  created_at: Date;
}

// ─── Audit Log ───────────────────────────────────────────
export interface AuditLog {
  id: number;
  user_id_internal: number | null;
  action: string;
  details: string | null;
  entity_type: string | null;
  entity_id: number | null;
  timestamp: Date;
}

// ─── Machine ─────────────────────────────────────────────
export interface Machine {
  id: number;
  machine_name: string;
  machine_type: string;
  counter_type: string;
  branch_id: number;
  location: string | null;
  book_type: string | null;
  is_active: boolean;
  created_at: Date;
}

// ─── Artwork Upload (Website Order) ──────────────────────
export interface ArtworkUpload {
  id: number;
  order_number: string;
  customer_id: number | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  product_type: string | null;
  quantity: number | null;
  size: string | null;
  printing_side: 'single' | 'double';
  special_instructions: string | null;
  files: unknown;
  status: string;
  assigned_designer_id: number | null;
  tracking_token: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── Product Hierarchy ───────────────────────────────────
export interface ProductCategory {
  id: number;
  name: string;
  position: number;
  is_active: boolean;
}

export interface ProductSubcategory {
  id: number;
  category_id: number;
  name: string;
  position: number;
  is_active: boolean;
}

export interface Product {
  id: number;
  subcategory_id: number;
  name: string;
  product_code: string | null;
  size: string | null;
  calculation_type: string;
  description: string | null;
  is_active: boolean;
}

// ─── Daily Report ────────────────────────────────────────
export interface DailyReportOffset {
  id: number;
  report_date: string;
  branch_id: number;
  opening_balance: number;
  closing_balance: number;
  total_collected: number;
  total_expenses: number;
  total_credit_out: number;
  total_credit_in: number;
  status: 'Draft' | 'Finalized';
}

// ─── Credit Customer ────────────────────────────────────
export interface CreditCustomer {
  id: number;
  customer_id: number | null;
  customer_name: string;
  customer_phone: string | null;
  credit_limit: number;
  current_balance: number;
  branch_id: number;
  is_active: boolean;
}

// ─── Generic Response Helpers ────────────────────────────
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ToolSuccess {
  success: true;
  [key: string]: unknown;
}

export interface ToolError {
  success: false;
  error: string;
  code?: string;
}
