import React, { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldAlert, Package, Receipt, ArrowLeft, Sparkles, FileText, TrendingUp, Wallet } from 'lucide-react';
import BillExtractionReview from './expense-manager/BillExtractionReview';
import SmartBillUpload from './expense-manager/SmartBillUpload';
import PageContainer from '../components/ui/PageContainer';
import PermissionDeniedState from '../components/PermissionDeniedState';
import useAuth from '../hooks/useAuth';
import toast from 'react-hot-toast';
import './UploadBills.css';

const SECTIONS = {
  purchase: {
    key: 'purchase',
    label: 'Purchase Bill',
    subtitle: 'Upload vendor & purchase invoices',
    description: 'AI-powered extraction for vendor purchase bills. Automatically detects vendor name, items, quantities, rates, GST, and totals. Syncs to inventory & vendor ledger.',
    icon: Package,
    color: 'var(--accent, #4361ee)',
    gradient: 'linear-gradient(135deg, rgba(67, 97, 238, 0.12), rgba(67, 97, 238, 0.04))',
    features: ['AI bill extraction', 'Vendor matching', 'Product library sync', 'Inventory update'],
  },
  expense: {
    key: 'expense',
    label: 'Expense Bill',
    subtitle: 'Upload utility, rent & other expense bills',
    description: 'Smart categorisation for all expense types — utilities, rent, transport, office supplies, and more. Auto-detects document type and links to the right expense category.',
    icon: Wallet,
    color: 'var(--success, #10b981)',
    gradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(16, 185, 129, 0.04))',
    features: ['Auto categorisation', 'GST analysis', 'Multi-type support', 'Expense tracking'],
  },
};

const UploadBills = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/dashboard/expenses?tab=dashboard';
  const target = searchParams.get('target') || 'products';
  const { user } = useAuth();
  const userRole = user?.role;
  const permitted = userRole && ['Admin', 'Front Office', 'Accountant'].includes(userRole);

  // Determine initial section based on URL params
  const getInitialSection = () => {
    const section = searchParams.get('section');
    if (section === 'expense') return 'expense';
    if (section === 'purchase') return 'purchase';
    // If target=consumables, it's a purchase bill variant
    if (target === 'consumables') return 'purchase';
    return null; // null = show selector
  };

  const [activeSection, setActiveSection] = useState(getInitialSection);

  // Navigation Guard
  React.useEffect(() => {
    if (userRole && !permitted) {
      toast.error('Access Denied: Insufficient permissions to upload bills.');
      navigate('/dashboard');
    }
  }, [userRole, permitted, navigate]);

  const handleBack = useCallback(() => {
    setActiveSection(null);
  }, []);

  const handleSectionSelect = useCallback((sectionKey) => {
    setActiveSection(sectionKey);
  }, []);

  if (userRole && !permitted) {
    return (
      <PageContainer title="Upload Bills">
        <PermissionDeniedState
          icon={ShieldAlert}
          title="Access Denied"
          message="You do not have permission to upload bills."
          suggestion="This feature is available to Admin, Accountant, and Front Office roles only."
          action={{ label: 'Go to Dashboard', onClick: () => navigate('/dashboard') }}
        />
      </PageContainer>
    );
  }

  // ─── Purchase Bill Section ───
  if (activeSection === 'purchase') {
    return (
      <PageContainer title="Upload Purchase Bill">
        <div className="upload-bills-page">
          <button className="ub-back-btn" onClick={handleBack}>
            <ArrowLeft size={16} />
            <span>Back to Bill Types</span>
          </button>
          <div className="ub-section-active-header">
            <div className="ub-section-active-icon" style={{ background: SECTIONS.purchase.gradient, color: SECTIONS.purchase.color }}>
              <Package size={22} />
            </div>
            <div>
              <h2 className="ub-section-active-title">Purchase Bill</h2>
              <p className="ub-section-active-subtitle">Upload vendor purchase invoices with AI extraction</p>
            </div>
          </div>
          <BillExtractionReview
            target={target}
            stayOnSave={true}
            onClose={() => navigate(redirectPath)}
            onSuccess={() => {
              toast.success('Purchase bill saved successfully!');
            }}
            onError={(err) => {
              toast.error(err || 'Failed to save purchase bill');
            }}
          />
        </div>
      </PageContainer>
    );
  }

  // ─── Expense Bill Section ───
  if (activeSection === 'expense') {
    return (
      <PageContainer title="Upload Expense Bill">
        <div className="upload-bills-page">
          <button className="ub-back-btn" onClick={handleBack}>
            <ArrowLeft size={16} />
            <span>Back to Bill Types</span>
          </button>
          <div className="ub-section-active-header">
            <div className="ub-section-active-icon" style={{ background: SECTIONS.expense.gradient, color: SECTIONS.expense.color }}>
              <Wallet size={22} />
            </div>
            <div>
              <h2 className="ub-section-active-title">Expense Bill</h2>
              <p className="ub-section-active-subtitle">Upload utility, rent & other expense bills</p>
            </div>
          </div>
          <SmartBillUpload
            onClose={() => navigate(redirectPath)}
            onSuccess={() => {
              toast.success('Expense bill saved successfully!');
              handleBack();
            }}
            onError={(err) => {
              toast.error(err?.response?.data?.message || err || 'Failed to save expense bill');
            }}
          />
        </div>
      </PageContainer>
    );
  }

  // ─── Section Selector (Default View) ───
  return (
    <PageContainer title="Upload Bills">
      <div className="upload-bills-page">
        {/* Page Header */}
        <div className="ub-page-header">
          <div className="ub-page-header-icon">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="ub-page-title">Upload Bills</h1>
            <p className="ub-page-subtitle">Choose the type of bill you want to upload</p>
          </div>
        </div>

        {/* Section Cards */}
        <div className="ub-sections-grid">
          {Object.values(SECTIONS).map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.key}
                className="ub-section-card"
                onClick={() => handleSectionSelect(section.key)}
              >
                {/* Card Glow Effect */}
                <div className="ub-card-glow" style={{ background: section.gradient }} />

                {/* Icon */}
                <div className="ub-card-icon" style={{ background: section.gradient, color: section.color }}>
                  <Icon size={28} />
                </div>

                {/* Content */}
                <h3 className="ub-card-title">{section.label}</h3>
                <p className="ub-card-subtitle">{section.subtitle}</p>
                <p className="ub-card-description">{section.description}</p>

                {/* Features */}
                <div className="ub-card-features">
                  {section.features.map((feature, i) => (
                    <span key={i} className="ub-feature-tag">
                      <Sparkles size={10} />
                      {feature}
                    </span>
                  ))}
                </div>

                {/* CTA */}
                <div className="ub-card-cta" style={{ color: section.color }}>
                  <span>Start Upload</span>
                  <TrendingUp size={14} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="ub-footer-hint">
          <Sparkles size={14} />
          <span>Both bill types support AI-powered extraction from photos and PDFs</span>
        </div>
      </div>
    </PageContainer>
  );
};

export default UploadBills;
