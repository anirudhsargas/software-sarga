import { useSEO } from '../hooks/useSEO';
import React from 'react';

const RateCalculator = () => {
    useSEO('Rate Calculator');

    return (
        <div className="page-container">
            <h1 className="page-title">Rate Calculator</h1>
            <p className="text-muted">Coming soon</p>
        </div>
    );
};

export default RateCalculator;
