import React from 'react';
import { useSEO } from '../hooks/useSEO';
import { serverNow } from '../services/serverTime';
import toast from 'react-hot-toast';
import { formatCurrencyDecimal } from '../constants';
import { FileText } from 'lucide-react';

const formatCurrency = formatCurrencyDecimal;
const formatNum = (val) => (Number(val) || 0).toLocaleString('en-IN');
const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const formatDateDisplay = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

export default function DailyReportPDFExport({
    branchName,
    reportDate,
    offsetData,
    laserData,
    otherData,
    openingBalances,
    creditTotals,
    creditTransactions,
    attendanceData,
    isFrontOffice,
    user,
    branches,
    branchId
}) {
    useSEO('Daily Report P D F Export');


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
                    doc.setTextColor(options.color || [30, 30, 30]);

                    const cleanValue = String(value).replace('₹', 'Rs. ');
                    doc.text(cleanValue, pageW - margin - 2, yPos, { align: 'right' });
                    return yPos + 5.5;
                } catch {
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
                const opening = openingBalances[key] || 0;

                currentY = sectionHeader(`${key.toUpperCase()} BOOK`, color, currentY);
                doc.setTextColor(30, 30, 30);
                doc.setFont('helvetica', 'normal');

                currentY = kvRow('Opening Cash Balance', formatCurrency(opening), currentY);

                if (key === 'Laser' && data.machines?.length > 0) {
                    // Only show machines belonging to the currently selected branch.
                    const branchMachines = branchId
                        ? data.machines.filter(m => String(m.branch_id) === String(branchId))
                        : data.machines;
                    branchMachines.forEach(m => {
                        currentY = kvRow(`${m.machine_name} — Opening`, formatNum(m.opening_count || 0), currentY);
                        currentY = kvRow(`${m.machine_name} — Closing`, formatNum(m.closing_count || 0), currentY);
                        currentY = kvRow(`${m.machine_name} — Copies`, formatNum(m.today_copies || 0), currentY, { color: [5, 150, 105] });
                    });
                }

                if (entries.length > 0) {
                    const isLaser = key === 'Laser';
                    const head = isLaser
                        ? [['Time', 'Description', 'Machine', 'Copies', 'Mode', 'Cash', 'UPI', 'Total']]
                        : [['Time', 'Description', 'Type', 'Mode', 'Cash', 'UPI', 'Total']];

                    const body = entries.map(e => {
                        const isExp = e.type === 'expense';
                        const sign = isExp ? '-' : '';
                        const fPdf = (val) => `${sign}Rs. ${(Number(val) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                        if (isLaser) {
                            return [formatTime(e.time), e.description || '', e.machine_name || '—', String(e.copies || ''),
                            e.payment_method || 'Cash', fPdf(e.cash_amount), fPdf(e.upi_amount), fPdf(e.total)];
                        }
                        return [formatTime(e.time), e.description || '', isExp ? 'Expense' : 'Income',
                        e.payment_method || 'Cash', fPdf(e.cash_amount), fPdf(e.upi_amount), fPdf(e.total)];
                    });

                    autoTable(doc, {
                        startY: currentY,
                        head,
                        body,
                        margin: { left: margin, right: margin },
                        styles: { fontSize: 8, cellPadding: 2.5, lineColor: [220, 220, 220], lineWidth: 0.2 },
                        headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
                        alternateRowStyles: { fillColor: [248, 248, 248] },
                        columnStyles: isLaser
                            ? { 0: { cellWidth: 18 }, 2: { halign: 'right', cellWidth: 16 }, 3: { halign: 'right' }, 4: { halign: 'left' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right', fontStyle: 'bold' } }
                            : { 0: { cellWidth: 18 }, 2: { cellWidth: 18 }, 3: { halign: 'left' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' } }
                    });
                    currentY = doc.lastAutoTable.finalY + 6;
                } else {
                    doc.setFontSize(8);
                    doc.setTextColor(150, 150, 150);
                    doc.text('No entries recorded', margin + 2, currentY);
                    currentY += 8;
                }

                if (currentY > 260) { doc.addPage(); renderHeader(); currentY = 44; }

                currentY = kvRow('Cash In', formatCurrency(summary.total_cash_in || 0), currentY, { color: [47, 125, 74] });
                currentY = kvRow('UPI In', formatCurrency(summary.total_upi_in || 0), currentY, { color: [47, 125, 74] });
                if (summary.total_cash_out !== undefined && summary.total_cash_out !== null) {
                    currentY = kvRow('Cash Out', formatCurrency(summary.total_cash_out), currentY, { color: [176, 58, 46] });
                }
                if (summary.total_copies !== undefined) {
                    currentY = kvRow('Total Copies', formatNum(summary.total_copies), currentY);
                }

                doc.setFillColor(245, 245, 240);
                doc.roundedRect(margin, currentY - 1, pageW - margin * 2, 8, 1.5, 1.5, 'F');
                currentY = kvRow('CASH CLOSING BALANCE', formatCurrency(summary.cash_closing || 0), currentY, { color: color });
            });

            // Attendance & Credit summary page
            doc.addPage();
            renderHeader();
            let summaryY = 44;

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

            const attendancePresent = attendanceStaff.filter(s => s && (s.entry_time || s.status === 'present' || s.status === 'Present')).length;
            const attendanceAbsent = Math.max(0, attendanceStaff.length - attendancePresent);

            summaryY = sectionHeader('Attendance Summary', [245, 158, 11], summaryY);
            summaryY = kvRow('Total staff tracked', String(attendanceStaff.length), summaryY);
            summaryY = kvRow('Present today', String(attendancePresent), summaryY, { color: [34, 197, 94] });
            summaryY = kvRow('Absent / missing', String(attendanceAbsent), summaryY, { color: [220, 38, 38] });
            summaryY = kvRow('Alerts', String(attendanceData?.alert_count || 0), summaryY, { color: [249, 115, 22] });
            summaryY = kvRow('Discrepancies', String(attendanceData?.discrepancy_count || 0), summaryY, { color: [168, 85, 247] });

            if (attendanceStaff.length > 0) {
                const attendanceRows = attendanceStaff.slice(0, 10).map(s => [
                    s.name || s.staff_name || '—',
                    String(s.status || '').replace(/^(present|Present)$/i, 'Present').replace(/^(absent|Absent)$/i, 'Absent'),
                    s.entry_time || s.exit_time || '—',
                    s.branch_name || '—'
                ]);

                autoTable(doc, {
                    startY: summaryY,
                    head: [['Staff', 'Status', 'Time', 'Branch']],
                    body: attendanceRows,
                    margin: { left: margin, right: margin },
                    styles: { fontSize: 8, cellPadding: 2.5, lineColor: [220, 220, 220], lineWidth: 0.2 },
                    headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
                    alternateRowStyles: { fillColor: [248, 248, 248] },
                    columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 28 }, 2: { cellWidth: 28 }, 3: { cellWidth: 38 } }
                });
                summaryY = doc.lastAutoTable.finalY + 6;
            } else {
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text('No attendance records available for the selected date/branch.', margin + 2, summaryY);
                summaryY += 8;
            }

            if (summaryY > 260) { doc.addPage(); renderHeader(); summaryY = 44; }

            summaryY = sectionHeader('Credit Summary', [16, 185, 129], summaryY);
            summaryY = kvRow('Credit In', formatCurrency(creditTotals?.in || 0), summaryY, { color: [34, 197, 94] });
            summaryY = kvRow('Credit Out', formatCurrency(creditTotals?.out || 0), summaryY, { color: [220, 38, 38] });
            summaryY = kvRow('Net credit', formatCurrency((creditTotals?.in || 0) - (creditTotals?.out || 0)), summaryY, { color: [30, 64, 175] });

            if (creditTransactions?.length > 0) {
                const creditRows = creditTransactions.slice(0, 10).map(t => [
                    t.transaction_type || t.type || 'Credit',
                    t.customer_name || t.customer || '—',
                    formatCurrency(t.amount),
                    t.reference_number || t.invoice_number || t.invoice_no || '—'
                ]);

                autoTable(doc, {
                    startY: summaryY,
                    head: [['Type', 'Customer', 'Amount', 'Reference']],
                    body: creditRows,
                    margin: { left: margin, right: margin },
                    styles: { fontSize: 8, cellPadding: 2.5, lineColor: [220, 220, 220], lineWidth: 0.2 },
                    headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
                    alternateRowStyles: { fillColor: [248, 248, 248] },
                    columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 52 }, 2: { halign: 'right', cellWidth: 28 }, 3: { cellWidth: 43 } }
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
                doc.text('Print Preview', pageW - margin, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
            }

            doc.save(`Daily-Report_${displayBranch}_${reportDate}.pdf`);
        } catch (error) {
            console.error('PDF Generation failed:', error);
            toast.error('PDF Generation failed. Error: ' + error.message);
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
