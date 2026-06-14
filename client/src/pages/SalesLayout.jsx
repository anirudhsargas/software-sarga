import React from 'react';
import { useSEO } from '../hooks/useSEO';
import { Outlet } from 'react-router-dom';

const SalesLayout = () => {
    useSEO('Sales Layout');

    return (
        <div className="stack-lg" style={{ gap: 0 }}>
            <Outlet />
        </div>
    );
};

export default React.memo(SalesLayout);
