import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import ErrorPage from '../components/ErrorPage';

const NotFound = () => {
  const navigate = useNavigate();
  return (
    <ErrorPage
      icon={FileQuestion}
      title="404 — Page Not Found"
      message="The page you're looking for doesn't exist or has been moved."
      suggestion="Check the URL for typos or go back to the dashboard."
      actions={[
        { label: 'Go to Dashboard', onClick: () => navigate('/dashboard') },
        { label: 'Go Back', onClick: () => navigate(-1), variant: 'ghost' },
      ]}
    />
  );
};

export default NotFound;
