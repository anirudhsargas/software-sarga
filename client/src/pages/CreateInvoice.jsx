import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import PageContainer from '../components/ui/PageContainer';
import SectionErrorBoundary from '../components/SectionErrorBoundary';

import { lazyWithRetry } from '../utils/errorUtils';

const Billing = lazyWithRetry(() => import('./Billing'));

const CreateInvoice = () => {
  useSEO('Create Invoice');
  const navigate = useNavigate();

  return (
    <SectionErrorBoundary name="CreateInvoicePage">
      <Suspense fallback={
        <PageContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '24px 0' }}>
            <div className="skeleton-block" style={{ width: 180, height: 22 }} />
            <div className="skeleton-block" style={{ width: '100%', height: 200 }} />
            <div className="skeleton-block" style={{ width: '100%', height: 200 }} />
          </div>
        </PageContainer>
      }>
        <Billing />
      </Suspense>
    </SectionErrorBoundary>
  );
};

export default CreateInvoice;
