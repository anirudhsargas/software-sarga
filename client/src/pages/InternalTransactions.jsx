import { useSEO } from '../hooks/useSEO';
import InternalTransfers from './InternalTransfers';
import PageContainer from '../components/ui/PageContainer';

const InternalTransactions = () => {
    useSEO('Internal Transactions');

  return (
    <PageContainer>
      <div className="page-header">
        <div className="page-header__title">
          <h1 className="section-title">Internal Transactions</h1>
          <p className="page-header__description">Manage inter-branch movements and transfers</p>
        </div>
      </div>

      <InternalTransfers />
    </PageContainer>
  );
};

export default InternalTransactions;
