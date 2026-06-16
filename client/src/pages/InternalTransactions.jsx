import { useSEO } from '../hooks/useSEO';
import InternalTransfers from './InternalTransfers';

const InternalTransactions = () => {
    useSEO('Internal Transactions');

  return (
    <div className="page-container internal-transactions-page">
      <div className="page-header">
        <div className="page-header__title">
          <h1 className="section-title">Internal Transactions</h1>
          <p className="page-header__description">Manage inter-branch movements and transfers</p>
        </div>
      </div>

      <InternalTransfers />
    </div>
  );
};

export default InternalTransactions;
