import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Clock, RefreshCw, Loader2, Eye, Printer, Wifi, WifiOff, ExternalLink, TrendingUp, Hash } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const MeterVerification = ({ machineId, machineName, machineIpAddress, lastClosingCount }) => {
    const [manualOpeningCount, setManualOpeningCount] = useState('');
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [meterLoading, setMeterLoading] = useState(false);
    const [verificationResult, setVerificationResult] = useState(null);
    const [meterData, setMeterData] = useState(null);
    const [comparisonHistory, setComparisonHistory] = useState([]);

    const handleFetchMeterData = async (silent = false) => {
        if (!machineIpAddress) {
            if (!silent) toast.error('Machine IP address not configured');
            return;
        }
        try {
            setMeterLoading(true);
            const res = await api.get(`/machines/${machineId}/mpr-meter-data`);
            setMeterData(res.data.meter_data);
            if (!silent) {
                if (res.data.meter_data.total_prints !== null && !res.data.meter_data.error) {
                    toast.success(`Meter refreshed: ${res.data.meter_data.total_prints.toLocaleString()} total prints`);
                } else if (res.data.meter_data.error) {
                    toast.error('SNMP unreachable — check printer network');
                }
            }
        } catch (error) {
            if (!silent) toast.error('Failed to reach machine');
        } finally {
            setMeterLoading(false);
        }
    };

    const handleVerifyCount = async () => {
        if (!manualOpeningCount) {
            toast.error('Please enter an opening count');
            return;
        }
        try {
            setVerifyLoading(true);
            const res = await api.post(`/machines/${machineId}/verify-count`, {
                manual_opening_count: parseInt(manualOpeningCount, 10)
            });
            setVerificationResult(res.data.comparison_result);
            if (res.data.comparison_result.has_mismatch) {
                toast.error(`Mismatch! ${res.data.comparison_result.mismatch_details?.message || 'Count does not match'}`);
            } else {
                toast.success('Count matches machine meter');
            }
            await handleFetchComparisonHistory();
        } catch (error) {
            toast.error('Failed to verify count');
        } finally {
            setVerifyLoading(false);
        }
    };

    const handleFetchComparisonHistory = async () => {
        try {
            const res = await api.get(`/machines/${machineId}/meter-comparison`, { params: { page: 1, limit: 10 } });
            setComparisonHistory(res.data.comparisons);
        } catch (_) {}
    };

    useEffect(() => {
        handleFetchMeterData(true);
        handleFetchComparisonHistory();
    }, [machineId]);

    // Auto-fill manual opening count when machine IP and meter reading are available
    useEffect(() => {
        if (isOnline && (manualOpeningCount === '' || manualOpeningCount == null)) {
            try {
                setManualOpeningCount(String(totalCount));
            } catch (e) {}
        }
    }, [isOnline, totalCount]);

    const isOnline = meterData && !meterData.error && meterData.total_prints !== null;
    const totalCount = isOnline ? meterData.total_prints : null;
    const fetchedTime = meterData?.fetched_at ? new Date(meterData.fetched_at) : null;
    const vendor = meterData?.vendor || '';
    const needsCredentials = meterData?.error && meterData.error.includes('requires login');

    // Determine the correct web UI URL based on vendor — works even when auth fails
    const getPanelUrl = () => {
        if (!machineIpAddress) return '';
        if (/canon/i.test(vendor) || needsCredentials) {
            return `http://${machineIpAddress}:8000/rps/`;
        } else if (/kyocera/i.test(vendor)) {
            return `http://${machineIpAddress}/cgi-bin/WebAccess.cgi`;
        } else if (/ricoh/i.test(vendor)) {
            return `http://${machineIpAddress}/`;
        } else {
            return `http://${machineIpAddress}/wcd/spa_main.html`;
        }
    };

    return (
        <div className="space-y-5">

            {/* ── TOP HERO: Live Meter Count ── */}
            <div className={`rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6 shadow-lg ${isOnline ? 'bg-gradient-to-r from-blue-600 to-indigo-700' : meterLoading ? 'bg-gradient-to-r from-gray-500 to-gray-600' : 'bg-gradient-to-r from-rose-600 to-red-700'}`}>
                {/* Icon */}
                <div className="flex-shrink-0 w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                    <Printer className="w-8 h-8 text-white" />
                </div>

                {/* Count */}
                <div className="flex-1 text-center sm:text-left">
                    <p className="text-white/70 text-sm font-medium uppercase tracking-widest mb-1">
                        {machineName || 'Machine'} — Live Meter Count
                    </p>
                    {meterLoading ? (
                        <div className="flex items-center gap-3">
                            <Loader2 className="w-7 h-7 text-white animate-spin" />
                            <span className="text-white text-2xl font-semibold">Fetching...</span>
                        </div>
                    ) : totalCount !== null ? (
                        <p className="text-white text-5xl font-extrabold tracking-tight">
                            {totalCount.toLocaleString()}
                            <span className="text-white/60 text-xl font-normal ml-2">prints</span>
                        </p>
                    ) : (
                        <p className="text-white text-2xl font-bold">Powered Off</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 justify-center sm:justify-start">
                        {isOnline ? (
                            <><Wifi className="w-4 h-4 text-green-300" /><span className="text-white/70 text-xs">Online · {machineIpAddress}</span></>
                        ) : meterLoading ? (
                            <><Loader2 className="w-4 h-4 text-white/60 animate-spin" /><span className="text-white/60 text-xs">Connecting…</span></>
                        ) : (
                            <><WifiOff className="w-4 h-4 text-red-300" /><span className="text-white/70 text-xs">Powered Off · {machineIpAddress || 'No IP set'}</span></>
                        )}
                        {fetchedTime && (
                            <span className="text-white/50 text-xs ml-2">Updated {fetchedTime.toLocaleTimeString()}</span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                        onClick={() => handleFetchMeterData(false)}
                        disabled={meterLoading || !machineIpAddress}
                        className="btn btn-sm bg-white/20 hover:bg-white/30 text-white border-white/30 gap-2"
                    >
                        {meterLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Refresh
                    </button>
                    {machineIpAddress && (
                        <a
                            href={getPanelUrl()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm bg-white/10 hover:bg-white/20 text-white border-white/20 gap-2"
                        >
                            <ExternalLink className="w-4 h-4" />
                            Open Panel
                        </a>
                    )}
                </div>
            </div>

            {/* ── CREDENTIALS WARNING ── */}
            {needsCredentials && (
                <div style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ fontSize: '1.25rem', marginTop: 1 }}>🔐</span>
                    <div>
                        <div style={{ fontWeight: 600, color: 'var(--warning)', marginBottom: 3 }}>Canon printer requires login credentials</div>
                        <div style={{ color: 'var(--warning)', fontSize: '0.85rem' }}>
                            To fetch meter counts automatically: <strong>double-click the machine card</strong>, scroll to <em>"Printer requires login (web interface)"</em>, enable it, and enter the same username/password you use when accessing the Canon web page in your browser.
                        </div>
                    </div>
                </div>
            )}

            {/* ── ERROR MESSAGE (non-credential errors) ── */}
            {meterData?.error && !needsCredentials && (
                <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error)', borderRadius: 10, padding: '10px 14px', color: 'var(--error)', fontSize: '0.85rem' }}>
                    ⚠️ {meterData.error}
                </div>
            )}

            {/* ── VERIFY SECTION ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* Manual Entry */}
                <div className="card bg-base-100 border border-base-300 shadow-sm">
                    <div className="card-body gap-4">
                        <h4 className="font-semibold text-base flex items-center gap-2">
                            <Hash className="w-5 h-5 text-primary" />
                            Enter Opening Count
                        </h4>

                        {lastClosingCount != null && (
                            <div className="flex items-center justify-between bg-base-200 rounded-lg px-4 py-2 text-sm">
                                <span className="text-base-content/60">Yesterday's Closing</span>
                                <span className="font-bold text-base-content">{Number(lastClosingCount).toLocaleString()}</span>
                            </div>
                        )}

                        <input
                            type="number"
                            placeholder="Enter today's opening meter count"
                            className="input input-bordered w-full text-lg"
                            value={manualOpeningCount}
                            onChange={(e) => setManualOpeningCount(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleVerifyCount()}
                        />

                        <div className="flex items-center gap-2 mt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    if (isOnline && totalCount != null) {
                                        setManualOpeningCount(String(totalCount));
                                    } else {
                                        toast.error('Machine reading not available');
                                    }
                                }}
                                disabled={!isOnline}
                                className="btn btn-ghost btn-sm"
                            >
                                Use machine count
                            </button>
                            {isOnline && (
                                <span className="text-sm text-base-content/60">Auto-filled from {machineIpAddress}</span>
                            )}
                        </div>

                        <button
                            onClick={handleVerifyCount}
                            disabled={verifyLoading || !manualOpeningCount}
                            className="btn btn-primary w-full gap-2"
                        >
                            {verifyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                            Verify Count
                        </button>
                    </div>
                </div>

                {/* Result Panel */}
                <div className={`card shadow-sm border ${verificationResult ? (verificationResult.has_mismatch ? 'border-warning bg-warning/5' : 'border-success bg-success/5') : 'border-base-300 bg-base-100'}`}>
                    <div className="card-body gap-3">
                        <h4 className="font-semibold text-base flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-secondary" />
                            Verification Result
                        </h4>

                        {!verificationResult ? (
                            <div className="flex flex-col items-center justify-center py-6 text-base-content/40 gap-2">
                                <CheckCircle className="w-10 h-10" />
                                <p className="text-sm">Enter a count and verify</p>
                            </div>
                        ) : verificationResult.has_mismatch ? (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-warning font-bold text-lg">
                                    <AlertTriangle className="w-6 h-6" />
                                    Mismatch Detected
                                </div>
                                {verificationResult.mismatch_details && typeof verificationResult.mismatch_details === 'string' ? (
                                    <div className="bg-base-200 rounded-lg p-3 text-sm text-base-content/70">
                                        {verificationResult.mismatch_details}
                                    </div>
                                ) : verificationResult.mismatch_details && (
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div className="bg-base-200 rounded-lg p-3">
                                            <p className="text-base-content/50 text-xs">You Entered</p>
                                            <p className="font-bold text-lg">{Number(verificationResult.mismatch_details.expected_count).toLocaleString()}</p>
                                        </div>
                                        <div className="bg-base-200 rounded-lg p-3">
                                            <p className="text-base-content/50 text-xs">Machine Count</p>
                                            <p className="font-bold text-lg text-warning">{Number(verificationResult.mismatch_details.actual_count).toLocaleString()}</p>
                                        </div>
                                        <div className="col-span-2 bg-warning/10 border border-warning/30 rounded-lg p-3 text-center">
                                            <p className="text-xs text-base-content/60">Difference</p>
                                            <p className="font-extrabold text-2xl text-warning">
                                                {verificationResult.mismatch_details.variance > 0 ? '+' : ''}{Number(verificationResult.mismatch_details.variance).toLocaleString()}
                                                <span className="text-sm font-normal ml-1">({verificationResult.mismatch_details.variance_percent}%)</span>
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {verificationResult.count_request_created && (
                                    <p className="text-xs text-warning/80 bg-warning/10 rounded px-3 py-2">
                                        Request #{verificationResult.count_request_id} created for admin review
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-6 gap-2">
                                <CheckCircle className="w-12 h-12 text-success" />
                                <p className="font-bold text-success text-lg">Count Verified</p>
                                <p className="text-base-content/50 text-sm">
                                    {Number(verificationResult.actual_count).toLocaleString()} matches machine meter
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── HISTORY TABLE ── */}
            <div className="card bg-base-100 border border-base-300 shadow-sm">
                <div className="card-body">
                    <h4 className="font-semibold text-base flex items-center gap-2 mb-2">
                        <Clock className="w-5 h-5 text-secondary" />
                        Recent Comparisons
                    </h4>
                    {comparisonHistory.length === 0 ? (
                        <div className="flex flex-col items-center py-8 text-base-content/30 gap-2">
                            <Clock className="w-8 h-8" />
                            <p className="text-sm">No comparison history yet</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="table table-sm w-full">
                                <thead>
                                    <tr className="text-xs text-base-content/50 uppercase">
                                        <th>Date</th>
                                        <th className="text-right">Entered</th>
                                        <th className="text-right">Machine</th>
                                        <th className="text-right">Variance</th>
                                        <th className="text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {comparisonHistory.map((rec) => {
                                        const variance = rec.expected_count != null ? (rec.expected_count - rec.entered_count) : null;
                                        return (
                                            <tr key={rec.id} className="hover">
                                                <td className="text-sm">{rec.reading_date}</td>
                                                <td className="text-right font-mono text-sm">{rec.entered_count != null ? Number(rec.entered_count).toLocaleString() : '—'}</td>
                                                <td className="text-right font-mono text-sm">{rec.expected_count != null ? Number(rec.expected_count).toLocaleString() : '—'}</td>
                                                <td className={`text-right font-mono text-sm font-semibold ${variance === null ? '' : variance !== 0 ? 'text-warning' : 'text-success'}`}>
                                                    {variance === null ? '—' : `${variance > 0 ? '+' : ''}${variance.toLocaleString()}`}
                                                </td>
                                                <td className="text-center">
                                                    <span className={`badge badge-sm ${rec.status === 'Pending' ? 'badge-warning' : rec.status === 'Approved' ? 'badge-success' : 'badge-error'}`}>
                                                        {rec.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MeterVerification;
