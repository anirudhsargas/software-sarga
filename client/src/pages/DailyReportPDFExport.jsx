import React from 'react';
import { useSEO } from '../hooks/useSEO';
import { serverNow } from '../services/serverTime';
import toast from 'react-hot-toast';
import { formatCurrencyDecimal } from '../constants';
import { FileText } from 'lucide-react';

const formatCurrency = formatCurrencyDecimal;
const formatNum = (val) => (Number(val) || 0).toLocaleString('en-IN');
const formatTime = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

export default function DailyReportPDFExport({
    branchName,
    reportDate,
    offsetData = {},
    laserData = {},
    otherData = {},
    openingBalances = {},
    creditTotals = {},
    creditTransactions = [],
    laserCredits = [],
    otherCredits = [],
    attendanceData = {},
    isFrontOffice,
    user,
    branches = [],
    branchId
}) {
    useSEO('Daily Report PDF Export');

    const generatePDF = async () => {
        try {
            const [jsPDFModule, autoTableModule] = await Promise.all([
                import('jspdf'),
                import('jspdf-autotable')
            ]);
            const jsPDF = jsPDFModule.default;
            const autoTable = autoTableModule.default;

            const doc = new jsPDF('p', 'mm', 'a4');
            const pageW = doc.internal.pageSize.getWidth();
            const margin = 14;

            const displayBranch = branchName || 'Branch';
            const dateStr = formatDateDisplay(reportDate);

            const renderHeader = () => {
                doc.setFillColor(31, 42, 51);
                doc.rect(0, 0, pageW, 36, 'F');
                doc.setTextColor(247, 246, 243);
                doc.setFontSize(20);
                doc.setFont('helvetica', 'bold');
                doc.text('SARGA', margin, 16);
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.text('DAILY CASH BOOK REPORT', margin, 23);
                doc.setFontSize(9);
                doc.text(`${displayBranch}  |  ${dateStr}`, margin, 30);
                doc.setFontSize(8);
                doc.text(`Generated: ${serverNow().toLocaleString('en-IN')}`, pageW - margin, 30, { align: 'right' });
                doc.setDrawColor(255, 255, 255);
                doc.setLineWidth(0.5);
                doc.line(margin, 38, pageW - margin, 38);
            };

            const sectionHeader = (title, color, yPos) => {
                doc.setFillColor(...color);
                doc.roundedRect(margin, yPos, pageW - margin * 2, 8, 1.5, 1.5, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.text(title, margin + 4, yPos + 5.5);
                return yPos + 12;
            };

            const kvRow = (label, value, yPos, options = {}) => {
                try {
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(100, 100, 100);
                    doc.text(label, margin + 2, yPos);
                    doc.setFont('helvetica', 'bold');

                    const textColor = options.color || [30, 30, 30];
                    if (Array.isArray(textColor)) {
                        doc.setTextColor(...textColor);
                    } else {
                        doc.setTextColor(textColor);
                    }

                    const cleanValue = String(value).replace('₹', 'Rs. ');
                    doc.text(cleanValue, pageW - margin - 2, yPos, { align: 'right' });
                    return yPos + 5.5;
                } catch (err) {
                    console.error('Error in PDF kvRow rendering:', err);
                    return yPos + 5.5;
                }
            };

            const allData = [
                { key: 'Offset', data: offsetData, color: [37, 99, 235] },
                { key: 'Laser', data: laserData, color: [124, 58, 237] },
                { key: 'Other', data: otherData, color: [5, 150, 105] }
            ];

            allData.forEach(({ key, data, color }, index) => {
                if (index > 0) doc.addPage();

                renderHeader();
                let currentY = 44;

                const summary = data.summary || {};
                const entries = data.entries || [];
                const opening = Number(openingBalances[key]) || 0;
                const totalCashIn = Number(summary.total_cash_in || 0);
                const totalUpiIn = Number(summary.total_upi_in || 0);
                const totalIn = totalCashIn + totalUpiIn;
                const totalOut = Number(summary.total_cash_out || 0);
                const closingBalance = opening + totalIn - totalOut;

                currentY = sectionHeader(`${key.toUpperCase()} BOOK`, color, currentY);
                doc.setTextColor(30, 30, 30);
                doc.setFont('helvetica', 'normal');

                currentY = kvRow('Opening Cash Balance', formatCurrency(opening), currentY);

                // Machine Readings Section
                if ((key === 'Laser' || key === 'Other') && data.machines?.length > 0) {
                    const branchMachines = branchId
                        ? data.machines.filter(m => String(m.branch_id) === String(branchId))
                        : data.machines;

                    if (branchMachines.length > 0) {
                        currentY += 2;
                        doc.setFontSize(9.5);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(color[0], color[1], color[2]);
                        doc.text('MACHINE READINGS & COUNTS', margin + 2, currentY);
                        currentY += 4;

                        const machineHead = [['Machine Name', 'Opening Meter', 'Current Meter', 'Copies Printed', 'Waste / Proof']];
                        const machineBody = branchMachines.map(m => {
                            const openingCnt = m.has_reading ? formatNum(m.opening_count) : '—';
                            const closingCnt = (m.closing_count !== null && m.closing_count !== undefined) ? formatNum(m.closing_count) : '—';
                            const copies = `${formatNum(m.today_copies || 0)} copies`;

                            const extraParts = [];
                            if (m.waste_prints > 0) extraParts.push(`Waste: ${formatNum(m.waste_prints)}`);
                            if (m.proof_prints > 0) extraParts.push(`Proof: ${formatNum(m.proof_prints)}`);
                            const wasteProofStr = extraParts.length > 0 ? extraParts.join(' | ') : '—';

                            return [
                                m.machine_name || 'Machine',
                                openingCnt,
                                closingCnt,
                                copies,
                                wasteProofStr
                            ];
                        });

                        autoTable(doc, {
                            startY: currentY,
                            head: machineHead,
                            body: machineBody,
                            margin: { left: margin, right: margin },
                            styles: { fontSize: 8, cellPadding: 2.5, lineColor: [220, 220, 220], lineWidth: 0.2 },
                            headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
                            alternateRowStyles: { fillColor: [250, 250, 250] },
                            columnStyles: {
                                0: { fontStyle: 'bold', cellWidth: 52 },
                                1: { halign: 'right', cellWidth: 30 },
                                2: { halign: 'right', cellWidth: 30 },
                                3: { halign: 'right', fontStyle: 'bold', textColor: color, cellWidth: 32 },
                                4: { halign: 'center', cellWidth: 38 }
                            }
                        });
                        currentY = doc.lastAutoTable.finalY + 6;
                    }
                }

                if (entries.length > 0) {
                    let head, body, columnStyles;

                    if (key === 'Laser') {
                        head = [['Time', 'Customer / Work', 'Machine', 'Copies', 'Type', 'Mode', 'Cash', 'UPI', 'Total']];
                        body = entries.map(e => {
                            const isExp = e.type === 'expense';
                            const isInternal = !!e.is_internal;
                            const sign = isExp ? '-' : '';
                            const fPdf = (val) => `${sign}Rs. ${(Number(val) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                            let desc = e.description || '';
                            if (e.details && e.details !== e.description) desc += ` (${e.details})`;
                            if (e.transferred_to) desc += ` -> Transferred to ${e.transferred_to} Book`;
                            if (e.waste_prints > 0) desc += ` [Waste:${e.waste_prints}]`;
                            if (e.proof_prints > 0) desc += ` [Proof:${e.proof_prints}]`;

                            return [
                                formatTime(e.time),
                                desc,
                                e.machine_name || '—',
                                String(e.copies || '—'),
                                isInternal ? 'Internal' : 'Standard',
                                e.payment_method || 'Cash',
                                fPdf(e.cash_amount),
                                fPdf(e.upi_amount),
                                fPdf(e.total)
                            ];
                        });
                        columnStyles = {
                            0: { cellWidth: 16 },
                            1: { cellWidth: 38 },
                            2: { cellWidth: 26 },
                            3: { halign: 'right', cellWidth: 14 },
                            4: { cellWidth: 16 },
                            5: { cellWidth: 14 },
                            6: { halign: 'right', cellWidth: 18 },
                            7: { halign: 'right', cellWidth: 18 },
                            8: { halign: 'right', cellWidth: 20, fontStyle: 'bold' }
                        };
                    } else if (key === 'Other') {
                        head = [['Time', 'Description', 'Category', 'Type', 'Mode', 'Cash', 'UPI', 'Total']];
                        body = entries.map(e => {
                            const isExp = e.type === 'expense';
                            const sign = isExp ? '-' : '';
                            const fPdf = (val) => `${sign}Rs. ${(Number(val) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                            const cat = e.category || e.category_name || (e.order_lines && e.order_lines[0]?.category) || 'Other Products';

                            let desc = e.description || '';
                            if (e.details && e.details !== e.description) desc += ` (${e.details})`;
                            if (e.transferred_to) desc += ` -> Transferred to ${e.transferred_to} Book`;
                            if (e.copies > 0) desc += ` [${e.copies} copies]`;
                            if (e.waste_prints > 0) desc += ` [Waste:${e.waste_prints}]`;
                            if (e.proof_prints > 0) desc += ` [Proof:${e.proof_prints}]`;

                            return [
                                formatTime(e.time),
                                desc,
                                cat,
                                isExp ? 'Expense' : 'Income',
                                e.payment_method || 'Cash',
                                fPdf(e.cash_amount),
                                fPdf(e.upi_amount),
                                fPdf(e.total)
                            ];
                        });
                        columnStyles = {
                            0: { cellWidth: 16 },
                            1: { cellWidth: 42 },
                            2: { cellWidth: 26 },
                            3: { cellWidth: 16 },
                            4: { cellWidth: 14 },
                            5: { halign: 'right', cellWidth: 20 },
                            6: { halign: 'right', cellWidth: 20 },
                            7: { halign: 'right', cellWidth: 22, fontStyle: 'bold' }
                        };
                    } else {
                        // Offset Book
                        head = [['Time', 'Description', 'Type', 'Mode', 'Cash', 'UPI', 'Total']];
                        body = entries.map(e => {
                            const isExp = e.type === 'expense';
                            const sign = isExp ? '-' : '';
                            const fPdf = (val) => `${sign}Rs. ${(Number(val) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                            let desc = e.description || '';
                            if (e.details && e.details !== e.description) desc += ` (${e.details})`;
                            if (e.transferred_to) desc += ` -> Transferred to ${e.transferred_to} Book`;

                            return [
                                formatTime(e.time),
                                desc,
                                isExp ? 'Expense' : 'Income',
                                e.payment_method || 'Cash',
                                fPdf(e.cash_amount),
                                fPdf(e.upi_amount),
                                fPdf(e.total)
                            ];
                        });
                        columnStyles = {
                            0: { cellWidth: 18 },
                            1: { cellWidth: 54 },
                            2: { cellWidth: 18 },
                            3: { cellWidth: 16 },
                            4: { halign: 'right', cellWidth: 22 },
                            5: { halign: 'right', cellWidth: 22 },
                            6: { halign: 'right', cellWidth: 24, fontStyle: 'bold' }
                        };
                    }

                    autoTable(doc, {
                        startY: currentY,
                        head,
                        body,
                        margin: { left: margin, right: margin },
                        styles: { fontSize: 7.5, cellPadding: 2, lineColor: [220, 220, 220], lineWidth: 0.2 },
                        headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
                        alternateRowStyles: { fillColor: [248, 248, 248] },
                        columnStyles
                    });
                    currentY = doc.lastAutoTable.finalY + 6;
                } else {
                    doc.setFontSize(8);
                    doc.setTextColor(150, 150, 150);
                    doc.text('No entries recorded for this book today.', margin + 2, currentY);
                    currentY += 8;
                }

                if (currentY > 255) { doc.addPage(); renderHeader(); currentY = 44; }

                currentY = kvRow('Total Cash In', formatCurrency(totalCashIn), currentY, { color: [47, 125, 74] });
                currentY = kvRow('Total UPI In', formatCurrency(totalUpiIn), currentY, { color: [47, 125, 74] });
                currentY = kvRow('Total Inflow (Cash + UPI)', formatCurrency(totalIn), currentY, { color: [47, 125, 74] });
                currentY = kvRow('Total Outflow (Expenses)', formatCurrency(totalOut), currentY, { color: [176, 58, 46] });

                if (key === 'Laser' && summary.total_copies !== undefined) {
                    currentY = kvRow('Total Laser Copies Printed', formatNum(summary.total_copies), currentY, { color: [124, 58, 237] });
                }

                doc.setFillColor(245, 245, 240);
                doc.roundedRect(margin, currentY - 1, pageW - margin * 2, 8, 1.5, 1.5, 'F');
                currentY = kvRow('CASH CLOSING BALANCE', formatCurrency(closingBalance), currentY, { color: color });
            });

            // Attendance & Credit Summary Page
            doc.addPage();
            renderHeader();
            let summaryY = 44;

            // Attendance Table (Full Export — No 10 row truncation!)
            const rawAttendanceStaff = attendanceData?.staff || [];
            const attendanceStaff = isFrontOffice
                ? rawAttendanceStaff.filter(s => {
                    if (s == null) return false;
                    if (s.branch_id !== undefined && s.branch_id !== null) return String(s.branch_id) === String(user?.branch_id);
                    if (s.branch_name && branches && user?.branch_id) {
                        const myBranch = branches.find(b => String(b.id) === String(user.branch_id));
                        if (myBranch && myBranch.name) return String(s.branch_name).toLowerCase().includes(String(myBranch.name).toLowerCase());
                    }
                    return false;
                })
                : rawAttendanceStaff;

            const attendancePresent = attendanceStaff.filter(s => s && (s.in_time || s.status === 'present' || s.status === 'Present')).length;
            const attendanceAbsent = Math.max(0, attendanceStaff.length - attendancePresent);

            summaryY = sectionHeader('STAFF ATTENDANCE SUMMARY', [245, 158, 11], summaryY);
            summaryY = kvRow('Total Staff Tracked', String(attendanceStaff.length), summaryY);
            summaryY = kvRow('Present Today', String(attendancePresent), summaryY, { color: [34, 197, 94] });
            summaryY = kvRow('Absent / Missing', String(attendanceAbsent), summaryY, { color: [220, 38, 38] });

            if (attendanceStaff.length > 0) {
                const attendanceRows = attendanceStaff.map(s => [
                    s.name || s.staff_name || '—',
                    s.role || 'Staff',
                    String(s.status || '').replace(/^(present|Present)$/i, 'Present').replace(/^(absent|Absent)$/i, 'Absent') || 'Pending',
                    s.in_time || s.entry_time || '—',
                    s.out_time || s.exit_time || '—',
                    s.branch_name || displayBranch
                ]);

                autoTable(doc, {
                    startY: summaryY,
                    head: [['Staff Name', 'Role', 'Status', 'In Time', 'Out Time', 'Branch']],
                    body: attendanceRows,
                    margin: { left: margin, right: margin },
                    styles: { fontSize: 7.5, cellPadding: 2, lineColor: [220, 220, 220], lineWidth: 0.2 },
                    headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
                    alternateRowStyles: { fillColor: [248, 248, 248] },
                    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 28 }, 2: { cellWidth: 22 }, 3: { cellWidth: 22 }, 4: { cellWidth: 22 }, 5: { cellWidth: 38 } }
                });
                summaryY = doc.lastAutoTable.finalY + 6;
            } else {
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text('No attendance records available for the selected date/branch.', margin + 2, summaryY);
                summaryY += 8;
            }

            if (summaryY > 255) { doc.addPage(); renderHeader(); summaryY = 44; }

            // Combine Credit Transactions from Offset, Laser, and Other (Full Export — No 10 row truncation!)
            const allCredits = [
                ...(creditTransactions || []).map(c => ({ ...c, book: 'Offset' })),
                ...(laserCredits || []).map(c => ({ ...c, book: 'Laser' })),
                ...(otherCredits || []).map(c => ({ ...c, book: 'Other' }))
            ];

            const totalCreditIn = allCredits.filter(c => (c.transaction_type || c.type) === 'Credit In').reduce((s, c) => s + (Number(c.amount) || 0), 0);
            const totalCreditOut = allCredits.filter(c => (c.transaction_type || c.type) === 'Credit Out').reduce((s, c) => s + (Number(c.amount) || 0), 0);
            const netCredit = totalCreditIn - totalCreditOut;

            summaryY = sectionHeader('CREDIT TRANSACTIONS SUMMARY', [16, 185, 129], summaryY);
            summaryY = kvRow('Total Credit In', formatCurrency(totalCreditIn), summaryY, { color: [34, 197, 94] });
            summaryY = kvRow('Total Credit Out', formatCurrency(totalCreditOut), summaryY, { color: [220, 38, 38] });
            summaryY = kvRow('Net Credit Balance', formatCurrency(netCredit), summaryY, { color: [30, 64, 175] });

            if (allCredits.length > 0) {
                const creditRows = allCredits.map(t => [
                    t.book || 'Offset',
                    t.transaction_type || t.type || 'Credit',
                    t.customer_name || t.customer || '—',
                    formatCurrency(t.amount),
                    t.remarks || t.description || t.reference_number || '—'
                ]);

                autoTable(doc, {
                    startY: summaryY,
                    head: [['Book', 'Type', 'Customer / Party', 'Amount', 'Remarks / Reference']],
                    body: creditRows,
                    margin: { left: margin, right: margin },
                    styles: { fontSize: 7.5, cellPadding: 2, lineColor: [220, 220, 220], lineWidth: 0.2 },
                    headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
                    alternateRowStyles: { fillColor: [248, 248, 248] },
                    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 26 }, 2: { cellWidth: 48 }, 3: { halign: 'right', cellWidth: 28 }, 4: { cellWidth: 50 } }
                });
                summaryY = doc.lastAutoTable.finalY + 6;
            } else {
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text('No credit transactions recorded for the selected date/branch.', margin + 2, summaryY);
                summaryY += 8;
            }

            // Footer (Page Numbers)
            const totalPages = doc.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setFontSize(7);
                doc.setTextColor(160, 160, 160);
                doc.text(`${displayBranch} • ${dateStr}`, margin, doc.internal.pageSize.getHeight() - 8);
                doc.text(`Page ${i} of ${totalPages}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
                doc.text('Sarga Offset ERP System', pageW - margin, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
            }

            doc.save(`Daily-Report_${displayBranch}_${reportDate}.pdf`);
            toast.success('Daily Report PDF generated successfully');
        } catch (error) {
            console.error('PDF Generation failed:', error);
            toast.error('PDF Generation failed: ' + error.message);
        }
    };

    return (
        <button 
            className="btn btn-primary btn-sm dr-pdf-btn" 
            onClick={generatePDF} 
            title="Download PDF"
            aria-label="Download daily report as PDF"
            type="button"
        >
            <FileText size={15} /> PDF
        </button>
    );
}
