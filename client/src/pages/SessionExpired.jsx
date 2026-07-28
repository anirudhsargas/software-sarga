import { useSEO } from '../hooks/useSEO';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import ErrorPage from '../components/ErrorPage';

const SessionExpired = () => {
    useSEO('Session Expired');

  const navigate = useNavigate();
  return (
    <ErrorPage
      icon={Clock}
      title="Session Expired"
      message="Your session has expired due to inactivity. Please log in again to continue."
      suggestion="For security, you are automatically logged out after a period of inactivity. Any unsaved changes may have been lost."
      actions={[
        { label: 'Login Again', onClick: () => navigate('/login', { replace: true }) },
        { label: 'Go Home', onClick: () => navigate('/', { replace: true }), variant: 'ghost' },
      ]}
    />
  );
};

export default SessionExpired;
