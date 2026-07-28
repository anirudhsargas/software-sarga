import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import BillExtractionReview from './expense-manager/BillExtractionReview';
import PageContainer from '../components/ui/PageContainer';
import PermissionDeniedState from '../components/PermissionDeniedState';
import useAuth from '../hooks/useAuth';
import toast from 'react-hot-toast';

const UploadBills = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/dashboard/expenses?tab=dashboard';
  const target = searchParams.get('target') || 'products';
  const { user } = useAuth();
  const userRole = user?.role;
  const permitted = userRole && ['Admin', 'Front Office', 'Accountant'].includes(userRole);

  // Navigation Guard
  React.useEffect(() => {
    if (userRole && !permitted) {
      toast.error('Access Denied: Insufficient permissions to upload bills.');
      navigate('/dashboard');
    }
  }, [userRole, permitted, navigate]);

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

  return (
    <PageContainer title={target === 'consumables' ? 'Upload Consumables Bill' : 'AI Bill Extraction'}>
      <BillExtractionReview
        target={target}
        stayOnSave={true}
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
