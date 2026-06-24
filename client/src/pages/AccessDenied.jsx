import { useSEO } from '../hooks/useSEO';
import { useNavigate } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import ErrorPage from '../components/ErrorPage';

const AccessDenied = () => {
    useSEO('Access Denied');

  const navigate = useNavigate();
  return (
    <ErrorPage
      icon={ShieldOff}
      title="Access Denied"
      message="You do not have permission to access this page."
      suggestion="If you believe this is a mistake, contact your administrator."
      actions={[
        { label: 'Go to Dashboard', onClick: () => navigate('/dashboard') },
      ]}
    />
  );
};

export default AccessDenied;
