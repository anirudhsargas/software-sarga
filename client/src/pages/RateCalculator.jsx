import { useSEO } from '../hooks/useSEO';
import React from 'react';
import PageContainer from '../components/ui/PageContainer';

const RateCalculator = () => {
    useSEO('Rate Calculator');

    return (
        <PageContainer>
            <h1 className="page-title">Rate Calculator</h1>
            <p className="text-muted">Coming soon</p>
        </PageContainer>
    );
};

export default RateCalculator;
