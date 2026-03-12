import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, CheckCircle, Smartphone, Banknote, FileText, Building2 } from 'lucide-react';
import './ReceiptModal.css';

const ReceiptModal = ({ isOpen, onClose, paymentData, branchInfo }) => {
    React.useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            document.body.classList.add('receipt-modal-open');
        } else {
            document.body.style.overflow = 'unset';
            document.body.classList.remove('receipt-modal-open');
        }
        return () => {
            document.body.style.overflow = 'unset';
            document.body.classList.remove('receipt-modal-open');
        };
    }, [isOpen]);

    if (!isOpen || !paymentData) return null;

    const {
        customer_name,
        customer_mobile,
        bill_amount,
        total_amount,
        advance_paid,
        balance_amount,
        payment_method,
        reference_number,
        description,
        payment_date,
        id
    } = paymentData;

    const previouslyPaid = Math.max((Number(bill_amount) || Number(total_amount)) - Number(total_amount), 0);

    const handlePrint = () => {
        window.print();
    };

    const icons = {
        Cash: <Banknote size={16} />,
        UPI: <Smartphone size={16} />,
        Cheque: <FileText size={16} />,
        'Account Transfer': <Building2 size={16} />,
        'Both': <div className="row gap-xs"><Banknote size={14} /><Smartphone size={14} /></div>
    };

    const modalContent = (
        <div className="receipt-overlay" onClick={onClose}>
            <div className="receipt-modal" onClick={e => e.stopPropagation()}>
                <div className="receipt-modal__header">
                    <h2>Payment Receipt</h2>
                    <div className="receipt-modal__actions">
                        <button className="btn btn-primary btn-sm no-print" onClick={handlePrint}>
                            <Printer size={16} /> Print Receipt
                        </button>
                        <button className="btn btn-ghost btn-sm no-print" onClick={onClose}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="receipt-content" id="printable-receipt">
                    {/* Header */}
                    <div className="receipt-brand">
                        <img src="/logo.png" alt="Sarga" className="receipt-brand__logo" />
                        <div className="receipt-brand__info">
                            <h3>{branchInfo?.business_name || 'SARGA DIGITAL PRESS'}</h3>
                            <p>{branchInfo?.location || 'Digital Printing & Services'}</p>
                            {branchInfo?.phone && <p>Ph: {branchInfo.phone}</p>}
                        </div>
                        <div className="receipt-status no-print">
                            <CheckCircle size={40} className="receipt-status__icon" />
                        </div>
                    </div>

                    <div className="receipt-divider"></div>

                    {/* Receipt Info */}
                    <div className="receipt-meta">
                        <div>
                            <p className="receipt-label">Receipt No</p>
                            <p className="receipt-value">#{id || 'N/A'}</p>
                        </div>
                        <div className="text-right">
                            <p className="receipt-label">Date</p>
                            <p className="receipt-value">
                                {new Date(payment_date).toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric'
                                })}
                            </p>
                        </div>
                    </div>

                    {/* Customer */}
                    <div className="receipt-section">
                        <p className="receipt-label">Customer Details</p>
                        <p className="receipt-customer-name">{customer_name}</p>
                        {customer_mobile && <p className="receipt-customer-mobile">+91 {customer_mobile}</p>}
                    </div>

                    {/* Payment Breakdown */}
                    <table className="receipt-table">
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th className="text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Payment for Printing Services</td>
                                <td className="text-right">₹{Number(bill_amount || total_amount).toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="receipt-summary">
                        <div className="receipt-summary__row">
                            <span>Original Bill Total</span>
                            <span>₹{Number(bill_amount || total_amount).toFixed(2)}</span>
                        </div>
                        {previouslyPaid > 0 && (
                            <div className="receipt-summary__row">
                                <span>Previously Paid</span>
                                <span className="text-success">- ₹{previouslyPaid.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="receipt-summary__row receipt-summary__row--highlight">
                            <span>Current Payment ({payment_method})</span>
                            <span>₹{Number(advance_paid).toFixed(2)}</span>
                        </div>
                        <div className="receipt-summary__row">
                            <span>Balance Due</span>
                            <span className={Number(balance_amount) > 0 ? 'text-danger font-bold' : ''}>
                                ₹{Number(balance_amount).toFixed(2)}
                            </span>
                        </div>
                    </div>

                    {/* Payment Info */}
                    <div className="receipt-footer-info">
                        <div className="row items-center gap-sm mt-8">
                            <span className="receipt-label">Payment Mode:</span>
                            <span className="row items-center gap-xs font-semibold">
                                {icons[payment_method] || <FileText size={14} />} {payment_method}
                            </span>
                        </div>
                        {reference_number && (
                            <div className="row items-center gap-sm">
                                <span className="receipt-label">Ref No:</span>
                                <span className="font-semibold">{reference_number}</span>
                            </div>
                        )}
                        {description && (
                            <div className="mt-4">
                                <span className="receipt-label text-xs">Notes: {description}</span>
                            </div>
                        )}
                    </div>

                    <div className="receipt-sign-area">
                        <div className="receipt-sign-box">
                            <p>Receiver's Signature</p>
                        </div>
                        <div className="receipt-sign-box text-right">
                            <p>For Sarga Digital Press</p>
                            <div className="mt-32">Authorized Signatory</div>
                        </div>
                    </div>

                    <div className="receipt-thank-you">
                        <p>Thank you for choosing Sarga Digital Press!</p>
                        <p className="text-xs">This is a computer generated receipt.</p>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default ReceiptModal;
