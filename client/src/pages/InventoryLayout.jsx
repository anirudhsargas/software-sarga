import React from 'react';
import { useSEO } from '../hooks/useSEO';
import { Outlet } from 'react-router-dom';

const InventoryLayout = () => {
    useSEO('Inventory Layout');

    return (
        <div className="stack-lg" style={{ gap: 0 }}>
            <Outlet />
        </div>
    );
};

export default React.memo(InventoryLayout);
