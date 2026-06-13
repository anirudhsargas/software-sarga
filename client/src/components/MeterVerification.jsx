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
        <div className="meter-verification">

            {/* ── TOP HERO: Live Meter Count ── */}
            <div className={`meter-hero meter-hero--${isOnline ? 'online' : meterLoading ? 'loading' : 'offline'}`}>
                {/* Icon */}
                <div className="meter-hero__icon">
                    <Printer className="w-8 h-8 text-white" />
                </div>

                {/* Count */}
                <div className="meter-hero__content">
                    <p className="meter-hero__label">
                        {machineName || 'Machine'} — Live Meter Count
                    </p>
                    {meterLoading ? (
                        <div className="meter-hero__loading">
                            <Loader2 className="w-7 h-7 text-white animate-spin" />
                            <span className="meter-hero__loading-text">Fetching...</span>
                        </div>
                    ) : totalCount !== null ? (
                        <p className="meter-hero__count">
                            {totalCount.toLocaleString()}
                            <span className="meter-hero__unit">prints</span>
                        </p>
                    ) : (
                        <p className="meter-hero__status-offline">Powered Off</p>
                    )}
                    <div className="meter-hero__meta">
                        {isOnline ? (
                            <><Wifi className="w-4 h-4 text-green-300" /><span className="meter-hero__meta-text">Online · {machineIpAddress}</span></>
                        ) : meterLoading ? (
                            <><Loader2 className="w-4 h-4 text-white/60 animate-spin" /><span className="meter-hero__meta-text">Connecting…</span></>
                        ) : (
                            <><WifiOff className="w-4 h-4 text-red-300" /><span className="meter-hero__meta-text">Powered Off · {machineIpAddress || 'No IP set'}</span></>
                        )}
                        {fetchedTime && (
                            <span className="meter-hero__meta-time">Updated {fetchedTime.toLocaleTimeString()}</span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="meter-hero__actions">
                    <button
                        onClick={() => handleFetchMeterData(false)}
                        disabled={meterLoading || !machineIpAddress}
                        className="btn btn-sm btn-glass"
                    >
                        {meterLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Refresh
                    </button>
                    {machineIpAddress && (
                        <a
                            href={getPanelUrl()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-glass-light"
                        >
                            <ExternalLink className="w-4 h-4" />
                            Open Panel
                        </a>
                    )}
                </div>
            </div>

            {/* ── CREDENTIALS WARNING ── */}
            {needsCredentials && (
                <div className="alert alert--warning">
                    <span className="alert__icon">🔐</span>
                    <div>
                        <div className="alert__title">Canon printer requires login credentials</div>
                        <div className="alert__message">
                            To fetch meter counts automatically: <strong>double-click the machine card</strong>, scroll to <em>"Printer requires login (web interface)"</em>, enable it, and enter the same username/password you use when accessing the Canon web page in your browser.
                        </div>
                    </div>
                </div>
            )}

            {/* ── ERROR MESSAGE (non-credential errors) ── */}
            {meterData?.error && !needsCredentials && (
                <div className="alert alert--error">
                    ⚠️ {meterData.error}
                </div>
            )}

            {/* ── VERIFY SECTION ── */}
            <div className="verify-grid">

                {/* Manual Entry */}
                <div className="card">
                    <div className="card-body">
                        <h4 className="card-title">
                            <Hash className="w-5 h-5 text-primary" />
                            Enter Opening Count
                        </h4>

                        {lastClosingCount != null && (
                            <div className="closing-count">
                                <span className="closing-count__label">Yesterday's Closing</span>
                                <span className="closing-count__value">{Number(lastClosingCount).toLocaleString()}</span>
                            </div>
                        )}

                        <input
                            type="number"
                            placeholder="Enter today's opening meter count"
                            className="input-field"
                            value={manualOpeningCount}
                            onChange={(e) => setManualOpeningCount(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleVerifyCount()}
                        />

                        <div className="verify-actions">
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
                                <span className="verify-actions__hint">Auto-filled from {machineIpAddress}</span>
                            )}
                        </div>

                        <button
                            onClick={handleVerifyCount}
                            disabled={verifyLoading || !manualOpeningCount}
                            className="btn btn-primary w-full"
                        >
                            {verifyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                            Verify Count
                        </button>
                    </div>
                </div>

                {/* Result Panel */}
                <div className={`card card--result ${verificationResult ? (verificationResult.has_mismatch ? 'card--warning' : 'card--success') : ''}`}>
                    <div className="card-body">
                        <h4 className="card-title">
                            <TrendingUp className="w-5 h-5 text-secondary" />
                            Verification Result
                        </h4>

                        {!verificationResult ? (
                            <div className="result-empty">
                                <CheckCircle className="w-10 h-10" />
                                <p className="text-sm">Enter a count and verify</p>
                            </div>
                        ) : verificationResult.has_mismatch ? (
                            <div className="result-mismatch">
                                <div className="result-mismatch__header">
                                    <AlertTriangle className="w-6 h-6" />
                                    Mismatch Detected
                                </div>
                                {verificationResult.mismatch_details && typeof verificationResult.mismatch_details === 'string' ? (
                                    <div className="result-mismatch__detail">
                                        {verificationResult.mismatch_details}
                                    </div>
                                ) : verificationResult.mismatch_details && (
                                    <div className="result-mismatch__grid">
                                        <div className="result-mismatch__item">
                                            <p className="result-mismatch__item-label">You Entered</p>
                                            <p className="result-mismatch__item-value">{Number(verificationResult.mismatch_details.expected_count).toLocaleString()}</p>
                                        </div>
                                        <div className="result-mismatch__item">
                                            <p className="result-mismatch__item-label">Machine Count</p>
                                            <p className="result-mismatch__item-value result-mismatch__item-value--warning">{Number(verificationResult.mismatch_details.actual_count).toLocaleString()}</p>
                                        </div>
                                        <div className="result-mismatch__variance">
                                            <p className="result-mismatch__variance-label">Difference</p>
                                            <p className="result-mismatch__variance-value">
                                                {verificationResult.mismatch_details.variance > 0 ? '+' : ''}{Number(verificationResult.mismatch_details.variance).toLocaleString()}
                                                <span className="result-mismatch__variance-percent">({verificationResult.mismatch_details.variance_percent}%)</span>
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {verificationResult.count_request_created && (
                                    <p className="result-request">
                                        Request #{verificationResult.count_request_id} created for admin review
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="result-success">
                                <CheckCircle className="w-12 h-12 text-success" />
                                <p className="result-success__title">Count Verified</p>
                                <p className="result-success__message">
                                    {Number(verificationResult.actual_count).toLocaleString()} matches machine meter
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── HISTORY TABLE ── */}
            <div className="card">
                <div className="card-body">
                    <h4 className="card-title">
                        <Clock className="w-5 h-5 text-secondary" />
                        Recent Comparisons
                    </h4>
                    {comparisonHistory.length === 0 ? (
                        <div className="history-empty">
                            <Clock className="w-8 h-8" />
                            <p className="text-sm">No comparison history yet</p>
                        </div>
                    ) : (
                        <div className="table-wrapper">
                            <table className="table">
                                <thead>
                                    <tr>
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
                                            <tr key={rec.id}>
                                                <td className="text-sm">{rec.reading_date}</td>
                                                <td className="text-right font-mono text-sm">{rec.entered_count != null ? Number(rec.entered_count).toLocaleString() : '—'}</td>
                                                <td className="text-right font-mono text-sm">{rec.expected_count != null ? Number(rec.expected_count).toLocaleString() : '—'}</td>
                                                <td className={`text-right font-mono text-sm font-semibold ${variance === null ? '' : variance !== 0 ? 'text-warning' : 'text-success'}`}>
                                                    {variance === null ? '—' : `${variance > 0 ? '+' : ''}${variance.toLocaleString()}`}
                                                </td>
                                                <td className="text-center">
                                                    <span className={`status-badge status-badge--small ${rec.status === 'Pending' ? 'status-badge--warning' : rec.status === 'Approved' ? 'status-badge--success' : 'status-badge--error'}`}>
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
