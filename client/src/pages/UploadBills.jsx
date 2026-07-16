import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BillExtractionReview from './expense-manager/BillExtractionReview';
import PageContainer from '../components/ui/PageContainer';
import auth from '../services/auth';
import toast from 'react-hot-toast';

const UploadBills = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/dashboard/expenses?tab=dashboard';
  const userRole = auth.getUser()?.role;

  // Navigation Guard
  React.useEffect(() => {
    if (!['Admin', 'Front Office', 'Accountant'].includes(userRole)) {
      toast.error('Access Denied: Insufficient permissions to upload bills.');
      navigate('/dashboard');
    }
  }, [userRole, navigate]);

  return (
    <PageContainer title="AI Bill Extraction">
      <BillExtractionReview
        onClose={() => navigate(redirectPath)}
        onSuccess={() => {
          toast.success('Bill saved successfully!');
          navigate(redirectPath);
        }}
        onError={(err) => {
          toast.error(err || 'Failed to save bill');
        }}
      />
    </PageContainer>
  );
};

export default UploadBills;
