import React, { useEffect, useMemo, useRef, useState, useCallback, Suspense } from 'react';
import { lazyWithRetry } from '../utils/errorUtils';
import { useDebounce } from '../hooks/useDebounce';
import SecureImage from '../components/SecureImage';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search, X, Plus, Minus, Trash2, Copy, Camera, QrCode, Clock, Star, FileText, Printer,
  ChevronDown, ChevronUp, ShoppingCart, User, CreditCard, Save, Eye, Check, AlertCircle,
  Loader2, Building2, Hash, Calendar, UserCheck, Phone, Mail, MapPin, Percent, IndianRupee,
  RotateCcw, MessageSquare, Zap, ScanLine, Image, Package, Tag, Upload, ArrowLeft, Users,
  ChevronRight, Circle, CheckCircle2, Sliders, Palette, Layers, Cpu, FileEdit
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import localDb from '../services/localDb';
import auth from '../services/auth';
import { CUSTOMER_TYPES } from '../constants';
import { useConfirm } from '../contexts/ConfirmContext';
import NoInternetState from '../components/NoInternetState';
import { calculateProductPrice } from '../utils/pricing';
import './Billing.css';
import { getWhatsAppShareLink } from '../utils/whatsappInvoice';
import PageContainer from '../components/ui/PageContainer';
import ScannerErrorBoundary from '../components/ScannerErrorBoundary';

const ScannerModal = lazyWithRetry(() => import('../components/ScannerModal'));

const serverToday = () => new Date().toISOString().split('T')[0];

const WhatsAppIcon = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" {...props}>
    <path d="M12.012 2c-5.506 0-9.988 4.482-9.988 9.988 0 1.76.459 3.473 1.33 4.985L2 22l5.163-1.355C8.618 21.493 10.287 22 12.01 22c5.507 0 9.988-4.482 9.988-9.988C22 6.482 17.519 2 12.012 2zm-.008 18.232c-1.577 0-3.123-.423-4.475-1.222l-.32-.19-3.328.873.889-3.245-.208-.332c-.878-1.4-1.341-3.018-1.341-4.68 0-4.808 3.911-8.718 8.72-8.718 2.285 0 4.433.89 6.05 2.508a8.508 8.508 0 0 1 2.51 6.06c-.004 4.81-3.914 8.72-8.722 8.72zm4.783-6.543c-.262-.13-1.554-.767-1.794-.853-.24-.087-.414-.13-.588.13-.174.26-.675.852-.828 1.026-.153.173-.306.195-.568.065-.262-.13-1.107-.408-2.109-1.3c-.78-.695-1.306-1.555-1.46-1.815-.153-.26-.016-.4.115-.53.118-.117.262-.304.393-.456.13-.152.174-.26.262-.433.087-.174.043-.325-.022-.456-.065-.13-.588-1.417-.806-1.942-.213-.512-.426-.442-.588-.45l-.5-.008c-.174 0-.457.065-.696.325-.24.26-.914.89-.914 2.17s.935 2.516 1.066 2.69c.13.174 1.84 2.81 4.46 3.94 1.05.452 1.865.73 2.505.932.66.21 1.26.182 1.737.11.53-.08 1.554-.635 1.774-1.214.22-.58.22-1.077.153-1.214-.067-.137-.24-.22-.502-.35z" />
  </svg>
);

// ─── Helpers ───
const normalizeCode = (value) => {
  let code = String(value || '');
  code = code.replace(/^\uFEFF/, '').trim().replace(/\s+/g, '').replace(/[\r\n]+/g, '').toUpperCase();
  return code;
};

// Derive book_type from category name
const bookTypeFromCategory = (catName) => {
  const name = String(catName || '').trim().toLowerCase();
  if (name === 'offset') return 'Offset';
  if (name === 'laser') return 'Laser';
  return 'Other';
};

// A line needs machine selection when it's a Laser item or the category is a
// photocopy/xerox service. Photocopy lines keep book_type 'Other' but still
// need a machine picked for meter/count tracking.
const isMachineCountLine = (line) =>
  !!line && (
    String(line.book_type || '').toLowerCase() === 'laser' ||
    /(photocopy|xerox)/i.test(String(line.category_name || ''))
  );

const getRequiredMachineCategory = (line) => {
  if (!line) return null;
  const catName = String(line.category_name || '').toLowerCase();
  if (/(colour|color)/i.test(catName) && /(photocopy|xerox)/i.test(catName)) {
    return 'Colour Photocopy';
  }
  if (/(photocopy|xerox)/i.test(catName)) {
    return 'Photocopy';
  }
  if (String(line.book_type || '').toLowerCase() === 'laser' || /laser/i.test(catName)) {
    return 'Laser';
  }
  return null;
};

const matchMachineForLine = (m, line) => {
  if (!m || !line) return false;
  if (!m.is_active) return false;
  const requiredCat = getRequiredMachineCategory(line);
  if (!requiredCat) return false;
  const mCat = String(m.machine_category || '').trim();
  const mBookType = String(m.book_type || '').trim().toLowerCase();
  if (requiredCat === 'Laser') {
    return mCat === 'Laser' || mBookType === 'laser';
  }
  if (requiredCat === 'Photocopy') {
    return mCat === 'Photocopy';
  }
  if (requiredCat === 'Colour Photocopy') {
    return mCat === 'Colour Photocopy';
  }
  return false;
};

const defaultPayment = () => ({
  selectedMethods: ['Cash'],
  methodAmounts: { Cash: 0, UPI: 0, Cheque: 0, 'Account Transfer': 0 },
  referenceNumber: '', description: '', paymentDate: serverToday()
});

const defaultForm = () => ({
  type: 'Retail', mobile: '', name: '', gst: '', email: '', address: ''
});

const defaultJobData = () => ({
  job_name: '', description: '', quantity: 1, unit_price: 0, total_amount: 0, advance_paid: 0,
  delivery_date: '', applied_extras: [], customPaperRate: 0, is_double_side: false,
  machine_id: '', waste_prints: 0, proof_prints: 0, count_to_machine: false,
  colour: '', paper_preference: '', numbering_from: '', numbering_to: '', special_instructions: '',
  matter_text: '', matter_file: null, matter_preview: null
});

// ─── Role-based discount limits ───
const DISCOUNT_LIMITS = {
  'Admin': 100,
  'Accountant': 30,
  'Front Office': 15,
};
const DEFAULT_DISCOUNT_LIMIT = 15;

// Job type options
const JOB_TYPE_OPTIONS = ['Offset', 'Laser', 'Digital', 'Flex', 'ID Card', 'Binding', 'Lamination', 'Other'];

// Customer types usable in invoice creation (from constants + Billing compat)
const BILLING_CUSTOMER_TYPES = [
  { value: 'Retail', label: 'Retail', description: 'Regular walk-in retail customer' },
  { value: 'Walk-in', label: 'Walk-in', description: 'One-time walk-in with full payment' },
  { value: 'Offset', label: 'Offset', description: 'Offset printing customer' },
];

// Billing tabs definition
const BILLING_TABS = [
  { key: 'customer', label: 'Customer', icon: User },
  { key: 'products', label: 'Add Products', icon: ShoppingCart },
  { key: 'payment', label: 'Payment', icon: CreditCard },
  { key: 'summary', label: 'Summary', icon: FileText },
];

// ─── Billing Component ───
const Billing = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin';
  const isFrontOffice = user?.role === 'Front Office';
  const isAccountant = user?.role === 'Accountant';

  const maxDiscountPct = useMemo(() => {
    if (isAdmin) return 100;
    if (isAccountant && user?.has_discount_permission) return 30;
    if (isFrontOffice) return 15;
    return DEFAULT_DISCOUNT_LIMIT;
  }, [isAdmin, isAccountant, isFrontOffice, user]);

  // Refs
  const customerNameRef = useRef(null);
  const customerGstRef = useRef(null);
  const customerEmailRef = useRef(null);
  const customerAddressRef = useRef(null);
  const productSearchRef = useRef(null);
  const paymentAmountRef = useRef(null);
  const paymentRefNumberRef = useRef(null);
  const saveTimerRef = useRef(null);

  // Core state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(user?.branch_id || null);
  const [jobType, setJobType] = useState('');
  const [activeTab, setActiveTab] = useState('customer');
  const [form, setForm] = useState(defaultForm());
  const [existingCustomer, setExistingCustomer] = useState(null);
  const [customerMatches, setCustomerMatches] = useState([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [hierarchy, setHierarchy] = useState([]);
  const [_machines, setMachines] = useState([]);
  const [orderLines, setOrderLines] = useState([]);
  const orderLinesRef = useRef(orderLines);
  useEffect(() => { orderLinesRef.current = orderLines; }, [orderLines]);
  const [detailProduct, setDetailProduct] = useState(null);
  const [_selectedProduct, setSelectedProduct] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState('');
  const [_extraInputs, _setExtraInputs] = useState([]);
  const [_jobData, _setJobData] = useState(defaultJobData());
  const [_showJobDetails, _setShowJobDetails] = useState(false);
  const [_showMachineDetails, _setShowMachineDetails] = useState(false);
  const [showQuickEntry, setShowQuickEntry] = useState(false);
  const [quickEntry, setQuickEntry] = useState({ name: '', amount: '' });
  const [payment, setPayment] = useState(defaultPayment());
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountMode, setDiscountMode] = useState('amount');
  const [discountInputAmount, setDiscountInputAmount] = useState(0);
  const [discountError, setDiscountError] = useState('');
  const [_scannerOpen, _setScannerOpen] = useState(false);
  const [scannedPreview, setScannedPreview] = useState(null);
  const [scannedQty, setScannedQty] = useState(1);
  const [duplicateItemModal, setDuplicateItemModal] = useState(null);
  const [machineModalOpen, setMachineModalOpen] = useState(false);
  const [lastBillData, setLastBillData] = useState(null);
  const [showPostBillOptions, setShowPostBillOptions] = useState(false);
  const [assignJobs, setAssignJobs] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [assignSelections, setAssignSelections] = useState({});
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState('');
  const staffByRole = useMemo(() => {
    const groups = {};
    (Array.isArray(staffOptions) ? staffOptions : []).forEach(s => {
      const role = s.role || 'Other';
      if (!groups[role]) groups[role] = [];
      groups[role].push(s);
    });
    return groups;
  }, [staffOptions]);
  // Only show machines that belong to the selected branch
  const branchMachines = useMemo(() => {
    const all = Array.isArray(_machines) ? _machines : [];
    if (!selectedBranchId) return all;
    return all.filter(m => String(m.branch_id) === String(selectedBranchId));
  }, [_machines, selectedBranchId]);

  // Laser or Photocopy items that still need a machine selected before billing can proceed
  const machineRequiredLines = useMemo(() => {
    const missing = (Array.isArray(orderLines) ? orderLines : [])
      .filter(line => isMachineCountLine(line) && !line.machine_id && !line.quick_added);
    const seen = new Set();
    return missing.filter(l => (seen.has(l.id) ? false : (seen.add(l.id), true)));
  }, [orderLines]);

  const handleGoToPayment = useCallback(() => {
    const missing = (Array.isArray(orderLines) ? orderLines : [])
      .filter(line => isMachineCountLine(line) && !line.machine_id && !line.quick_added);
    if (missing.length > 0) {
      setMachineModalOpen(true);
      return;
    }
    setActiveTab('payment');
  }, [orderLines]);

  const [showScanner, setShowScanner] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const customerSearchDebounced = useDebounce(customerSearchQuery, 350);
  const [highlightedCustomerIdx, setHighlightedCustomerIdx] = useState(-1);
  const [customerNoResults, setCustomerNoResults] = useState(false);
  const customerSearchRef = useRef(null);
  const customerDropdownRef = useRef(null);
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [productSearching, setProductSearching] = useState(false);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1);
  const [_fieldErrors, _setFieldErrors] = useState({});
  const [branchUpiId, setBranchUpiId] = useState('');
  const [showWhatsAppInput, setShowWhatsAppInput] = useState(false);
  const [whatsAppMobile, setWhatsAppMobile] = useState('');
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');

  useEffect(() => {
    if (showPostBillOptions) {
      setWhatsAppMobile(lastBillData?.customer?.mobile || '');
      setShowWhatsAppInput(false);
      setEmailAddress(lastBillData?.customer?.email || '');
      setShowEmailInput(false);
    }
  }, [showPostBillOptions, lastBillData]);

  const [recentProducts, setRecentProducts] = useState(
    () => {
      try {
        const val = localStorage.getItem('recentProducts');
        if (!val) return [];
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error('Failed to parse recentProducts from localStorage', e);
        return [];
      }
    }
  );
  const [_lastOrderCustomerType, setLastOrderCustomerType] = useState('');
  const [_lastOrderAutoDelivered, setLastOrderAutoDelivered] = useState(false);
  const [showRecentBills, setShowRecentBills] = useState(false);
  const [recentBills, setRecentBills] = useState([]);
  const [loadingRecentBills, setLoadingRecentBills] = useState(false);
  const [catalogPage, setCatalogPage] = useState(1);
  const CATALOG_PAGE_SIZE = 24;

  // UPI QR state
  const [upiQrUrl, setUpiQrUrl] = useState('');
  const [upiQrLoading, setUpiQrLoading] = useState(false);
  const [expandedJobs, setExpandedJobs] = useState({});

  const toggleJobExpanded = (lineId) => {
    setExpandedJobs(prev => ({
      ...prev,
      [lineId]: !prev[lineId]
    }));
  };

  const fetchRecentBills = useCallback(async () => {
    setLoadingRecentBills(true);
    try {
      let onlineBills = [];
      try {
        const res = await api.get('/customer-payments?limit=20', { _noCache: true });
        onlineBills = res.data?.data || res.data || [];
      } catch (err) {
        console.warn('Failed to fetch online bills', err);
      }

      let localBills = [];
      try {
        const offlineDb = (await import('../services/offlineDb')).default;
        localBills = await offlineDb.getAll('offlineBills');
      } catch (err) {
        console.warn('Failed to fetch offline bills', err);
      }

      const merged = [
        ...localBills.map(b => ({ ...b, isOffline: true })),
        ...onlineBills.filter(ob => !localBills.some(lb => lb.id === ob.id))
      ];

      merged.sort((a, b) => {
        const dateA = new Date(a.created_at || a.payment_date || a.paymentDate || 0);
        const dateB = new Date(b.created_at || b.payment_date || b.paymentDate || 0);
        return dateB - dateA;
      });

      setRecentBills(merged);
    } catch {
      toast.error('Failed to load recent bills');
    } finally {
      setLoadingRecentBills(false);
    }
  }, []);

  const handlePrintRecent = useCallback(async (b) => {
    try {
      const printData = {
        invoice_number: b.invoice_number || b.id || 'Draft',
        customer_name: b.customer_name || b.customerName || 'Retail Customer',
        customer_mobile: b.customer_mobile || b.customerMobile || '',
        customer_email: b.customer_email || b.email || '',
        customer_address: b.customer_address || b.address || '',
        customer_gst: b.customer_gst || b.gst || '',
        net_amount: b.net_amount || b.netAmount || b.totalAmount || 0,
        advance_paid: b.advance_paid != null ? b.advance_paid : (b.advancePaid != null ? b.advancePaid : 0),
        payment_method: b.payment_method || b.paymentMethod || 'Cash',
        payment_date: b.payment_date || b.paymentDate || b.created_at,
        order_lines: b.orderLines || b.order_lines || [],
        description: b.description || b.notes || ''
      };
      const { printInvoicePDF } = await import('../utils/invoicePdf');
      await printInvoicePDF(printData);
    } catch {
      toast.error('Failed to print invoice');
    }
  }, []);

  // Derived
  const isWalkIn = form.type === 'Walk-in' || !form.name.trim();
  const needsGst = !isWalkIn;
  const _isInternalBill = location.state?.internal || form.type === 'Internal' || form.type === 'Stock Transfer';
  const mobileValid = form.mobile.length === 10;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const gstValid = form.gst.length === 15;

  // ── Data loading ──
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      localDb.getBranches().catch(() => []),
      localDb.getMachines().catch(() => []),
      localDb.getProducts().catch(() => []),
    ]).then(([b, m, h]) => {
      if (cancelled) return;
      setBranches(b || []);
      setMachines(m || []);
      setHierarchy(Array.isArray(h) ? h : []);
      setLoading(false);
    });
    api.get('/product-hierarchy', { _noCache: true }).then(r => {
      if (cancelled || !r.data) return;
      setHierarchy(Array.isArray(r.data) ? r.data : []);
    }).catch(() => {});
    api.get('/branches', { _noCache: true }).then(r => {
      if (cancelled || !r.data) return;
      setBranches(Array.isArray(r.data) ? r.data : []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (user?.branch_id && !['admin', 'super_admin'].includes(user?.role?.toLowerCase())) {
      setSelectedBranchId(user.branch_id);
    }
  }, [user]);

  useEffect(() => {
    if (!selectedBranchId) { setBranchUpiId(''); return; }
    api.get('/branches', { _noCache: true }).then(r => {
      const branch = (Array.isArray(r.data) ? r.data : []).find(b => String(b.id) === String(selectedBranchId));
      setBranchUpiId(branch?.upi_id || '');
    }).catch(() => {});
  }, [selectedBranchId]);

  // Fetch staff for assignment
  useEffect(() => {
    api.get('/staff?active=true&all=true', { _noCache: true }).then(r => {
      const all = Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
      setStaffOptions(all.filter(s => s.role !== 'Front Office' && s.role !== 'Accountant'));
    }).catch(() => {});
  }, []);

  // Re-associate _product when hierarchy or orderLines load
  useEffect(() => {
    if (!hierarchy || hierarchy.length === 0 || orderLines.length === 0) return;
    let updated = false;
    const nextLines = orderLines.map(line => {
      if (line._product) return line;
      let foundProd = null;
      let foundCatName = null;
      for (const cat of hierarchy) {
        for (const sub of cat.subcategories || []) {
          for (const prod of sub.products || []) {
            if (prod.id === line.product_id) {
              foundProd = prod;
              foundCatName = cat.name;
              break;
            }
          }
          if (foundProd) break;
        }
        if (foundProd) break;
      }
      if (foundProd) {
        updated = true;
        return { ...line, _product: foundProd, category_name: line.category_name || foundCatName || '' };
      }
      return line;
    });
    if (updated) {
      setOrderLines(nextLines);
    }
  }, [hierarchy, orderLines]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restore draft from localStorage on mount (before prefill effects so they can override) ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem('billingDraft');
      if (!saved) return;
      const draft = JSON.parse(saved);
      if (draft.customer) setForm(draft.customer);
      if (draft.orders && draft.orders.length > 0) {
        setOrderLines(draft.orders.map(o => ({ ...o, _product: undefined, _matter_file: undefined, _matter_preview: undefined })));
      }
      if (draft.payment) setPayment(draft.payment);
      if (draft.activeTab) setActiveTab(draft.activeTab);
      if (typeof draft.discountPercent === 'number') setDiscountPercent(draft.discountPercent);
      if (draft.discountMode) setDiscountMode(draft.discountMode);
      if (typeof draft.discountInputAmount === 'number') setDiscountInputAmount(draft.discountInputAmount);
      if (draft.jobType) setJobType(draft.jobType);
      if (draft.selectedBranchId) setSelectedBranchId(draft.selectedBranchId);
      if (draft.existingCustomer) setExistingCustomer(draft.existingCustomer);
    } catch (e) {
      console.error('Failed to restore billing draft', e);
    }
  }, []);

  // ── Customer Prefill from Customers page (Walk-in Job, New Job buttons) ──
  useEffect(() => {
    const customer = location.state?.customer;
    if (customer) {
      const prefillType = BILLING_CUSTOMER_TYPES.find(t => t.value === customer.type) ? customer.type : form.type;
      setForm(p => ({
        ...p,
        type: prefillType,
        mobile: customer.mobile || p.mobile,
        name: customer.name || p.name,
        email: customer.email || p.email,
        address: customer.address || p.address,
        gst: customer.gst || customer.gstin || p.gst,
      }));
      if (customer.id) {
        setExistingCustomer({ id: customer.id, name: customer.name, mobile: customer.mobile, type: customer.type });
      }
      // Clear state so re-render doesn't re-trigger
      window.history.replaceState({}, document.title);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shortcut Prefill ──
  useEffect(() => {
    const sc = location.state?.fromShortcut && location.state?.shortcut;
    if (!sc) return;
    // Prefill customer type
    const typeMap = { walk_in: 'Walk-in', regular: 'Retail', credit: 'Retail' };
    setForm(prev => ({ ...prev, type: typeMap[sc.customer_type] || 'Walk-in' }));
    // Prefill order line
    const line = {
      id: `shortcut-${Date.now()}`,
      product_id: sc.product_id || null,
      product_name: sc.name,
      quantity: 1,
      unit_price: Number(sc.price) || 0,
      total_amount: Number(sc.price) || 0,
      calculation_type: 'flat',
      applied_extras: [],
      customPaperRate: 0,
      is_double_side: false,
      description: '',
      category: '',
      subcategory: '',
      machine_id: null,
      waste_prints: 0,
      proof_prints: 0,
      book_type: 'Laser',
      colour: '',
      paper_preference: '',
      numbering_from: '',
      numbering_to: '',
      special_instructions: '',
      matter_text: '',
      matter_file: null,
      matter_preview: null,
      is_inventory_item: false,
    };
    setOrderLines([line]);
    // Prefill payment mode
    const payMap = { cash: 'Cash', upi: 'UPI', card: 'Cash', credit: 'Credit' };
    const method = payMap[sc.payment_mode] || 'Cash';
    setPayment(prev => ({
      ...prev,
      selectedMethods: [method],
      methodAmounts: { Cash: method === 'Cash' ? Number(sc.price) || 0 : 0, UPI: method === 'UPI' ? Number(sc.price) || 0 : 0, Cheque: 0, 'Account Transfer': 0 },
    }));
    // Switch to summary tab for quick review
    setActiveTab('summary');
    // Clear state so re-render doesn't re-trigger
    window.history.replaceState({}, document.title);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto UPI QR Generation ──
  useEffect(() => {
    const upiAmt = Number(payment.methodAmounts.UPI) || 0;
    const hasUpi = payment.selectedMethods.includes('UPI');

    if (!hasUpi || upiAmt <= 0 || !branchUpiId) {
      setUpiQrUrl('');
      return;
    }

    setUpiQrLoading(true);
    const upiStr = `upi://pay?pa=${encodeURIComponent(branchUpiId)}&pn=${encodeURIComponent('SARGA OFFSET')}&am=${upiAmt.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Invoice Payment')}`;
    import('qr-creator')
      .then(mod => {
        const canvas = document.createElement('canvas');
        mod.default.render({ text: upiStr, radius: 0.0, ecLevel: 'M', fill: '#000000', background: '#ffffff', size: 200 }, canvas);
        return canvas.toDataURL('image/png');
      })
      .then(url => { setUpiQrUrl(url); setUpiQrLoading(false); })
      .catch(() => { setUpiQrUrl(''); setUpiQrLoading(false); });
  }, [payment.selectedMethods, payment.methodAmounts.UPI, branchUpiId]);

  // ── Computed totals ──
  const totals = useMemo(() => {
    const subtotal = orderLines.reduce((s, l) => s + (Number(l.total_amount) || 0), 0);
    const activePct = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
    const effectiveDiscount = discountMode === 'percent'
      ? subtotal * activePct / 100
      : (discountMode === 'amount' ? (Number(discountInputAmount) || 0) : 0);
    const discountAmount = Math.min(effectiveDiscount, subtotal);
    const afterDiscount = subtotal - discountAmount;
    const gross = afterDiscount;
    return { subtotal, activePct, effectiveDiscount, discountAmount, afterDiscount, sgst: 0, cgst: 0, gross };
  }, [orderLines, discountPercent, discountMode, discountInputAmount]);

  const advancePaid = useMemo(() =>
    payment.selectedMethods.reduce((s, m) => s + (Number(payment.methodAmounts[m]) || 0), 0),
    [payment.selectedMethods, payment.methodAmounts]
  );

  const _computeDiscTotal = useCallback((lines, discPct) => {
    const sub = lines.reduce((s, l) => s + (Number(l.total_amount) || 0), 0);
    return sub - Math.min(sub * Math.min(Math.max(Number(discPct) || 0, 0), 100) / 100, sub);
  }, []);

  const canProceed = useMemo(() => {
    if (!form.type) return false;
    if (isWalkIn) return orderLines.length > 0;
    if (form.type === 'Retail') return orderLines.length > 0;
    return form.mobile.length === 10 && form.name.trim().length > 0 && orderLines.length > 0;
  }, [form.mobile, form.name, form.gst, form.type, isWalkIn, orderLines.length]);

  const getStepIndex = useCallback((key) => BILLING_TABS.findIndex(t => t.key === key), []);

  const stepValid = useMemo(() => {
    const customer = !!form.type && (
      form.type === 'Walk-in' || form.type === 'Retail' ||
      (form.mobile.length === 10 && form.name.trim().length > 0)
    );
    const products = orderLines.length > 0;
    const paymentValid = isWalkIn ? advancePaid > 0 : true;
    const summary = true;
    return [customer, products, paymentValid, summary];
  }, [form.type, form.mobile, form.name, orderLines.length, advancePaid]);

  const canVisitStep = useCallback((idx) => {
    const currentIdx = getStepIndex(activeTab);
    if (idx <= currentIdx) return true;
    for (let i = 0; i < idx; i++) {
      if (!stepValid[i]) return false;
    }
    return true;
  }, [activeTab, stepValid, getStepIndex]);

  // ── Customer search — only show results after typing ──
  useEffect(() => {
    const q = customerSearchDebounced.trim();
    if (!q) {
      // Do NOT preload customers when empty — leave dropdown closed
      setCustomerMatches([]);
      setCustomerNoResults(false);
      setHighlightedCustomerIdx(-1);
      return;
    }
    setCustomerSearching(true);
    const t = setTimeout(async () => {
      try {
        const all = await localDb.getCustomers().catch(() => []);
        const filtered = (all || []).filter(c => c.client_type !== 'internal');
        const lower = q.toLowerCase();
        const results = filtered.filter(c =>
          (c.name && c.name.toLowerCase().includes(lower)) ||
          (c.mobile && c.mobile.includes(q)) ||
          (c.phone && c.phone.includes(q)) ||
          (c.gstin && c.gstin.toLowerCase().includes(lower)) ||
          (c.gst && c.gst.toLowerCase().includes(lower)) ||
          (c.company_name && c.company_name.toLowerCase().includes(lower))
        ).slice(0, 8);
        setCustomerMatches(results);
        setCustomerNoResults(results.length === 0);
        setHighlightedCustomerIdx(-1);
      } catch {
        setCustomerMatches([]);
        setCustomerNoResults(true);
      } finally {
        setCustomerSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearchDebounced]);

  const handleSelectCustomer = useCallback((c) => {
    setExistingCustomer(c);
    setCustomerMatches([]);
    setCustomerSearchQuery('');
    const rawType = c.type || c.customer_type || (c.client_type && c.client_type !== 'customer' && c.client_type !== 'internal' ? c.client_type : null) || form.type;
    let resolvedType = 'Retail';
    if (rawType) {
      const lower = String(rawType).trim().toLowerCase();
      if (lower === 'offset') resolvedType = 'Offset';
      else if (lower === 'walk-in' || lower === 'walk_in' || lower === 'walkin') resolvedType = 'Walk-in';
      else if (lower === 'retail') resolvedType = 'Retail';
      else resolvedType = rawType;
    }
    setForm(p => ({ ...p, mobile: c.mobile || '', name: c.name || '', type: resolvedType, email: c.email || '', address: c.address || '', gst: c.gstin || c.gst || '' }));
  }, [form.type]);

  const handleChangeCustomer = useCallback(() => {
    setExistingCustomer(null);
    setCustomerMatches([]);
    setCustomerSearchQuery('');
    setForm(p => ({ ...p, mobile: '', name: '', email: '', address: '', gst: '' }));
  }, []);

  const handleCustomerKeyDown = useCallback((e) => {
    if (!customerMatches.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedCustomerIdx(prev => Math.min(prev + 1, customerMatches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedCustomerIdx(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && highlightedCustomerIdx >= 0) {
      e.preventDefault();
      handleSelectCustomer(customerMatches[highlightedCustomerIdx]);
    } else if (e.key === 'Escape') {
      setCustomerMatches([]);
      setCustomerSearchQuery('');
    }
  }, [customerMatches, highlightedCustomerIdx, handleSelectCustomer]);

  // ── Product search & select ──
  const qrLookupMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(hierarchy) ? hierarchy : []).forEach(cat => (cat.subcategories || []).forEach(sub => (sub.products || []).forEach(prod => {
      const code = normalizeCode(prod.name || prod.title || '');
      if (code) map.set(code, { product: prod, catId: cat.id, subId: sub.id });
    })));
    return map;
  }, [hierarchy]);

  const filteredCatalogProducts = useMemo(() => {
    const all = [];
    (Array.isArray(hierarchy) ? hierarchy : []).forEach(cat => {
      if (selectedCategoryId && String(cat.id) !== String(selectedCategoryId)) return;
      (cat.subcategories || []).forEach(sub => {
        if (selectedSubcategoryId && String(sub.id) !== String(selectedSubcategoryId)) return;
        (sub.products || []).forEach(prod => {
          all.push({ product: prod, catId: cat.id, subId: sub.id, catName: cat.name, subName: sub.name });
        });
      });
    });
    return all;
  }, [hierarchy, selectedCategoryId, selectedSubcategoryId]);

  useEffect(() => { setCatalogPage(1); }, [selectedCategoryId, selectedSubcategoryId, productSearchQuery]);

  useEffect(() => {
    const q = productSearchQuery.trim();
    if (!q || q.length < 1) { setProductSuggestions([]); setSelectedSuggestionIdx(-1); setProductSearching(false); return; }
    setProductSearching(true);
    const t = setTimeout(() => {
      const lower = q.toLowerCase();
      const results = [];
      (Array.isArray(hierarchy) ? hierarchy : []).forEach(cat => {
        const catMatch = cat.name?.toLowerCase().includes(lower);
        (cat.subcategories || []).forEach(sub => {
          const subMatch = sub.name?.toLowerCase().includes(lower);
          (sub.products || []).forEach(prod => {
            const name = (prod.name || prod.title || '').toLowerCase();
            const normalized = normalizeCode(prod.name || prod.title || '');
            const codeMatch = normalized.includes(normalizeCode(q));
            if (name.includes(lower) || codeMatch || catMatch || subMatch) {
              results.push({ product: prod, catId: cat.id, subId: sub.id, catName: cat.name, subName: sub.name });
            }
          });
        });
      });
      setProductSuggestions(results.slice(0, 10));
      setSelectedSuggestionIdx(-1);
      setProductSearching(false);
    }, 200);
    return () => clearTimeout(t);
  }, [productSearchQuery, hierarchy]);

  const resolveProductUnitPrice = useCallback((product, qty = 1, isOffsetOverride) => {
    const isOffset = isOffsetOverride !== undefined ? isOffsetOverride : (String(form.type || '').trim().toLowerCase() === 'offset');
    const priceResult = calculateProductPrice({ product, quantity: qty, extras: [], isOffset });
    if (priceResult && priceResult.unit_price > 0) return priceResult.unit_price;
    if (product.mrp != null && Number(product.mrp) > 0) return Number(product.mrp);
    if (product.sell_price != null && Number(product.sell_price) > 0) return Number(product.sell_price);
    return 0;
  }, [form.type]);

  const updateLine = useCallback((id, field, value) => {
    setOrderLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      
      const calcType = l._product?.calculation_type || l.calculation_type;
      
      if (field === 'quantity' || field === 'customPaperRate' || field === 'is_double_side') {
        const newQty = field === 'quantity' ? Math.max(1, Number(value) || 1) : (Number(l.quantity) || 1);
        if (field === 'quantity') updated.quantity = newQty;
        
        const paperRate = field === 'customPaperRate' ? (Number(value) || 0) : (Number(l.customPaperRate) || 0);
        if (field === 'customPaperRate') updated.customPaperRate = paperRate;
        
        const doubleSide = field === 'is_double_side' ? !!value : !!l.is_double_side;
        if (field === 'is_double_side') updated.is_double_side = doubleSide;

        const isOffsetLine = String(form.type || '').trim().toLowerCase() === 'offset' || l.book_type === 'Offset';

        if (l._product && (calcType === 'Slab' || calcType === 'Range' || calcType === 'Normal')) {
          const priceResult = calculateProductPrice({
            product: l._product,
            quantity: newQty,
            extras: l.applied_extras || [],
            currentPaperRate: paperRate,
            isDoubleSide: doubleSide,
            isOffset: isOffsetLine,
          });
          if (priceResult) {
            updated.unit_price = priceResult.unit_price;
            updated.total_amount = priceResult.total_amount;
          } else {
            updated.total_amount = newQty * (Number(l.unit_price) || 0);
          }
        } else {
          updated.total_amount = newQty * (Number(l.unit_price) || 0);
        }
      } else if (field === 'unit_price') {
        updated.total_amount = (Number(l.quantity) || 1) * (Number(value) || 0);
      }
      return updated;
    }));
  }, [form.type]);

  const handleAddLineItem = useCallback(async (product, qty = 1, extras = [], catId, subId, catName, forceAddNew = false) => {
    let resolvedCatId = catId;
    let resolvedSubId = subId;
    let resolvedCatName = catName;

    if (!resolvedCatName && product && hierarchy) {
      for (const cat of hierarchy) {
        for (const sub of cat.subcategories || []) {
          for (const prod of sub.products || []) {
            if (prod.id === product.id) {
              resolvedCatId = cat.id;
              resolvedSubId = sub.id;
              resolvedCatName = cat.name;
              break;
            }
          }
          if (resolvedCatName) break;
        }
        if (resolvedCatName) break;
      }
    }

    const quantity = Number(qty) || 1;
    const existing = !forceAddNew ? orderLinesRef.current.find(l => l.product_id && l.product_id === product.id) : null;
    if (existing) {
      setDuplicateItemModal({ product, qty: quantity, extras, catId: resolvedCatId, subId: resolvedSubId, catName: resolvedCatName, existingLine: existing });
      setProductSearchQuery('');
      setProductSuggestions([]);
      return;
    }

    const derivedBookType = bookTypeFromCategory(resolvedCatName);
    const defaultPaperRate = product.has_paper_rate ? (Number(product.paper_rate) || 0) : 0;
    const isOffsetLine = String(form.type || '').trim().toLowerCase() === 'offset' || derivedBookType === 'Offset';

    const priceResult = calculateProductPrice({
      product,
      quantity,
      extras,
      currentPaperRate: defaultPaperRate,
      isDoubleSide: false,
      isOffset: isOffsetLine,
    });
    const unitPrice = priceResult && priceResult.unit_price > 0 ? priceResult.unit_price : resolveProductUnitPrice(product, quantity, isOffsetLine);
    const totalAmount = priceResult ? priceResult.total_amount : quantity * unitPrice;

    const line = {
      id: `${product.id || Date.now()}-${Date.now()}`,
      product_id: product.id,
      product_name: product.name || product.title || 'Product',
      _product: product,
      quantity,
      unit_price: unitPrice,
      total_amount: totalAmount,
      calculation_type: product.calculation_type || 'Normal',
      applied_extras: extras,
      customPaperRate: defaultPaperRate,
      is_double_side: false,
      description: '',
      category: resolvedCatId || '',
      category_name: resolvedCatName || '',
      subcategory: resolvedSubId || '',
      machine_id: null,
      waste_prints: 0,
      proof_prints: 0,
      book_type: derivedBookType,
      colour: '', paper_preference: '', numbering_from: '', numbering_to: '', special_instructions: '',
      matter_text: '', matter_file: null, matter_preview: null,
      is_inventory_item: false,
    };
    setOrderLines(prev => [...prev, line]);
    setSelectedProduct(null);
    setProductSearchQuery('');
    setRecentProducts(prev => {
      const next = [{ id: product.id, name: product.name || product.title, mrp: unitPrice }, ...prev.filter(p => p.id !== product.id)].slice(0, 20);
      localStorage.setItem('recentProducts', JSON.stringify(next));
      return next;
    });
  }, [resolveProductUnitPrice, updateLine, form.type, hierarchy]);

  // Recalculate order line prices when Customer Type changes (e.g., to/from 'Offset')
  useEffect(() => {
    if (orderLines.length === 0) return;
    const isOffset = String(form.type || '').trim().toLowerCase() === 'offset';
    setOrderLines(prev => {
      let changed = false;
      const updatedLines = prev.map(l => {
        const product = l._product || (l.product_id ? qrLookupMap.get(normalizeCode(l.product_name))?.product : null);
        if (!product) return l;
        const lineIsOffset = isOffset || l.book_type === 'Offset';
        const priceResult = calculateProductPrice({
          product,
          quantity: Number(l.quantity) || 1,
          extras: l.applied_extras || [],
          currentPaperRate: Number(l.customPaperRate) || 0,
          isDoubleSide: !!l.is_double_side,
          isOffset: lineIsOffset,
        });

        if (priceResult && (priceResult.unit_price !== l.unit_price || priceResult.total_amount !== l.total_amount)) {
          changed = true;
          return {
            ...l,
            unit_price: priceResult.unit_price,
            total_amount: priceResult.total_amount,
          };
        }
        return l;
      });
      return changed ? updatedLines : prev;
    });
  }, [form.type]);

  const handleQuickAdd = useCallback(() => {
    if (!quickEntry.name.trim() || !Number(quickEntry.amount)) { toast.error('Enter name and amount'); return; }
    setOrderLines(prev => [...prev, {
      id: `quick-${Date.now()}`,
      product_id: null,
      product_name: quickEntry.name.trim(),
      quantity: 1,
      unit_price: Number(quickEntry.amount),
      total_amount: Number(quickEntry.amount),
      calculation_type: 'flat',
      applied_extras: [], customPaperRate: 0, is_double_side: false, description: '',
      category: '', subcategory: '', machine_id: null, quick_added: true,
      waste_prints: 0, proof_prints: 0, book_type: 'Laser',
      colour: '', numbering_from: '', numbering_to: '', special_instructions: '',
      matter_text: '', matter_file: null, matter_preview: null, is_inventory_item: false,
    }]);
    setQuickEntry({ name: '', amount: '' });
    setShowQuickEntry(false);
  }, [quickEntry]);

  const _removeLine = useCallback((id) => {
    setOrderLines(prev => prev.filter(l => l.id !== id));
  }, []);

  const duplicateLine = useCallback((line) => {
    setOrderLines(prev => [...prev, { ...line, id: `${line.product_id || 'dup'}-${Date.now()}` }]);
  }, []);

  // ── QR / Barcode scan ──
  const handleQrLookup = useCallback(async (code, autoAdd = true) => {
    const normalized = normalizeCode(code);
    if (!normalized) return;
    const match = qrLookupMap.get(normalized);
    if (match) {
      if (autoAdd) {
        handleAddLineItem(match.product, 1, [], match.catId, match.subId, match.catName);
      } else {
        setScannedPreview({ product: match.product, catId: match.catId, subId: match.subId, catName: match.catName });
        setScannedQty(1);
      }
      return;
    }
    try {
      const { data } = await api.get(`/inventory/by-sku/${encodeURIComponent(normalized)}`, { _noCache: true });
      if (data) {
        const invProduct = { id: data.id, name: data.name, mrp: data.mrp || data.sell_price, sku: data.sku };
        if (autoAdd) {
          const isOffset = String(form.type || '').trim().toLowerCase() === 'offset';
          const offsetRate = isOffset && data.offset_unit_rate != null && Number(data.offset_unit_rate) > 0
            ? Number(data.offset_unit_rate)
            : null;
          const unitPrice = offsetRate != null ? offsetRate : Number(data.mrp || data.sell_price || 0);
          setOrderLines(prev => [...prev, {
            id: `inv-${data.id}-${Date.now()}`,
            product_id: data.id,
            inventory_item_id: data.id,
            product_name: data.name,
            quantity: 1,
            unit_price: unitPrice,
            total_amount: unitPrice,
            calculation_type: 'flat', applied_extras: [], customPaperRate: 0, is_double_side: false,
            description: '', category: '', subcategory: '', machine_id: null,
            waste_prints: 0, proof_prints: 0, book_type: 'Other',
            colour: '', paper_preference: '', numbering_from: '', numbering_to: '', special_instructions: '',
            matter_text: '', matter_file: null, matter_preview: null,
            is_inventory_item: true,
          }]);
          setRecentProducts(prev => {
            const next = [{ id: data.id, name: data.name, mrp: data.mrp }, ...prev.filter(p => p.id !== data.id)].slice(0, 20);
            localStorage.setItem('recentProducts', JSON.stringify(next));
            return next;
          });
        } else {
          setScannedPreview({ product: invProduct, isInventory: true });
          setScannedQty(1);
        }
      }
    } catch { toast.error('No product or inventory item found for this code.'); }
  }, [qrLookupMap, handleAddLineItem, form.type]);

  // ── Payment ──
  const handlePaymentMethod = useCallback((method) => {
    setPayment(prev => {
      const has = prev.selectedMethods.includes(method);
      if (has && prev.selectedMethods.length <= 1) return prev;
      if (has) {
        return { ...prev, selectedMethods: prev.selectedMethods.filter(m => m !== method) };
      }
      return { ...prev, selectedMethods: [...prev.selectedMethods, method], methodAmounts: { ...prev.methodAmounts, [method]: prev.methodAmounts[method] || 0 } };
    });
  }, []);

  const updateMethodAmount = useCallback((method, value) => {
    setPayment(prev => ({ ...prev, methodAmounts: { ...prev.methodAmounts, [method]: Math.max(0, Number(value) || 0) } }));
  }, []);

  // ── Handle submit ──
  const handleAddOrder = useCallback(async () => {
    // Branch validation
    if (!selectedBranchId) {
      setError('Please select a branch before creating invoice.');
      toast.error('Branch is required.');
      return;
    }
    // Customer type validation
    if (!form.type) {
      setError('Please select a customer type.');
      toast.error('Customer type is required.');
      return;
    }
    // Job type is optional — save if selected, skip if not
    if (!canProceed) { setError('Complete customer details and add at least one product.'); return; }
    if (orderLines.length === 0) { setError('Add at least one product.'); return; }
    if (advancePaid < 0) { setError('Invalid payment amount.'); return; }
    if (advancePaid > totals.gross * 1.01) { setError('Payment amount cannot exceed grand total.'); return; }
    if (discountError) { setError(discountError); return; }
    if (isWalkIn && advancePaid < totals.gross * 0.99) { setError('Walk-in customers must pay in full.'); return; }
    setError('');
    setSaving(true);
    try {
      let customerId = existingCustomer?.id;
      if (!customerId && form.name) {
        const custPayload = { name: form.name, mobile: form.mobile || null, type: isWalkIn ? 'Walk-in' : (form.type || 'Retail'), email: form.email || null, address: form.address || null, gstin: form.gst || null };
        const customer = await localDb.createCustomer(custPayload);
        customerId = customer.id;
      }
      const cashAmt = payment.selectedMethods.includes('Cash') ? (Number(payment.methodAmounts.Cash) || 0) : 0;
      const upiAmt = payment.selectedMethods.includes('UPI') ? (Number(payment.methodAmounts.UPI) || 0) : 0;
      const chequeAmt = payment.selectedMethods.includes('Cheque') ? (Number(payment.methodAmounts.Cheque) || 0) : 0;
      const transferAmt = payment.selectedMethods.includes('Account Transfer') ? (Number(payment.methodAmounts['Account Transfer']) || 0) : 0;
      const isCashUpiCombo = payment.selectedMethods.length === 2 && payment.selectedMethods.includes('Cash') && payment.selectedMethods.includes('UPI');
      const payMethodLabel = isCashUpiCombo ? 'Both' : (payment.selectedMethods[0] || 'Cash');
      const billPayload = {
        customer_id: customerId || null,
        customer_name: form.name.trim() || 'Walk-in Customer',
        customer_mobile: form.mobile || null,
        customer_email: (form.email || existingCustomer?.email || '').trim(),
        customer_type: isWalkIn ? 'Walk-in' : (form.type || 'Retail'),
        bill_amount: totals.subtotal,
        total_amount: totals.gross,
        net_amount: totals.gross,
        sgst_amount: 0,
        cgst_amount: 0,
        discount_percent: discountMode === 'percent' ? (discountPercent || null) : (totals.subtotal > 0 ? Number(((totals.discountAmount / totals.subtotal) * 100).toFixed(2)) : null),
        discount_amount: totals.discountAmount || null,
        advance_paid: advancePaid,
        payment_method: payMethodLabel,
        cash_amount: cashAmt,
        upi_amount: upiAmt,
        cheque_amount: chequeAmt,
        account_transfer_amount: transferAmt,
        reference_number: payment.referenceNumber || '',
        description: payment.description || '',
        payment_date: payment.paymentDate,
        book_type: jobType || (() => {
          if (orderLines.some(l => l.book_type === 'Offset')) return 'Offset';
          if (orderLines.some(l => l.book_type === 'Laser')) return 'Laser';
          return 'Other';
        })(),
        is_internal: 0,
        order_lines: orderLines.map(l => ({ ...l, matter_file: undefined, matter_preview: undefined, _product: undefined, id: Number(l.product_id) || null })),
        auto_deliver: isWalkIn,
        branch_id: selectedBranchId,
      };
      const matterFiles = orderLines.map(l => l.matter_file).filter(Boolean);

      // Pre-flight stock check
      const stockCheckItems = billPayload.order_lines
        .filter(l => l.product_id)
        .map(l => ({ product_id: l.product_id, quantity: l.quantity }));
      let forceStock = false;
      if (stockCheckItems.length > 0) {
        try {
          const { data: stockResult } = await api.post('/inventory/check-bulk-stock', { items: stockCheckItems });
          if (stockResult?.has_insufficiency) {
            const productNames = stockResult.insufficient.map(i =>
              `  • ${i.product_name} (need ${i.requested}, only ${i.available} available)`
            ).join('\n');
            const proceedAnyway = await confirm({
              title: 'Insufficient Stock',
              message: `The following products have insufficient stock:\n${productNames}\n\nDo you want to proceed and create the invoice anyway?`,
              confirmText: 'Proceed Anyway',
              cancelText: 'Cancel'
            });
            if (!proceedAnyway) {
              setSaving(false);
              return;
            }
            forceStock = true;
          }
        } catch (_) {
          // Stock check failed (offline/error) — proceed normally
        }
      }

      let result;
      try {
        result = await localDb.createBill(forceStock ? { ...billPayload, force: true } : billPayload, matterFiles);
      } catch (err) {
        if (err?.response?.status === 409) {
          const proceedAnyway = await confirm({
            title: 'Insufficient Stock',
            message: `${err?.response?.data?.message || 'Insufficient stock to reserve inventory'}. Do you want to proceed and create the invoice anyway?`,
            confirmText: 'Proceed Anyway',
            cancelText: 'Cancel'
          });
          if (proceedAnyway) {
            try {
              setSaving(true);
              result = await localDb.createBill({ ...billPayload, force: true }, matterFiles);
            } catch (retryErr) {
              setError(retryErr?.response?.data?.message || retryErr.message || 'Failed to create invoice.');
              toast.error('Invoice creation failed.');
              setSaving(false);
              return;
            }
          } else {
            setSaving(false);
            return;
          }
        } else {
          throw err;
        }
      }
      const lastBill = {
        customerId,
        paymentId: result?.payment?.id || result?.id || null,
        invoiceNumber: result?.bill?.invoice_number || result?.invoice_number || `INV-${result?.bill?.id || result?.id || Date.now()}`,
        invoiceDate: result?.bill?.created_at || result?.created_at || new Date().toISOString(),
        customer: { name: form.name, mobile: form.mobile, email: form.email, address: form.address, gst: form.gst, type: form.type },
        orderLines, totals, payment: { method: payMethodLabel, cash_amount: cashAmt, upi_amount: upiAmt, cheque_amount: chequeAmt, account_transfer_amount: transferAmt },
        jobs: result.jobs || [], upiId: branchUpiId,
        description: payment.description || ''
      };
      setLastBillData(lastBill);
      setLastOrderCustomerType(form.type);
      setLastOrderAutoDelivered(isWalkIn);

      // Prepare assign jobs from result
      if (result.jobs && result.jobs.length > 0) {
        setAssignJobs(result.jobs);
        const init = {};
        result.jobs.forEach(j => { init[j.id] = { designer: '', printer: '', other: '' }; });
        setAssignSelections(init);
      } else {
        setAssignJobs([]);
        setAssignSelections({});
      }

      // Reset form & clear draft
      setForm(defaultForm());
      setExistingCustomer(null);
      setOrderLines([]);
      setPayment(defaultPayment());
      setDiscountPercent(0);
      setDiscountInputAmount(0);
      setError('');
      setJobType('');
      localStorage.removeItem('billingDraft');
      toast.success('Invoice created successfully!');
      if (result.payment?.id) {
        window.dispatchEvent(new CustomEvent('paymentRecorded'));
      }
      setShowPostBillOptions(true);
    } catch (err) {
      console.error('[Billing] Invoice creation error:', err?.response?.data || err?.message || err);
      setError(err?.response?.data?.message || err.message || 'Failed to create invoice.');
      toast.error('Invoice creation failed.');
    } finally { setSaving(false); }
  }, [canProceed, orderLines, advancePaid, totals, isWalkIn, existingCustomer, form, payment, discountPercent, totals.discountAmount, totals.gross, selectedBranchId, jobType, branchUpiId, discountError, confirm]);

  // ── Staff assignment submit ──
  const handleAssignStaff = useCallback(async () => {
    const assignments = [];
    Object.entries(assignSelections).forEach(([jobId, roles]) => {
      Object.entries(roles).forEach(([roleKey, value]) => {
        if (!value) return;
        if (value.startsWith('__role__')) {
          const roleName = value.replace('__role__', '');
          assignments.push({ job_id: Number(jobId), staff_id: 'role', role: roleName });
        } else {
          assignments.push({ job_id: Number(jobId), staff_id: value });
        }
      });
    });
    if (assignments.length === 0) { toast.error('Select at least one staff member to assign.'); return; }
    setAssignLoading(true);
    setAssignError('');
    try {
      await api.post('/jobs/assignments/bulk', { assignments });
      toast.success('Staff assigned successfully!');
      setShowPostBillOptions(false);
    } catch (err) {
      setAssignError(err?.response?.data?.message || 'Failed to assign staff.');
    } finally {
      setAssignLoading(false);
    }
  }, [assignSelections]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'F2') { e.preventDefault(); customerSearchRef.current?.focus(); customerSearchRef.current?.select(); }
      if (e.key === 'F3') { e.preventDefault(); productSearchRef.current?.focus(); productSearchRef.current?.select(); }
      if (e.key === 'F4') { e.preventDefault(); paymentAmountRef.current?.focus(); paymentAmountRef.current?.select(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); handleAddOrder(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); productSearchRef.current?.focus(); productSearchRef.current?.select(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleAddOrder]);

  // ── Auto-save draft every 10s ──
  useEffect(() => {
    if (saveTimerRef.current) clearInterval(saveTimerRef.current);
    saveTimerRef.current = setInterval(() => {
      if (orderLines.length > 0 || form.mobile || form.name) {
        const draftLines = orderLines.map(({ _product, _matter_file, _matter_preview, ...rest }) => rest);
        localStorage.setItem('billingDraft', JSON.stringify({
          customer: form, orders: draftLines, payment,
          activeTab, discountPercent, discountMode, discountInputAmount,
          jobType, selectedBranchId, existingCustomer,
        }));
      }
    }, 10000);
    return () => clearInterval(saveTimerRef.current);
  }, [form, orderLines, payment, activeTab, discountPercent, discountMode, discountInputAmount, jobType, selectedBranchId, existingCustomer]);

  // ── Print on save ──
  const handlePrintLast = useCallback(async () => {
    if (lastBillData) {
      const { printInvoicePDF } = await import('../utils/invoicePdf');
      await printInvoicePDF(lastBillData);
    }
  }, [lastBillData]);

  // ── WhatsApp Actions ──
  const billToInvoice = useCallback((billData) => {
    if (!billData) return null;
    const paidAmount = Number(billData.payment?.cash_amount || 0) +
                       Number(billData.payment?.upi_amount || 0) +
                       Number(billData.payment?.cheque_amount || 0) +
                       Number(billData.payment?.account_transfer_amount || 0);
    const totalAmount = Number(billData.totals?.gross || 0);
    const balanceDue = Math.max(totalAmount - paidAmount, 0);
    const paymentMethod = billData.payment?.method || billData.payment_method || 'Cash';
    let paymentStatus = 'PENDING';
    if (balanceDue <= 0 && paidAmount > 0) paymentStatus = 'PAID';
    else if (paidAmount > 0) paymentStatus = 'PARTIAL';
    return {
      invoiceNo: billData.invoiceNumber,
      date: billData.invoiceDate,
      customerName: billData.customer?.name,
      customerMobile: billData.customer?.mobile,
      items: (billData.orderLines || []).map(l => ({
        name: l.product_name || l.name,
        qty: Number(l.quantity) || 1,
        unit: '',
        rate: Number(l.unit_price) || 0,
        amount: Number(l.total_amount) || 0,
      })),
      subtotal: Number(billData.totals?.subtotal || 0),
      discount: Number(billData.totals?.discountAmount || 0),
      gst: Number(billData.totals?.sgst || 0) + Number(billData.totals?.cgst || 0),
      total: totalAmount,
      paymentStatus,
      amountPaid: paidAmount,
      balanceDue,
      paymentMethod,
      upiId: branchUpiId || billData.upiId || billData.branch_upi_id,
    };
  }, []);

  const directWhatsAppUrl = useMemo(() => {
    if (!lastBillData) return '';
    const inv = billToInvoice(lastBillData);
    if (!inv) return '';
    return getWhatsAppShareLink(inv);
  }, [lastBillData, billToInvoice]);

  const dynamicWhatsAppUrl = useMemo(() => {
    const mobile = whatsAppMobile.trim();
    if (mobile.length !== 10 || !lastBillData) return '';
    const inv = { ...billToInvoice(lastBillData), customerMobile: mobile };
    return getWhatsAppShareLink(inv);
  }, [whatsAppMobile, lastBillData, billToInvoice]);

  const handleWhatsAppClick = useCallback(() => {
    setShowWhatsAppInput(true);
  }, []);

  const handleSendWhatsAppEffects = useCallback((mobile) => {
    // Update lastBillData customer mobile in-memory
    setLastBillData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        customer: {
          ...prev.customer,
          mobile: mobile
        }
      };
    });

    // Try to update customer in database if customerId is present
    if (lastBillData?.customerId) {
      api.put(`/customers/${lastBillData.customerId}`, {
        mobile: mobile,
        name: lastBillData.customer?.name,
        type: lastBillData.customer?.type || 'Retail',
        email: lastBillData.customer?.email || null,
        gst: lastBillData.customer?.gst || null,
        address: lastBillData.customer?.address || null
      }).then(() => {
        toast.success('Customer mobile updated in database.');
      }).catch(err => {
        console.error('Failed to update customer phone number in database:', err);
      });
    }
  }, [lastBillData]);

  // ── Email Actions ──
  const handleSendEmailClick = useCallback(() => {
    const customerEmail = lastBillData?.customer?.email || '';
    if (customerEmail) {
      handleSendEmail(customerEmail);
    } else {
      setShowEmailInput(true);
    }
  }, [lastBillData]);

  const handleSendEmail = useCallback(async (email) => {
    const paymentId = lastBillData?.paymentId;
    if (!paymentId || !email) {
      toast.error('Cannot send email: missing invoice ID or email address');
      return;
    }
    try {
      await api.post(`/invoices/${paymentId}/send-email`, {
        email,
        subject: `Invoice #${lastBillData.invoiceNumber} from Sarga Offset`,
        message: `Dear ${lastBillData.customer?.name || 'Customer'},\n\nPlease find your invoice #${lastBillData.invoiceNumber} below.\n\nThank you for your business!`
      });
      toast.success('Invoice sent via email successfully!');
      setShowEmailInput(false);
    } catch (err) {
      console.error('Send email error:', err);
      toast.error(err?.response?.data?.message || 'Failed to send email');
    }
  }, [lastBillData]);

  // ── Undo delete (5s) ──
  const handleRemoveWithUndo = useCallback((line) => {
    setOrderLines(prev => prev.filter(l => l.id !== line.id));
    toast((t) => (
      <div className="row gap-sm items-center">
        <span>Item removed</span>
        <button className="btn btn-xs btn-primary" onClick={() => { setOrderLines(prev => [...prev, line]); toast.dismiss(t.id); }}>Undo</button>
      </div>
    ), { duration: 5000 });
  }, []);

  // ── Back navigation with draft guard ──
  const _handleBack = useCallback(async () => {
    if (orderLines.length > 0 || form.name) {
      const yes = await confirm({
        title: 'Leave Invoice?',
        message: 'You have unsaved invoice data. Your draft will be auto-saved. Do you want to leave?',
        confirmText: 'Leave',
        cancelText: 'Stay',
      });
      if (!yes) return;
      const draftLines = orderLines.map(({ _product, _matter_file, _matter_preview, ...rest }) => rest);
      localStorage.setItem('billingDraft', JSON.stringify({ customer: form, orders: draftLines, totals }));
    }
    navigate('/invoices');
  }, [orderLines, form, totals, confirm, navigate]);

  // ── Loading state ──
  if (loading) {
    return (
    <PageContainer className="billing-page">
        <div className="billing-skeleton">
          {[1, 2, 3].map(i => <div key={i} className="skeleton-block" style={{ height: i === 1 ? 64 : 120, animationDelay: `${i * 0.1}s` }} />)}
        </div>
    </PageContainer>
    );
  }

  const branchRequiresAttention = !selectedBranchId;

  // ── Render ──
  return (
    <PageContainer className="billing-page">
      {/* HEADER */}
      <header className="billing-header">
        <div className="billing-header__left">
          <button
            className="btn btn-secondary btn-with-icon"
            onClick={() => navigate('/dashboard/sales/invoices')}
            title="Back to Invoices"
            aria-label="Back to Invoices"
          >
            <ArrowLeft size={16} /> Back to Invoices
          </button>
          <div className="billing-header__title-group">
            <h1 className="billing-header__title">New Customer Invoice</h1>
            <p className="billing-header__subtitle">Create a new invoice for retail, walk-in, offset or credit customer</p>
          </div>
        </div>
        <div className="billing-header__right">
          <button className="btn btn-secondary btn-with-icon" onClick={() => navigate('/dashboard/shortcuts')} title="Quick Bill Shortcuts" aria-label="Quick Bill Shortcuts">
            <Zap size={16} /> Shortcuts
          </button>
          <button className="btn btn-secondary btn-with-icon" onClick={() => { setShowRecentBills(true); fetchRecentBills(); }} title="Recent Invoices" aria-label="Recent Invoices">
            <Clock size={16} /> Recent
          </button>
          <button className="btn btn-secondary btn-with-icon" onClick={handleChangeCustomer} title="Change Customer" aria-label="Change or add customer">
            <User size={16} /> Change Customer
          </button>
          <button
            className="btn btn-primary billing-header__cta"
            onClick={handleAddOrder}
            disabled={saving || !canProceed}
            aria-label="Create Invoice"
          >
            {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Zap size={16} aria-hidden="true" />}
            <span>Create Invoice</span>
          </button>
        </div>
      </header>

      <NoInternetState variant="section" />

      {/* STICKY SUMMARY BAR — Branch + Stats */}
      <div className="billing-summary-bar">
        {/* Branch selector / display */}
        {!['admin', 'super_admin'].includes(user?.role?.toLowerCase()) ? (
          <div className="billing-summary-bar__item">
            <Building2 size={14} aria-hidden="true" />
            <span>{(Array.isArray(branches) ? branches : []).find(b => String(b.id) === String(selectedBranchId || user?.branch_id))?.name || user?.branch_short_name || 'Branch'}</span>
          </div>
        ) : (
          <div className={`billing-summary-bar__item${branchRequiresAttention ? ' billing-summary-bar__item--branch-required' : ''}`}>
            <Building2 size={14} aria-hidden="true" />
            <select
              value={selectedBranchId || ''}
              onChange={e => setSelectedBranchId(e.target.value || null)}
              aria-label="Select branch"
              title={branchRequiresAttention ? 'Branch is required' : ''}
            >
              <option value="">Branch *</option>
              {(Array.isArray(branches) ? branches : []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        <div className="billing-summary-bar__item">
          <Calendar size={14} aria-hidden="true" /><span>{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="billing-summary-bar__item">
          <UserCheck size={14} aria-hidden="true" /><span>{user?.name || 'Staff'}</span>
        </div>
        <div className="billing-summary-bar__spacer" />
        <div className="billing-summary-bar__item billing-summary-bar__item--total">
          <span>Items: {orderLines.length}</span>
          <span className="billing-summary-bar__amount">₹{totals.gross.toFixed(2)}</span>
        </div>
      </div>

      {/* ERROR */}
      {error && <div className="billing-error"><AlertCircle size={16} aria-hidden="true" /> {error}</div>}

      {/* PREMIUM STEP PROGRESS NAVIGATION */}
      <nav className="billing-steps" aria-label="Invoice creation steps">
        {BILLING_TABS.map((t, idx) => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          const isCompleted = stepValid[idx] && getStepIndex(activeTab) > idx;
          const isLocked = !canVisitStep(idx) && idx > getStepIndex(activeTab);
          const stepNumber = idx + 1;
          return (
            <button
              key={t.key}
              type="button"
              className={`billing-step ${isActive ? 'billing-step--active' : ''} ${isCompleted ? 'billing-step--completed' : ''} ${isLocked ? 'billing-step--locked' : ''}`}
              onClick={() => {
                if (!canVisitStep(idx)) return;
                if (t.key === 'payment') { handleGoToPayment(); return; }
                setActiveTab(t.key);
              }}
              disabled={isLocked}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`${t.label}${isCompleted ? ' (completed)' : ''}${isActive ? ' (current step)' : ''}${isLocked ? ' (locked)' : ''}`}
            >
              <span className="billing-step-indicator">
                {isCompleted ? (
                  <CheckCircle2 size={18} aria-hidden="true" className="billing-step-icon-completed" />
                ) : isLocked ? (
                  <span className="billing-step-locked-icon">🔒</span>
                ) : (
                  <span className="billing-step-number">{stepNumber}</span>
                )}
              </span>
              <span className="billing-step-content">
                <span className="billing-step-label">{t.label}</span>
                <span className="billing-step-desc">
                  {isActive ? 'Current step' : isCompleted ? 'Completed' : isLocked ? 'Fill previous step' : ''}
                </span>
              </span>
              {idx < BILLING_TABS.length - 1 && (
                <span className="billing-step-connector" aria-hidden="true" />
              )}
            </button>
          );
        })}
        <div className="billing-steps-progress" role="progressbar" aria-valuenow={getStepIndex(activeTab) + 1} aria-valuemin={1} aria-valuemax={BILLING_TABS.length}>
          <div className="billing-steps-progress-bar" style={{ width: `${((getStepIndex(activeTab) + 1) / BILLING_TABS.length) * 100}%` }} />
        </div>
      </nav>

      {/* CUSTOMER SECTION */}
      <div className="billing-section billing-section--customer" style={{ display: activeTab === 'customer' ? 'flex' : 'none' }}>
        <div className="billing-section__header"><User size={16} aria-hidden="true" /> <h2>Customer</h2></div>

        {/* CUSTOMER TYPE SELECTOR */}
        <div className="customer-type-selector" role="radiogroup" aria-label="Customer type">
          <span className="customer-type-selector__label">Customer Type</span>
          <div className="customer-type-selector__chips">
            {BILLING_CUSTOMER_TYPES.map(ct => {
              const isSelected = form.type === ct.value;
              return (
                <button
                  key={ct.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`customer-type-chip ${isSelected ? 'customer-type-chip--active' : ''}`}
                  onClick={() => {
                    setForm(p => ({ ...p, type: ct.value }));
                    if (ct.value === 'Walk-in') setActiveTab('products');
                  }}
                  title={ct.description}
                >
                  {isSelected && <Check size={12} aria-hidden="true" className="customer-type-chip__check" />}
                  <span className="customer-type-chip__label">{ct.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Customer details - hidden for Walk-in (auto-navigates to products) */}
        {form.type !== 'Walk-in' && (
          <>
            {/* Search existing customer */}
            <div className="autocomplete-wrapper" style={{ position: 'relative' }}>
              <div className="billing-field">
                <Search size={14} className="billing-field__icon" aria-hidden="true" />
                <label htmlFor="billing-customer-search" className="sr-only">Search customer by name or mobile</label>
                <input
                  id="billing-customer-search"
                  name="billingCustomerSearch"
                  ref={customerSearchRef}
                  type="text"
                  placeholder="Search customer by name or mobile..."
                  value={customerSearchQuery}
                  onChange={e => { setCustomerSearchQuery(e.target.value); setExistingCustomer(null); setHighlightedCustomerIdx(-1); }}
                  onKeyDown={handleCustomerKeyDown}
                  onBlur={() => setTimeout(() => { setCustomerMatches([]); setCustomerNoResults(false); }, 200)}
                  className="billing-field__input"
                  autoComplete="off"
                />
                {customerSearching && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--muted)', flexShrink: 0 }} aria-hidden="true" />}
              </div>

              {(customerMatches.length > 0 || (customerNoResults && customerSearchQuery.trim())) && (
                <div className="billing-dropdown" ref={customerDropdownRef} style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  overflowY: 'auto', maxHeight: 280
                }}>
                  {customerMatches.length > 0 ? (
                    customerMatches.map((c, i) => (
                      <div
                        key={c.id}
                        className={`billing-dropdown__item ${i === highlightedCustomerIdx ? 'billing-dropdown__item--highlighted' : ''}`}
                        onClick={() => handleSelectCustomer(c)}
                        onMouseEnter={() => setHighlightedCustomerIdx(i)}
                        role="option"
                        aria-selected={i === highlightedCustomerIdx}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span className="font-medium" style={{ fontSize: 13 }}>{c.name}</span>
                          <span className="text-muted" style={{ fontSize: 11, fontFamily: 'monospace' }}>{c.mobile || c.phone || '—'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {c.type && <span className="badge badge--sm">{c.type}</span>}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="billing-dropdown__item" style={{ justifyContent: 'center', color: 'var(--muted)', fontSize: 12 }}>
                      No customers found
                    </div>
                  )}
                  {customerSearchQuery.trim().length > 0 && (
                    <div className="billing-dropdown__item billing-dropdown__add" onClick={() => { setCustomerMatches([]); setCustomerSearchQuery(''); customerNameRef.current?.focus(); }}>
                      <Plus size={14} /> <span>Add New Customer</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Existing customer card */}
            {existingCustomer ? (
              <div className="billing-customer-card">
                <div className="billing-customer-card__header">
                  <div className="user-avatar user-avatar--sm">{form.name?.[0] || '?'}</div>
                  <div>
                    <div className="font-semibold">{form.name}</div>
                    <div className="text-xs muted">{form.mobile}</div>
                  </div>
                  <button className="btn btn-ghost btn-xs" onClick={handleChangeCustomer} style={{ marginLeft: 'auto' }} aria-label="Clear customer selection"><X size={14} aria-hidden="true" /></button>
                </div>
                <div className="billing-customer-card__details">
                  <span><Phone size={12} aria-hidden="true" /> {form.mobile}</span>
                  {form.gst && <span><FileText size={12} aria-hidden="true" /> {form.gst}</span>}
                  {form.address && <span><MapPin size={12} aria-hidden="true" /> {form.address}</span>}
                </div>
              </div>
            ) : (
              /* New customer form */
              <div className="billing-customer-form">
                <div className="billing-customer-form__grid">
                  <div className="billing-field">
                    <User size={14} className="billing-field__icon" aria-hidden="true" />
                    <label htmlFor="billing-name" className="sr-only">Customer Name</label>
                    <input id="billing-name" name="billingName" ref={customerNameRef} type="text"
                      placeholder={form.type === 'Retail' ? 'Full Name' : 'Full Name *'}
                      value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { const next = needsGst ? customerGstRef : customerEmailRef; next.current?.focus(); } }}
                      className="billing-field__input" autoComplete="name" />
                  </div>
                  <div className="billing-field billing-field--mobile">
                    <Phone size={14} className="billing-field__icon" aria-hidden="true" />
                    <label htmlFor="billing-mobile" className="sr-only">Mobile Number</label>
                    <input id="billing-mobile" name="billingMobile" type="tel"
                      placeholder={form.type === 'Retail' ? 'Mobile' : 'Mobile *'}
                      value={form.mobile} onChange={e => setForm(p => ({ ...p, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                      onKeyDown={e => { if (e.key === 'Enter') { customerNameRef.current?.focus(); } }}
                      className="billing-field__input" autoComplete="tel" />
                    {form.mobile.length > 0 && (mobileValid ? <CheckCircle2 size={16} className="billing-field__valid" aria-hidden="true" /> : <span className="billing-field__invalid" />)}
                  </div>
                  {needsGst && (
                    <div className="billing-field">
                      <FileText size={14} className="billing-field__icon" aria-hidden="true" />
                      <label htmlFor="billing-gst" className="sr-only">GST Number</label>
                      <input id="billing-gst" name="billingGst" ref={customerGstRef} type="text"
                        placeholder={'GST Number'}
                        value={form.gst} onChange={e => setForm(p => ({ ...p, gst: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { customerEmailRef.current?.focus(); } }}
                        className="billing-field__input" autoComplete="off" />
                      {form.gst.length > 0 && (gstValid ? <CheckCircle2 size={16} className="billing-field__valid" aria-hidden="true" /> : <span className="billing-field__invalid" />)}
                    </div>
                  )}
                  <div className="billing-field">
                    <Mail size={14} className="billing-field__icon" aria-hidden="true" />
                    <label htmlFor="billing-email" className="sr-only">Email</label>
                    <input id="billing-email" name="billingEmail" ref={customerEmailRef} type="email"
                      placeholder="Email"
                      value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { customerAddressRef.current?.focus(); } }}
                      className="billing-field__input" autoComplete="email" />
                    {form.email.length > 0 && (emailValid ? <CheckCircle2 size={16} className="billing-field__valid" aria-hidden="true" /> : <span className="billing-field__invalid" />)}
                  </div>
                </div>
                <div className="billing-field">
                  <MapPin size={14} className="billing-field__icon" aria-hidden="true" />
                  <label htmlFor="billing-address" className="sr-only">Address</label>
                  <input id="billing-address" name="billingAddress" ref={customerAddressRef} type="text"
                    placeholder="Address"
                    value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                    className="billing-field__input" autoComplete="street-address" />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* PRODUCTS SECTION */}
      <div className="billing-section billing-section--products" style={{ display: activeTab === 'products' ? 'flex' : 'none' }}>
        <div className="billing-section__header"><ShoppingCart size={16} aria-hidden="true" /> <h2>Add Products</h2></div>

        {/* Search + Quick Actions */}
        <div className="billing-product-top">
          <div className="billing-search-row" style={{ position: 'relative' }}>
            <div className="billing-field billing-field--search">
              <Search size={16} className="billing-field__icon" aria-hidden="true" />
              <input ref={productSearchRef} id="billingProductSearch" name="billingProductSearch" type="text"
                placeholder="Scan barcode • Search product • Enter code"
                value={productSearchQuery}
                onChange={e => { setProductSearchQuery(e.target.value); setSelectedSuggestionIdx(-1); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (selectedSuggestionIdx >= 0 && productSuggestions[selectedSuggestionIdx]) {
                      const s = productSuggestions[selectedSuggestionIdx];
                      handleAddLineItem(s.product, 1, [], s.catId, s.subId, s.catName);
                      setProductSearchQuery('');
                      setProductSuggestions([]);
                    } else if (productSearchQuery.trim()) {
                      handleQrLookup(productSearchQuery);
                      setProductSearchQuery('');
                      setProductSuggestions([]);
                    }
                  }
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedSuggestionIdx(i => Math.min(i + 1, productSuggestions.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedSuggestionIdx(i => Math.max(i - 1, 0)); }
                  if (e.key === 'Escape') { setProductSuggestions([]); setProductSearchQuery(''); }
                }}
                className="billing-field__input" aria-label="Search products by name or barcode" autoComplete="off" />
              {productSearching && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--muted)', flexShrink: 0 }} aria-hidden="true" />}
            </div>
            <div className="billing-quick-actions">
              <button className="btn btn-ghost btn-icon btn-xs" onClick={() => setShowScanner(true)} title="Camera Scan" aria-label="Camera scan"><Camera size={16} aria-hidden="true" /></button>
              <button className="btn btn-ghost btn-icon btn-xs" onClick={() => setShowQuickEntry(true)} title="Quick Add" aria-label="Quick add product"><Zap size={16} aria-hidden="true" /></button>
              {recentProducts.length > 0 && <button className="btn btn-ghost btn-icon btn-xs" onClick={() => { const r = recentProducts[0]; if (!r) return; let fullProd = null; for (const cat of (hierarchy || [])) { for (const sub of cat.subcategories || []) { for (const prod of sub.products || []) { if (prod.id === r.id) { fullProd = prod; break; } } if (fullProd) break; } if (fullProd) break; } handleAddLineItem(fullProd || r); }} title="Recent" aria-label="Add most recent product"><Clock size={16} aria-hidden="true" /></button>}
            </div>
            {/* Product suggestions dropdown */}
            {productSuggestions.length > 0 && (
              <div className="billing-product-suggestions">
                {productSuggestions.map((s, i) => (
                  <div key={`${s.product.id}-${i}`} className={`billing-product-suggestions__item ${i === selectedSuggestionIdx ? 'selected' : ''}`}
                    onClick={() => { handleAddLineItem(s.product, 1, [], s.catId, s.subId, s.catName); setProductSearchQuery(''); setProductSuggestions([]); }}
                    onMouseEnter={() => setSelectedSuggestionIdx(i)}>
                    <div className="billing-product-suggestions__name">{s.product.name || s.product.title}</div>
                    <div className="billing-product-suggestions__meta">
                      {(() => { const p = resolveProductUnitPrice(s.product); return <span>{p > 0 ? `₹${p.toLocaleString()}` : 'Custom pricing'}</span>; })()}
                      {s.catName && <span className="text-muted">{s.catName}{s.subName ? ` / ${s.subName}` : ''}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Category filters */}
          <div className="billing-category-row">
            <select value={selectedCategoryId} onChange={e => { setSelectedCategoryId(e.target.value); setSelectedSubcategoryId(''); }} className="billing-select">
              <option value="">All Categories</option>
              {(Array.isArray(hierarchy) ? hierarchy : []).map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
            {selectedCategoryId && (
              <select value={selectedSubcategoryId} onChange={e => setSelectedSubcategoryId(e.target.value)} className="billing-select">
                <option value="">All Subcategories</option>
                {((Array.isArray(hierarchy) ? hierarchy : []).find(c => String(c.id) === String(selectedCategoryId))?.subcategories || []).map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Quick Entry popup */}
        {showQuickEntry && (
          <div className="billing-quick-entry">
            <label htmlFor="billing-quick-name" className="sr-only">Product name</label>
            <input id="billing-quick-name" name="billingQuickName" type="text" placeholder="Product name" value={quickEntry.name} onChange={e => setQuickEntry(p => ({ ...p, name: e.target.value }))} className="billing-field__input" autoComplete="off" />
            <label htmlFor="billing-quick-amount" className="sr-only">Amount</label>
            <input id="billing-quick-amount" name="billingQuickAmount" type="number" placeholder="Amount" value={quickEntry.amount} onChange={e => setQuickEntry(p => ({ ...p, amount: e.target.value }))} className="billing-field__input" />
            <button className="btn btn-primary btn-sm" onClick={handleQuickAdd}>Add</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowQuickEntry(false)}>Cancel</button>
          </div>
        )}

        {/* Catalog Grid */}
        {(() => {
          const totalProducts = filteredCatalogProducts.length;
          const totalPages = Math.ceil(totalProducts / CATALOG_PAGE_SIZE);
          const safePage = Math.min(catalogPage, Math.max(1, totalPages));
          const pageProducts = filteredCatalogProducts.slice(
            (safePage - 1) * CATALOG_PAGE_SIZE,
            safePage * CATALOG_PAGE_SIZE
          );
          return (
            <>
              {totalProducts === 0 ? (
                <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No products found for the selected filters.
                </div>
              ) : (
                <>
                  <div className="billing-catalog-grid">
                    {pageProducts.map(({ product: prod, catId, subId, catName, subName }) => {
                      const displayPrice = resolveProductUnitPrice(prod);
                      return (
                        <div
                          key={prod.id}
                          className="billing-catalog-item"
                          onClick={() => handleAddLineItem(prod, 1, [], catId, subId, catName)}
                          title={`${catName} › ${subName}`}
                        >
                          <div className="billing-catalog-item__icon">
                            {prod.image_url ? (
                              <SecureImage
                                src={prod.image_url}
                                alt={prod.name || prod.title}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
                              />
                            ) : (
                              <Package size={18} aria-hidden="true" />
                            )}
                            <button className="billing-catalog-item__view"
                              title="View full details"
                              onClick={e => { e.stopPropagation(); setDetailProduct(prod); }}
                            >
                              <Eye size={14} />
                            </button>
                          </div>
                          <div className="billing-catalog-item__name">{prod.name || prod.title}</div>
                          <div className="billing-catalog-item__price">
                            {displayPrice > 0 ? `₹${displayPrice.toLocaleString()}` : 'Custom'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {totalPages > 1 && (
                    <div className="billing-pagination">
                      <span className="billing-pagination__info">
                        {(safePage - 1) * CATALOG_PAGE_SIZE + 1}–{Math.min(safePage * CATALOG_PAGE_SIZE, totalProducts)} of {totalProducts} products
                      </span>
                      <div className="billing-pagination__pages">
                        <button className="billing-pagination__btn" disabled={safePage <= 1} onClick={() => setCatalogPage(p => Math.max(1, p - 1))} aria-label="Previous page">‹ Prev</button>
                        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 7) { pageNum = i + 1; }
                          else if (safePage <= 4) { pageNum = i + 1; }
                          else if (safePage >= totalPages - 3) { pageNum = totalPages - 6 + i; }
                          else { pageNum = safePage - 3 + i; }
                          return (
                            <button key={pageNum} className={`billing-pagination__btn ${pageNum === safePage ? 'active' : ''}`} onClick={() => setCatalogPage(pageNum)} aria-label={`Page ${pageNum}`} aria-current={pageNum === safePage ? 'page' : undefined}>
                              {pageNum}
                            </button>
                          );
                        })}
                        <button className="billing-pagination__btn" disabled={safePage >= totalPages} onClick={() => setCatalogPage(p => Math.min(totalPages, p + 1))} aria-label="Next page">Next ›</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          );
        })()}

        {/* Selected Products Table */}
        {orderLines.length > 0 ? (
          <div className="billing-products-layout">
            <div className="billing-table-wrapper">
              <table className="billing-table">
                <thead>
                  <tr>
                    <th scope="col" style={{ width: '30%' }}>Product</th>
                    <th scope="col" style={{ width: '15%' }}>Qty</th>
                    <th scope="col" style={{ width: '15%' }}>Rate</th>
                    <th scope="col" style={{ width: '16%' }}>Total</th>
                    <th scope="col" style={{ width: '14%', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orderLines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        <div className="billing-product-cell">
                          <div className="billing-product-cell__name">{line.product_name}</div>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', marginTop: '4px' }}>
                            {line.book_type && <span className="badge badge--sm">{line.book_type}</span>}
                            {line._product?.has_paper_rate ? (
                              <span className="badge badge--sm" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                Paper Rate: ₹{line.customPaperRate}
                              </span>
                            ) : null}
                            {line.is_double_side ? (
                              <span className="badge badge--sm" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                Double Side
                              </span>
                            ) : null}
                            {line.machine_id ? (
                              <span className="badge badge--sm" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                {_machines.find(m => m.id === line.machine_id)?.machine_name || 'Machine'}
                              </span>
                            ) : null}
                          </div>
                          
                          {/* Inline options for custom paper rate and double side */}
                          {(line._product?.has_paper_rate || line._product?.has_double_side_rate) && (
                            <div className="row gap-sm items-center mt-8" style={{ background: 'var(--surface-2, rgba(255,255,255,0.03))', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', maxWidth: 'fit-content' }}>
                              {line._product?.has_paper_rate && (
                                <div className="row items-center gap-xxs">
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted, #aaa)' }}>Paper Rate:</span>
                                  <input
                                    type="number"
                                    value={line.customPaperRate}
                                    step="0.01"
                                    min="0"
                                    onChange={(e) => updateLine(line.id, 'customPaperRate', Number(e.target.value) || 0)}
                                    className="billing-paper-rate-input"
                                    aria-label="Custom paper rate"
                                  />
                                </div>
                              )}
                              {line._product?.has_double_side_rate && (
                                <div className="row items-center gap-xxs" style={{ marginLeft: line._product?.has_paper_rate ? '8px' : '0' }}>
                                  <label style={{ fontSize: '11px', color: 'var(--text-muted, #aaa)', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', margin: 0 }}>
                                    <input
                                      type="checkbox"
                                      checked={!!line.is_double_side}
                                      onChange={(e) => updateLine(line.id, 'is_double_side', e.target.checked)}
                                      style={{ cursor: 'pointer', width: '13px', height: '13px' }}
                                    />
                                    Double Side
                                  </label>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Machine selection for Laser / Photocopy category */}
                          {isMachineCountLine(line) && !line.quick_added && (
                            <div className="row items-center gap-xxs mt-8" style={{ background: 'var(--surface-2, rgba(255,255,255,0.03))', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', maxWidth: 'fit-content' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted, #aaa)', marginRight: '4px' }}>Machine:</span>
                              <select
                                value={line.machine_id || ''}
                                onChange={(e) => updateLine(line.id, 'machine_id', e.target.value ? Number(e.target.value) : null)}
                                className="billing-input-sm"
                                style={{ padding: '2px 4px', fontSize: '11px', height: '22px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', cursor: 'pointer', outline: 'none' }}
                                aria-label="Select photocopy machine"
                              >
                                <option value="">-- Select Machine --</option>
                                {branchMachines
                                  .filter((m) => matchMachineForLine(m, line))
                                  .map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.machine_name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="billing-qty-adjust">
                          <button className="btn btn-ghost btn-icon btn-xs" onClick={() => updateLine(line.id, 'quantity', Math.max(1, (Number(line.quantity) || 1) - 1))} aria-label="Decrease quantity"><Minus size={12} aria-hidden="true" /></button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={Number(line.quantity).toLocaleString('en-IN')}
                            min="1"
                            aria-label="Quantity"
                            onChange={e => {
                              const raw = e.target.value.replace(/[^0-9]/g, '');
                              updateLine(line.id, 'quantity', Math.max(1, Number(raw) || 1));
                            }}
                            className="billing-qty-input"
                          />
                          <button className="btn btn-ghost btn-icon btn-xs" onClick={() => updateLine(line.id, 'quantity', (Number(line.quantity) || 1) + 1)} aria-label="Increase quantity"><Plus size={12} aria-hidden="true" /></button>
                        </div>
                      </td>
                      <td>
                        <input type="number" value={line.unit_price} onChange={e => updateLine(line.id, 'unit_price', Number(e.target.value) || 0)} className="billing-input-num" aria-label="Unit price" />
                      </td>
                      <td className="font-bold" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>₹{Number(line.total_amount).toLocaleString()}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div className="billing-row-actions">
                          <button className="btn btn-ghost btn-icon btn-xs" onClick={() => setDetailProduct(line._product || { id: line.product_id, name: line.product_name, mrp: line.unit_price })} title="View details"><Eye size={14} aria-hidden="true" /></button>
                          <button className="btn btn-ghost btn-icon btn-xs" onClick={() => duplicateLine(line)} title="Duplicate"><Copy size={14} aria-hidden="true" /></button>
                          <button className="btn btn-ghost btn-icon btn-xs text-error" onClick={() => handleRemoveWithUndo(line)} title="Remove"><Trash2 size={14} aria-hidden="true" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Right floating summary */}
            <div className="billing-summary-side">
              <div className="billing-summary-side__card">
                <div className="billing-summary-side__row"><span>Subtotal</span><span>₹{totals.subtotal.toFixed(2)}</span></div>
                {totals.discountAmount > 0 && <div className="billing-summary-side__row billing-summary-side__row--discount"><span>Discount</span><span>-₹{totals.discountAmount.toFixed(2)}</span></div>}
                <div className="billing-summary-side__row">
                  <span className="text-muted" style={{ fontSize: 10, fontStyle: 'italic' }}>GST incl. in price</span>
                </div>
                <div className="billing-summary-side__divider" />
                <div className="billing-summary-side__row billing-summary-side__row--grand"><span>Grand Total</span><span>₹{totals.gross.toFixed(2)}</span></div>

                {/* Discount controls */}
                <div className="billing-discount-row">
                  <span className="text-xs muted">Discount <span style={{ fontSize: 10, color: 'var(--muted)' }}>(max {maxDiscountPct}%)</span></span>
                  <div className="row gap-xs items-center">
                    {discountMode === 'percent' ? (
                      <input
                        type="number"
                        placeholder="Discount %"
                        value={discountPercent || ''}
                        onChange={e => {
                          const val = Number(e.target.value) || 0;
                          setDiscountPercent(val);
                          if (val > maxDiscountPct) {
                            setDiscountError(`You are not allowed to give more than ${maxDiscountPct}% discount`);
                          } else {
                            setDiscountError('');
                          }
                        }}
                        className="billing-input-sm"
                        min="0"
                        max={maxDiscountPct}
                      />
                    ) : (
                      <input
                        type="number"
                        placeholder="Discount Amount (₹)"
                        value={discountInputAmount || ''}
                        onChange={e => {
                          const val = Number(e.target.value) || 0;
                          setDiscountInputAmount(val);
                          const subtotal = totals.subtotal;
                          if (subtotal > 0) {
                            const pct = (val / subtotal) * 100;
                            if (pct > maxDiscountPct) {
                              setDiscountError(`You are not allowed to give more than ${maxDiscountPct}% discount`);
                            } else {
                              setDiscountError('');
                            }
                          } else {
                            setDiscountError('');
                          }
                        }}
                        className="billing-input-sm"
                        min="0"
                      />
                    )}
                    <div className="billing-discount-toggle">
                      <button type="button" className={`billing-discount-toggle__btn ${discountMode === 'percent' ? 'active' : ''}`} onClick={() => { setDiscountMode('percent'); setDiscountPercent(0); setDiscountInputAmount(0); setDiscountError(''); }}>%</button>
                      <button type="button" className={`billing-discount-toggle__btn ${discountMode === 'amount' ? 'active' : ''}`} onClick={() => { setDiscountMode('amount'); setDiscountPercent(0); setDiscountInputAmount(0); setDiscountError(''); }}>₹</button>
                    </div>
                  </div>
                </div>
                {discountError && (
                  <div className="billing-discount-error">
                    <AlertCircle size={12} aria-hidden="true" />
                    <span>{discountError}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="billing-empty-products">
            <Package size={28} className="muted" />
            <p className="muted text-sm">No products added yet</p>
            <p className="muted text-xs">Search above or scan a barcode to add items</p>
          </div>
        )}
        <div className="billing-step-footer">
          <div className="billing-step-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveTab('customer')}>
              ← Back: Customer
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!stepValid[1]} onClick={handleGoToPayment}>
              Next: Payment →
            </button>
          </div>
          {!stepValid[1] && (
            <div className="billing-step-warning">
              Add at least one product to continue
            </div>
          )}
        </div>
      </div>

      {/* PAYMENT SECTION */}
      <div className="billing-section billing-section--payment" style={{ display: activeTab === 'payment' ? 'flex' : 'none' }}>
        <div className="billing-section__header"><CreditCard size={16} aria-hidden="true" /> <h2>Payment</h2></div>

        {/* Amount received display */}
        <div className="billing-payment-amount">
          <label className="text-xs muted">Amount Received</label>
          <div className="billing-payment-amount__value">₹{advancePaid.toFixed(2)}</div>
        </div>

        {/* Payment method chips */}
        <div className="billing-chips billing-chips--payment">
          {['Cash', 'UPI', 'Cheque', 'Account Transfer'].map(m => (
            <button key={m} className={`chip ${payment.selectedMethods.includes(m) ? 'active' : ''}`}
              onClick={() => handlePaymentMethod(m)}>
              {m}
              {payment.selectedMethods.length > 1 && payment.selectedMethods.includes(m) && <span className="chip__check"><Check size={10} /></span>}
            </button>
          ))}
        </div>

        {/* Per-method amounts */}
        <div className="billing-payment-inputs">
          {payment.selectedMethods.map((m) => (
            <div key={m} className="billing-field" style={{ position: 'relative' }}>
              <IndianRupee size={14} className="billing-field__icon" aria-hidden="true" />
              <input
                ref={m === 'Cash' ? paymentAmountRef : null}
                id={`paymentAmount-${m}`}
                name={`paymentAmount-${m}`}
                type="number"
                placeholder={`${m} amount`}
                value={payment.methodAmounts[m] || ''}
                onChange={e => updateMethodAmount(m, e.target.value)}
                className="billing-field__input"
                aria-label={`${m} amount`}
                autoComplete="off"
                style={{ paddingRight: '55px' }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, padding: '2px 6px', height: 'auto', minHeight: 'unset', fontWeight: 600, color: 'var(--primary)' }}
                onClick={() => {
                  const otherAmt = payment.selectedMethods.reduce((s, method) => s + (method !== m ? (Number(payment.methodAmounts[method]) || 0) : 0), 0);
                  const remaining = Math.max(0, totals.gross - otherAmt);
                  updateMethodAmount(m, remaining.toFixed(2));
                }}
              >
                Full
              </button>
              <span className="text-xs text-muted">{m}</span>
            </div>
          ))}
          {payment.selectedMethods.length > 1 && (
            <div className="billing-payment-balance">
              <span>Remaining</span>
              <span className="font-bold">₹{Math.max(totals.gross - advancePaid, 0).toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Auto UPI QR */}
        {payment.selectedMethods.includes('UPI') && (
          <div>
            {!branchUpiId && (
              <div style={{ fontSize: 12, padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }} className="text-muted">
                <AlertCircle size={13} aria-hidden="true" style={{ color: 'var(--destructive)' }} />
                Select a branch with a UPI ID to enable QR generation.
              </div>
            )}
            {branchUpiId && Number(payment.methodAmounts.UPI) > 0 && (
              <div className="billing-upi-qr">
                <span className="billing-upi-qr__label">Scan to Pay via UPI</span>
                {upiQrLoading ? (
                  <Loader2 size={32} className="animate-spin" style={{ color: 'var(--muted)' }} />
                ) : upiQrUrl ? (
                  <img src={upiQrUrl} alt="UPI QR Code" className="billing-upi-qr__img" width={160} height={160} />
                ) : null}
                <span className="billing-upi-qr__amount">₹{Number(payment.methodAmounts.UPI).toFixed(2)}</span>
                <span className="billing-upi-qr__id">{branchUpiId}</span>
              </div>
            )}
          </div>
        )}

        {/* Reference + Notes */}
        <div className="billing-payment-extras">
          <div className="billing-field">
            <Hash size={14} className="billing-field__icon" aria-hidden="true" />
            <label htmlFor="billing-ref" className="sr-only">Reference number</label>
            <input id="billing-ref" name="billingRef" ref={paymentRefNumberRef} type="text"
              placeholder="Reference number (required for non-cash)"
              value={payment.referenceNumber}
              onChange={e => setPayment(p => ({ ...p, referenceNumber: e.target.value }))}
              className="billing-field__input" autoComplete="off" />
          </div>
          <div className="billing-field">
            <MessageSquare size={14} className="billing-field__icon" aria-hidden="true" />
            <label htmlFor="billing-notes" className="sr-only">Notes</label>
            <textarea id="billing-notes" name="billingNotes"
              placeholder="Notes (optional)"
              rows="3"
              value={payment.description}
              onChange={e => setPayment(p => ({ ...p, description: e.target.value }))}
              className="billing-field__input" style={{ resize: 'vertical', minHeight: 60 }} />
          </div>
        </div>


        <div className="billing-step-footer">
          <div className="billing-step-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveTab('products')}>
              ← Back: Products
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!stepValid[2]} onClick={() => setActiveTab('summary')}>
              Next: Summary →
            </button>
          </div>
          {!stepValid[2] && (
            <div className="billing-step-warning">
              Enter at least one payment amount to continue
            </div>
          )}
        </div>
      </div>

      {/* SUMMARY SECTION */}
      <div className="billing-section billing-section--summary" style={{ display: activeTab === 'summary' ? 'flex' : 'none' }}>
        <div className="billing-section__header">
          <FileText size={18} aria-hidden="true" style={{ color: 'var(--accent)' }} /> 
          <h2>Order & Payment Summary</h2>
        </div>

        {/* High-Fidelity Totals Breakdown Card */}
        <div className="billing-summary-final-card">
          <div className="billing-summary-final-header">
            <div className="billing-summary-status-tag">
              <span className={`status-dot ${advancePaid >= totals.gross ? 'status-dot--paid' : advancePaid > 0 ? 'status-dot--partial' : 'status-dot--pending'}`} />
              <span>{advancePaid >= totals.gross ? 'Paid in Full' : advancePaid > 0 ? 'Partial Advance Paid' : 'Payment Pending'}</span>
            </div>
            <div className="billing-summary-final-total">
              <span className="total-label">Grand Total</span>
              <span className="total-amount">₹{totals.gross.toFixed(2)}</span>
            </div>
          </div>

          <div className="billing-summary-final-grid">
            <div className="summary-stat-box">
              <span className="stat-label">Subtotal</span>
              <span className="stat-value">₹{totals.subtotal.toFixed(2)}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="summary-stat-box summary-stat-box--discount">
                <span className="stat-label">Discount</span>
                <span className="stat-value">−₹{totals.discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="summary-stat-box">
              <span className="stat-label">GST (Estimated)</span>
              <span className="stat-value">Included</span>
            </div>
            <div className="summary-stat-box summary-stat-box--paid">
              <span className="stat-label">Paid / Advance</span>
              <span className="stat-value">₹{advancePaid.toFixed(2)}</span>
            </div>
            <div className={`summary-stat-box ${advancePaid >= totals.gross ? 'summary-stat-box--paid-full' : 'summary-stat-box--balance'}`}>
              <span className="stat-label">Balance Due</span>
              <span className="stat-value">
                {advancePaid >= totals.gross ? '₹0.00 ✓' : `₹${Math.max(totals.gross - advancePaid, 0).toFixed(2)}`}
              </span>
            </div>
          </div>
        </div>

        {/* Order Job Details & Specifications */}
        <div className="billing-summary-details">
          <div className="billing-summary-details__header">
            <Sliders size={16} aria-hidden="true" style={{ color: 'var(--accent)' }} />
            <span>Job Specifications & Production Instructions</span>
            <span className="billing-summary-details__count">{orderLines.length} Job Item{orderLines.length !== 1 ? 's' : ''}</span>
          </div>

          {orderLines.map((line, idx) => {
            const lineQty = Number(line.quantity) || 1;
            const linePrice = Number(line.unit_price) || 0;
            const lineTotal = Number(line.total_amount) || (lineQty * linePrice);
            const numFrom = Number(line.numbering_from);
            const numTo = Number(line.numbering_to);
            const numCount = (!isNaN(numFrom) && !isNaN(numTo) && numTo >= numFrom) ? (numTo - numFrom + 1) : null;

            return (
              <div key={line.id} className="billing-summary-details__card">
                {/* Header with Item Name, Rate & Line Total */}
                <div 
                  className={`billing-summary-details__card-title ${expandedJobs[line.id] ? '' : 'collapsed'}`}
                  onClick={() => toggleJobExpanded(line.id)}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  <div className="title-left">
                    <span className="billing-summary-details__card-number">#{idx + 1}</span>
                    <span className="item-name-heading">{line.product_name || 'Printing Job'}</span>
                    <span className="item-qty-pill">{lineQty.toLocaleString('en-IN')} Qty</span>
                  </div>
                  <div className="title-right" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="item-rate">@ ₹{linePrice.toFixed(2)}</span>
                    <span className="item-subtotal">₹{lineTotal.toFixed(2)}</span>
                    <ChevronDown 
                      size={16} 
                      style={{ 
                        transform: expandedJobs[line.id] ? 'rotate(180deg)' : 'rotate(0deg)', 
                        transition: 'transform 0.2s',
                        color: 'var(--text-muted)'
                      }} 
                    />
                  </div>
                </div>

                {expandedJobs[line.id] && (
                  <>
                    {/* Card Fields Grid */}
                    <div className="billing-summary-details__card-body">
                      <div className="billing-summary-details__field">
                        <label><Palette size={12} /> Colour / Finish</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Full Colour, Multi-color, B&W" 
                          value={line.colour || ''}
                          onChange={e => updateLine(line.id, 'colour', e.target.value)} 
                        />
                      </div>
                      <div className="billing-summary-details__field">
                        <label><Layers size={12} /> Paper Type / Stock</label>
                        <input 
                          type="text" 
                          placeholder="e.g. 300 GSM Art Card, Maplitho 70 GSM" 
                          value={line.paper_preference || ''}
                          onChange={e => updateLine(line.id, 'paper_preference', e.target.value)} 
                        />
                      </div>

                      {line._product?.has_paper_rate && (
                        <div className="billing-summary-details__field">
                          <label><IndianRupee size={12} /> Paper Add-on Rate (₹)</label>
                          <input 
                            type="number" 
                            step="0.01" 
                            min="0" 
                            value={line.customPaperRate || ''}
                            onWheel={e => e.target.blur()}
                            onChange={e => updateLine(line.id, 'customPaperRate', Number(e.target.value) || 0)} 
                          />
                        </div>
                      )}

                      {line._product?.has_double_side_rate && (
                        <div className="billing-summary-details__field billing-summary-details__field--checkbox">
                          <label className="checkbox-label" htmlFor={`ds-${line.id}`}>
                            <input 
                              type="checkbox" 
                              id={`ds-${line.id}`} 
                              checked={!!line.is_double_side}
                              onChange={e => updateLine(line.id, 'is_double_side', e.target.checked)} 
                            />
                            <span>Double Side Printing</span>
                          </label>
                        </div>
                      )}

                      {isMachineCountLine(line) && !line.quick_added && (
                        <div className="billing-summary-details__field">
                          <label><Cpu size={12} /> Production Machine Assignment</label>
                          <select
                            value={line.machine_id || ''}
                            onChange={e => updateLine(line.id, 'machine_id', e.target.value ? Number(e.target.value) : null)}
                            className="machine-select-input"
                            aria-label="Select machine for count"
                          >
                            <option value="">-- Select Machine --</option>
                            {branchMachines
                              .filter((m) => matchMachineForLine(m, line))
                              .map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.machine_name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}

                      <div className="billing-summary-details__field billing-summary-details__field--full-row">
                        <div className="numbering-header-label">
                          <label><Hash size={12} /> Numbering Range (From → To)</label>
                          {numCount ? <span className="numbering-count-chip">({numCount.toLocaleString('en-IN')} total numbers)</span> : null}
                        </div>
                        <div className="numbering-inputs-group">
                          <input 
                            type="text" 
                            inputMode="numeric" 
                            placeholder="From e.g. 0001" 
                            value={line.numbering_from || ''}
                            onChange={e => updateLine(line.id, 'numbering_from', e.target.value)} 
                          />
                          <span className="numbering-arrow-separator">→</span>
                          <input 
                            type="text" 
                            inputMode="numeric" 
                            placeholder="To e.g. 0500" 
                            value={line.numbering_to || ''}
                            onChange={e => updateLine(line.id, 'numbering_to', e.target.value)} 
                          />
                        </div>
                      </div>
                    </div>

                    {/* Card Footer: Special Instructions */}
                    <div className="billing-summary-details__card-footer">
                      <div className="instructions-input-wrap">
                        <FileEdit size={13} className="instructions-icon" />
                        <input 
                          type="text" 
                          placeholder="Special instructions for press operator / finishing..." 
                          value={line.special_instructions || ''}
                          onChange={e => updateLine(line.id, 'special_instructions', e.target.value)} 
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Draft + Preview actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setActiveTab('payment')}>
            ← Back: Payment
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
              const draftLines = orderLines.map(({ _product, _matter_file, _matter_preview, ...rest }) => rest);
              localStorage.setItem('billingDraft', JSON.stringify({ customer: form, orders: draftLines, totals }));
              toast.success('Draft saved');
            }}>
              <Save size={14} aria-hidden="true" /> Save Draft
            </button>
            {lastBillData && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={handlePrintLast}>
                <Eye size={14} aria-hidden="true" /> Preview Last
              </button>
            )}
          </div>
        </div>

        {/* Primary Create Invoice CTA */}
        <button
          className="btn btn-primary billing-cta"
          onClick={handleAddOrder}
          disabled={saving || !canProceed}
          aria-label="Create Invoice"
        >
          {saving ? (
            <><Loader2 size={20} className="animate-spin" aria-hidden="true" /> Creating Invoice...</>
          ) : (
            <><Zap size={20} aria-hidden="true" /> <span>Create Invoice</span></>
          )}
        </button>

        {!canProceed && orderLines.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', margin: 0 }}>
            Add at least one product to create an invoice.
          </p>
        )}
      </div>

      {/* Scanner Modal */}
      <ScannerErrorBoundary onClose={() => setShowScanner(false)}>
        <Suspense fallback={null}>
          <ScannerModal
            isOpen={showScanner}
            onClose={() => setShowScanner(false)}
            onScan={handleQrLookup}
          />
        </Suspense>
      </ScannerErrorBoundary>

      {showPostBillOptions && lastBillData && (() => {
        console.log('[DEBUG] lastBillData inside modal:', lastBillData);
        const paidAmount = Number(lastBillData.payment?.cash_amount || 0) + 
                           Number(lastBillData.payment?.upi_amount || 0) + 
                           Number(lastBillData.payment?.cheque_amount || 0) + 
                           Number(lastBillData.payment?.account_transfer_amount || 0);
        const totalAmount = Number(lastBillData.totals?.gross || 0);
        const balanceDue = Math.max(totalAmount - paidAmount, 0);
        const isPaid = balanceDue < 0.05;

        return (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="post-bill-title" onClick={() => setShowPostBillOptions(false)}>
            <div className="modal modal--lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '95vh', borderRadius: '16px', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
              <div className="modal__header" style={{ borderBottom: 'none', padding: '24px 24px 8px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', position: 'relative' }}>
                <div className="invoice-success-icon-container">
                  <Check size={32} strokeWidth={3} aria-hidden="true" />
                </div>
                <h3 id="post-bill-title" className="invoice-success-title">
                  Invoice Created Successfully!
                </h3>
                <p className="invoice-success-subtitle">
                  Choose your next action below
                </p>
                <button className="modal-close" aria-label="Close" onClick={() => setShowPostBillOptions(false)} style={{ position: 'absolute', top: '20px', right: '20px' }}><X size={18} aria-hidden="true" /></button>
              </div>
              <div className="modal__body stack-sm" style={{ padding: '0 24px 24px 24px' }}>
                {/* Print / WhatsApp / Email / New Invoice actions */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', flexShrink: 0 }}>
                  <button className="btn btn-primary" onClick={handlePrintLast} style={{ flex: '1 1 150px', minWidth: '150px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', borderRadius: '8px', boxShadow: '0 4px 12px rgba(var(--primary-rgb), 0.15)' }}>
                    <Printer size={16} className="mr-8" aria-hidden="true" /> Print Invoice
                  </button>
                  {lastBillData?.customer?.mobile && lastBillData.customer.mobile.trim().length === 10 ? (
                    <a
                      href={directWhatsAppUrl || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-success"
                      style={{ flex: '1 1 150px', minWidth: '150px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontWeight: '600', borderRadius: '8px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)' }}
                    >
                      <WhatsAppIcon className="mr-8" aria-hidden="true" /> Send WhatsApp
                    </a>
                  ) : (
                    <button
                      className="btn btn-success"
                      onClick={handleWhatsAppClick}
                      style={{ flex: '1 1 150px', minWidth: '150px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', borderRadius: '8px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)' }}
                    >
                      <WhatsAppIcon className="mr-8" aria-hidden="true" /> Send WhatsApp
                    </button>
                  )}
                  <button
                    className="btn btn-info"
                    onClick={handleSendEmailClick}
                    style={{ flex: '1 1 150px', minWidth: '150px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', borderRadius: '8px', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)' }}
                  >
                    <Mail size={16} className="mr-8" aria-hidden="true" /> Send Email
                  </button>
                  <button className="btn btn-ghost" onClick={() => { setShowPostBillOptions(false); }} style={{ flex: '1 1 150px', minWidth: '150px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', fontWeight: '600', borderRadius: '8px' }}>
                    <Plus size={16} className="mr-8" aria-hidden="true" /> New Invoice
                  </button>
                </div>

              {showWhatsAppInput && (
                <div style={{ border: '1px solid var(--border)', padding: '12px', borderRadius: '6px', background: 'var(--bg-light)', marginBottom: 16, flexShrink: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Enter WhatsApp Number</span>
                      {!lastBillData?.customer?.mobile && (
                        <span style={{ fontSize: 11, color: 'var(--error)' }}>(No number available for this customer)</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div className="billing-field" style={{ flex: 1, margin: 0 }}>
                        <Phone size={14} className="billing-field__icon" aria-hidden="true" />
                        <input
                          type="tel"
                          placeholder="10-digit Mobile"
                          value={whatsAppMobile}
                          onChange={e => setWhatsAppMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          className="billing-field__input"
                        />
                      </div>
                      <a
                        href={dynamicWhatsAppUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`btn btn-success btn-sm ${whatsAppMobile.trim().length !== 10 ? 'disabled' : ''}`}
                        onClick={(e) => {
                          if (whatsAppMobile.trim().length !== 10) {
                            e.preventDefault();
                            return;
                          }
                          handleSendWhatsAppEffects(whatsAppMobile.trim());
                          setShowWhatsAppInput(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textDecoration: 'none',
                          pointerEvents: whatsAppMobile.trim().length !== 10 ? 'none' : 'auto',
                          opacity: whatsAppMobile.trim().length !== 10 ? 0.6 : 1
                        }}
                      >
                        Send
                      </a>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowWhatsAppInput(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showEmailInput && (
                <div style={{ border: '1px solid var(--border)', padding: '12px', borderRadius: '6px', background: 'var(--bg-light)', marginBottom: 16, flexShrink: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Enter Email Address</span>
                      {!lastBillData?.customer?.email && (
                        <span style={{ fontSize: 11, color: 'var(--error)' }}>(No email available for this customer)</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div className="billing-field" style={{ flex: 1, margin: 0 }}>
                        <Mail size={14} className="billing-field__icon" aria-hidden="true" />
                        <input
                          type="email"
                          placeholder="customer@example.com"
                          value={emailAddress}
                          onChange={e => setEmailAddress(e.target.value)}
                          className="billing-field__input"
                        />
                      </div>
                      <button
                        className={`btn btn-info btn-sm ${!emailAddress.trim() ? 'disabled' : ''}`}
                        onClick={() => {
                          if (!emailAddress.trim()) return;
                          handleSendEmail(emailAddress.trim());
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          pointerEvents: !emailAddress.trim() ? 'none' : 'auto',
                          opacity: !emailAddress.trim() ? 0.6 : 1
                        }}
                      >
                        Send
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowEmailInput(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* High-Fidelity Live Invoice Summary Card */}
              <div className="premium-receipt-card">
                <div className="premium-receipt-header">
                  <div>
                    <span className="premium-receipt-label">Invoice No</span>
                    <h4 style={{ margin: '2px 0 0 0', color: 'var(--primary)', fontWeight: '700', fontSize: '15px' }}>{lastBillData.invoiceNumber}</h4>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    {isPaid ? (
                      <span className="premium-receipt-badge premium-receipt-badge--paid">
                        <Check size={10} strokeWidth={3} /> Paid
                      </span>
                    ) : (
                      <span className="premium-receipt-badge premium-receipt-badge--partial">
                        Partial
                      </span>
                    )}
                    <p style={{ margin: '0', fontWeight: '500', fontSize: '11px', color: 'var(--text-muted)' }}>
                      {new Date(lastBillData.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <span className="premium-receipt-label">Customer</span>
                    <p style={{ margin: '2px 0 0 0', fontWeight: '600', fontSize: '13px' }}>{lastBillData.customer?.name || 'Walk-in Customer'}</p>
                    {lastBillData.customer?.mobile && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <Phone size={10} /> {lastBillData.customer.mobile}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="premium-receipt-label">Payment Mode</span>
                    <p className="premium-receipt-value" style={{ fontWeight: '600' }}>{lastBillData.payment?.method || 'Cash'}</p>
                  </div>
                </div>

                <div className="premium-receipt-items-container">
                  <span className="premium-receipt-label" style={{ display: 'block', marginBottom: '6px', fontSize: '10px' }}>Items Summary</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
                    {lastBillData.orderLines?.map((line, idx) => (
                      <div key={idx} className="premium-receipt-item-row">
                        <span style={{ color: 'var(--text-main)', fontWeight: '500' }}>
                          {line.product_name || line.name} <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: 4 }}>x{line.quantity}</span>
                        </span>
                        <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>₹{Number(line.total_amount || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="premium-receipt-totals">
                  <div>
                    <span className="premium-receipt-total-label">Total Amount</span>
                    <h3 className="premium-receipt-total-value">₹{totalAmount.toFixed(2)}</h3>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="premium-receipt-total-label" style={{ color: 'var(--text-muted)' }}>Balance Due</span>
                    <p className="premium-receipt-balance-value" style={{ color: balanceDue > 0.05 ? 'var(--warning)' : 'var(--success)' }}>
                      {isPaid ? '₹0.00 ✓' : `₹${balanceDue.toFixed(2)}`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Staff Assignment Panel */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Users size={16} aria-hidden="true" style={{ color: 'var(--accent)' }} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Assign Work to Staff</span>
                </div>

                {assignJobs.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>
                    No job lines available for assignment.
                  </div>
                ) : (
                  <div className="billing-assign-panel">
                    {['designer', 'printer', 'other'].map(sectionKey => {
                      const sectionLabel = sectionKey === 'designer' ? 'Design Assignment' : sectionKey === 'printer' ? 'Printing Assignment' : 'Other Assignment';
                      const sectionRole = sectionKey === 'other' ? null : sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1);
                      const staffList = sectionRole
                        ? (staffByRole[sectionRole] || [])
                        : Object.entries(staffByRole)
                            .filter(([role]) => role !== 'Designer' && role !== 'Printer')
                            .flatMap(([, staff]) => staff);
                      const allAssigned = assignJobs.every(j => assignSelections[j.id]?.[sectionKey]);
                      const anyAssigned = assignJobs.some(j => assignSelections[j.id]?.[sectionKey]);
                      return (
                          <div key={sectionKey} className={`billing-assign-section ${allAssigned ? 'billing-assign-section--complete' : ''}`}>
                          <div className="billing-assign-section__header">
                            <span className="billing-assign-section__indicator" />
                            <div className="billing-assign-section__title-group">
                              <span className="billing-assign-section__title">{sectionLabel}</span>
                              <span className="billing-assign-section__status">
                                {allAssigned ? '✓ All assigned' : anyAssigned ? `⚠ ${assignJobs.filter(j => !assignSelections[j.id]?.[sectionKey]).length} pending` : 'No assignments'}
                              </span>
                            </div>
                          </div>
                          <div className="billing-assign-section__body">
                            {assignJobs.map(job => (
                              <div key={job.id} className="billing-assign-row">
                                <div className="billing-assign-row__name" title={job.job_number || job.id}>
                                  {job.job_number || `Job #${job.id}`}
                                  {job.product_name && <span className="text-muted" style={{ marginLeft: 6, fontSize: 11 }}>· {job.product_name}</span>}
                                </div>
                                <select
                                  className={`billing-assign-row__select ${assignSelections[job.id]?.[sectionKey] ? 'billing-assign-row__select--filled' : ''}`}
                                  value={assignSelections[job.id]?.[sectionKey] || ''}
                                  onChange={e => setAssignSelections(prev => ({
                                    ...prev,
                                    [job.id]: { ...prev[job.id], [sectionKey]: e.target.value }
                                  }))}
                                  aria-label={`Assign ${sectionLabel} for job ${job.job_number || job.id}`}
                                >
                                  <option value="">— Select {sectionKey} —</option>
                                  {sectionKey !== 'other' && (
                                    <optgroup label="Role Assignment">
                                      <option value={`__role__${sectionRole}`}>Any {sectionRole}</option>
                                    </optgroup>
                                  )}
                                  {sectionKey === 'other'
                                    ? Object.entries(staffByRole)
                                        .filter(([role]) => role !== 'Designer' && role !== 'Printer')
                                        .map(([role, staff]) => (
                                          <optgroup key={role} label={role}>
                                            <option value={`__role__${role}`}>Any {role}</option>
                                            {staff.map(s => (
                                              <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                          </optgroup>
                                        ))
                                    : <optgroup label="Staff">
                                        {staffList.map(s => (
                                          <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                      </optgroup>
                                  }
                                </select>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {assignError && (
                      <div className="billing-error" style={{ fontSize: 12 }}>
                        <AlertCircle size={14} aria-hidden="true" /> {assignError}
                      </div>
                    )}

                    <div className="billing-assign-actions">
                      <button
                        className="btn btn-primary btn-sm flex-1"
                        onClick={handleAssignStaff}
                        disabled={assignLoading}
                      >
                        {assignLoading ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Assigning...</> : <><Check size={14} aria-hidden="true" /> Assign & Close</>}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setShowPostBillOptions(false)}>
                        Skip for now
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )})()}

      {/* Recent Bills Modal */}
      {showRecentBills && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="recent-bills-title" onClick={() => setShowRecentBills(false)}>
          <div className="modal modal--md" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            <div className="modal__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <h3 id="recent-bills-title" className="modal__title" style={{ margin: 0 }}>Recent Invoices</h3>
              <button className="modal-close" onClick={() => setShowRecentBills(false)} aria-label="Close recent bills" style={{ position: 'static' }}><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="modal__body" style={{ maxHeight: '60dvh', overflowY: 'auto', padding: '16px' }}>
              {loadingRecentBills ? (
                <div className="flex-center py-24"><Loader2 size={24} className="animate-spin" /></div>
              ) : recentBills.length === 0 ? (
                <div className="text-center muted py-24">No recent invoices found</div>
              ) : (
                <div className="recent-bills-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {recentBills.map((b) => (
                    <div key={b.id || b.localId} className="recent-bill-item" style={{
                      padding: 12,
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--surface-2, var(--bg-2))',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <div className="font-semibold">{b.customer_name || b.customerName || 'Walk-in Customer'}</div>
                        <div className="text-xs text-muted">{b.customer_mobile || b.customerMobile || 'No mobile'} • {b.payment_date || b.paymentDate || b.created_at ? new Date(b.payment_date || b.paymentDate || b.created_at).toLocaleDateString() : '—'}</div>
                        <div className="text-xs" style={{ marginTop: 4 }}>
                          {b.isOffline ? (
                            <span style={{ color: 'var(--warning)' }}>Unsynced (Offline)</span>
                          ) : (
                            <span style={{ color: 'var(--success)' }}>Synced ({b.invoice_number || b.id})</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="font-bold">₹{Number(b.net_amount || b.netAmount || b.total_amount || b.totalAmount || 0).toFixed(2)}</div>
                        <button className="btn btn-ghost btn-xs btn-icon" onClick={() => handlePrintRecent(b)} title="Print invoice" aria-label="Print invoice"><Printer size={14} aria-hidden="true" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Product detail modal */}
      {detailProduct && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Product details: ${detailProduct.name || detailProduct.title}`} onClick={() => setDetailProduct(null)}>
          <div className="modal modal--sm" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h3>{detailProduct.name || detailProduct.title}</h3>
              <button className="modal-close" onClick={() => setDetailProduct(null)} aria-label="Close product details"><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="modal__body stack-sm">
              {detailProduct.image_url && (
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <SecureImage
                    src={detailProduct.image_url}
                    alt={detailProduct.name || detailProduct.title}
                    style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, objectFit: 'contain' }}
                  />
                </div>
              )}
              <div className="billing-detail-row"><span className="text-xs muted">Name</span><span className="font-bold">{detailProduct.name || detailProduct.title}</span></div>
              {detailProduct.mrp != null && Number(detailProduct.mrp) > 0 && (
                <div className="billing-detail-row"><span className="text-xs muted">MRP</span><span>₹{Number(detailProduct.mrp).toLocaleString()}</span></div>
              )}
              {detailProduct.sell_price != null && Number(detailProduct.sell_price) > 0 && (
                <div className="billing-detail-row"><span className="text-xs muted">Sell Price</span><span>₹{Number(detailProduct.sell_price).toLocaleString()}</span></div>
              )}
              {detailProduct.calculation_type && (
                <div className="billing-detail-row"><span className="text-xs muted">Pricing Type</span><span>{detailProduct.calculation_type}</span></div>
              )}
              {detailProduct.sku && (
                <div className="billing-detail-row"><span className="text-xs muted">SKU</span><span>{detailProduct.sku}</span></div>
              )}
              {detailProduct.description && (
                <div className="billing-detail-row"><span className="text-xs muted">Description</span><span style={{ fontSize: 12, lineHeight: 1.4 }}>{detailProduct.description}</span></div>
              )}
              {detailProduct.slabs && detailProduct.slabs.length > 0 && (
                <div>
                  <span className="text-xs muted" style={{ display: 'block', marginBottom: 4 }}>Pricing Slabs</span>
                  <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface)', textAlign: 'left' }}>
                        <th style={{ padding: '2px 6px', border: '1px solid var(--border)' }}>Min</th>
                        <th style={{ padding: '2px 6px', border: '1px solid var(--border)' }}>Max</th>
                        <th style={{ padding: '2px 6px', border: '1px solid var(--border)' }}>Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailProduct.slabs.map((s, i) => (
                        <tr key={i}>
                          <td style={{ padding: '2px 6px', border: '1px solid var(--border)' }}>{s.min_qty}</td>
                          <td style={{ padding: '2px 6px', border: '1px solid var(--border)' }}>{s.max_qty}</td>
                          <td style={{ padding: '2px 6px', border: '1px solid var(--border)' }}>₹{Number(s.unit_rate || s.rate || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal__footer">
              <button className="btn btn-primary btn-sm" onClick={() => { setDetailProduct(null); handleAddLineItem(detailProduct); }}>Add to Bill</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setDetailProduct(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Scanned preview modal */}
      {scannedPreview && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Preview scanned product: ${scannedPreview.product?.name}`} onClick={() => setScannedPreview(null)}>
          <div className="modal modal--sm" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h3>{scannedPreview.product?.name}</h3>
              <button className="modal-close" onClick={() => setScannedPreview(null)} aria-label="Close scanned preview"><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="modal__body stack-sm">
              <div className="row gap-sm items-center">
                <span className="text-xs muted">Qty:</span>
                <div className="billing-qty-adjust">
                  <button className="btn btn-ghost btn-icon btn-xs" onClick={() => setScannedQty(Math.max(1, scannedQty - 1))} aria-label="Decrease quantity"><Minus size={12} aria-hidden="true" /></button>
                  <span className="font-bold px-8">{scannedQty}</span>
                  <button className="btn btn-ghost btn-icon btn-xs" onClick={() => setScannedQty(scannedQty + 1)} aria-label="Increase quantity"><Plus size={12} aria-hidden="true" /></button>
                </div>
              </div>
              <div className="row gap-sm">
                <button className="btn btn-primary btn-sm flex-1" onClick={() => { handleAddLineItem(scannedPreview.product, scannedQty, [], scannedPreview.catId, scannedPreview.subId, scannedPreview.catName); setScannedPreview(null); }}>
                  Add to Bill
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setScannedPreview(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Item Prompt Modal */}
      {duplicateItemModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Item already added options"
          onClick={() => setDuplicateItemModal(null)}
          style={{ zIndex: 9999 }}
        >
          <div
            className="modal modal--sm"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 440,
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 10px 10px -5px rgba(0, 0, 0, 0.15)'
            }}
          >
            <div className="modal__header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: 'rgba(245, 158, 11, 0.12)',
                    color: '#f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Item Already Added
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                    This item is already in your bill.
                  </p>
                </div>
              </div>
              <button
                className="modal-close"
                onClick={() => setDuplicateItemModal(null)}
                aria-label="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="modal__body stack-md" style={{ paddingTop: 16 }}>
              <div
                style={{
                  background: 'var(--surface, #f8fafc)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                    {duplicateItemModal.product?.name || duplicateItemModal.product?.title || 'Selected Item'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Current quantity in bill: <strong>{duplicateItemModal.existingLine?.quantity || 1}</strong>
                  </div>
                </div>
                <span className="badge badge-warning" style={{ fontSize: 11 }}>In Bill</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
                <button
                  className="btn btn-primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '11px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    width: '100%',
                    borderRadius: 8
                  }}
                  onClick={() => {
                    const lineToUpdate = duplicateItemModal.existingLine;
                    const newQty = (Number(lineToUpdate.quantity) || 0) + (duplicateItemModal.qty || 1);
                    updateLine(lineToUpdate.id, 'quantity', newQty);
                    toast.success(`Updated quantity to ${newQty}`);
                    setDuplicateItemModal(null);
                  }}
                >
                  <Plus size={16} /> Increase Quantity (+{duplicateItemModal.qty || 1})
                </button>

                <button
                  className="btn btn-secondary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '11px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    width: '100%',
                    borderRadius: 8
                  }}
                  onClick={() => {
                    const { product, qty, extras, catId, subId, catName } = duplicateItemModal;
                    setDuplicateItemModal(null);
                    handleAddLineItem(product, qty, extras, catId, subId, catName, true);
                    toast.success('Added as a new separate item');
                  }}
                >
                  <Copy size={16} /> Add Next Item (New Line)
                </button>

                <button
                  className="btn btn-outline"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '11px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    width: '100%',
                    borderRadius: 8
                  }}
                  onClick={() => {
                    setDuplicateItemModal(null);
                    const paymentCard =
                      document.querySelector('.billing-payment-card') ||
                      document.querySelector('.billing-summary') ||
                      document.getElementById('billing-payment-section');
                    if (paymentCard) {
                      paymentCard.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                >
                  <CreditCard size={16} /> Proceed to Payment
                </button>
              </div>

              <div style={{ textAlign: 'right', marginTop: 4 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setDuplicateItemModal(null)}
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {machineModalOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Machine selection required"
          onClick={() => setMachineModalOpen(false)}
          style={{ zIndex: 9999 }}
        >
          <div
            className="modal modal--sm"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 480,
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 10px 10px -5px rgba(0, 0, 0, 0.15)'
            }}
          >
            <div className="modal__header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: 'rgba(245, 158, 11, 0.12)',
                    color: '#f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Machine is not selected
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                    Select a machine for each laser or photocopy item before continuing to payment.
                  </p>
                </div>
              </div>
              <button
                className="modal-close"
                onClick={() => setMachineModalOpen(false)}
                aria-label="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="modal__body stack-md" style={{ paddingTop: 16 }}>
              {machineRequiredLines.map((line, idx) => (
                <div
                  key={line.id}
                  style={{
                    background: 'var(--surface, #f8fafc)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      #{idx + 1} {line.product_name}
                    </div>
                    <span className="badge badge-warning" style={{ fontSize: 11, flexShrink: 0 }}>Machine Needed</span>
                  </div>
                  <select
                    value={line.machine_id || ''}
                    onChange={(e) => updateLine(line.id, 'machine_id', e.target.value ? Number(e.target.value) : null)}
                    style={{
                      cursor: 'pointer',
                      padding: '6px 8px',
                      fontSize: '0.8rem',
                      height: '34px',
                      width: '100%',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      background: 'var(--bg)',
                      outline: 'none'
                    }}
                    aria-label={`Select machine for ${line.product_name}`}
                  >
                    <option value="">-- Select Machine --</option>
                    {branchMachines
                      .filter((m) => matchMachineForLine(m, line))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.machine_name}
                        </option>
                      ))}
                  </select>
                </div>
              ))}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
                <button
                  className="btn btn-primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '11px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    width: '100%',
                    borderRadius: 8
                  }}
                  onClick={() => {
                    const stillMissing = (Array.isArray(orderLines) ? orderLines : [])
                      .filter(l => isMachineCountLine(l) && !l.machine_id && !l.quick_added);
                    if (stillMissing.length > 0) {
                      toast.error('Please select a machine for all required items');
                      return;
                    }
                    setMachineModalOpen(false);
                    setActiveTab('payment');
                  }}
                >
                  <Check size={16} /> Save & Continue
                </button>
                <button
                  className="btn btn-outline"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '11px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    width: '100%',
                    borderRadius: 8
                  }}
                  onClick={() => setMachineModalOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default Billing;
