import { useSEO } from '../hooks/useSEO';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import ErrorPage from '../components/ErrorPage';

const AccessRestricted = () => {
    useSEO('Access Restricted');

    const navigate = useNavigate();
    return (
        <ErrorPage
            icon={ShieldAlert}
            title="Access Restricted"
            message="You do not have permission to access this section."
            actions={[
                { label: 'Back', onClick: () => navigate(-1), variant: 'ghost' },
                { label: 'Go Dashboard', onClick: () => navigate('/dashboard') }
            ]}
        />
    );
};

export default AccessRestricted;
