import { useSEO } from '../hooks/useSEO';
import { useNavigate } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import ErrorPage from '../components/ErrorPage';

const NetworkError = () => {
    useSEO('Network Error');

  const navigate = useNavigate();
  return (
    <ErrorPage
      icon={WifiOff}
      title="Network Error"
      message="Unable to reach the server. Your internet connection may be down or the server is temporarily unavailable."
      suggestion="Check your connection, then try again. Any unsaved data will be restored when you reconnect."
      actions={[
        { label: 'Retry', onClick: () => window.location.reload() },
        { label: 'Go Home', onClick: () => navigate('/', { replace: true }), variant: 'ghost' },
      ]}
    />
  );
};

export default NetworkError;
