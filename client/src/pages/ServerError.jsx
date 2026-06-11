import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import ErrorPage from '../components/ErrorPage';

const ServerError = () => {
  const navigate = useNavigate();
  return (
    <ErrorPage
      icon={AlertTriangle}
      title="Server Error"
      message="The server encountered an unexpected error. Our team has been notified."
      suggestion="Please try again in a few minutes. If the problem persists, contact support."
      actions={[
        { label: 'Go Home', onClick: () => navigate('/', { replace: true }) },
        { label: 'Reload', onClick: () => window.location.reload(), variant: 'ghost' },
      ]}
    />
  );
};

export default React.memo(ServerError);
