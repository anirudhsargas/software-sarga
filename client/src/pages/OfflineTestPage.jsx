import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { runAllOfflineTests } from '../tests/offlineTest';
import toast from 'react-hot-toast';
import './OfflineTestPage.css';

const OfflineTestPage = () => {
  const [testResults, setTestResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  // Auto-run tests on page load
  useEffect(() => {
    runTests();
  }, []);

  const runTests = async () => {
    setRunning(true);
    setLoading(true);
    try {
      const results = await runAllOfflineTests();
      setTestResults(results);
      if (results.error) {
        toast.error('Tests failed: ' + results.error);
      } else {
        toast.success(`Tests completed: ${results.summary.passed}/${results.summary.total} passed`);
      }
    } catch (err) {
      console.error('Error running tests:', err);
      toast.error('Failed to run tests');
      setTestResults({ error: err.message });
    } finally {
      setRunning(false);
      setLoading(false);
    }
  };

  const downloadReport = () => {
    if (!testResults) {
      toast.error('No test results to download');
      return;
    }

    const dataStr = JSON.stringify(testResults, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `offline-test-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Report downloaded');
  };

  if (testResults?.error) {
    return (
      <div className="otp-page">
        <div className="otp-header">
          <h1>Offline Functionality Tests</h1>
          <p>Comprehensive test suite for offline features</p>
        </div>
        <div className="otp-error">
          <AlertCircle size={32} />
          <h2>Test Error</h2>
          <p>{testResults.error}</p>
          <button className="btn btn-primary" onClick={runTests}>
            <RefreshCw size={18} />
            Retry Tests
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="otp-page">
      {/* Header */}
      <div className="otp-header">
        <div>
          <h1>Offline Functionality Tests</h1>
          <p>Comprehensive test suite for offline features</p>
        </div>
        <div className="otp-header-actions">
          <button
            className="btn btn-primary"
            onClick={runTests}
            disabled={running}
          >
            <RefreshCw size={18} style={{ animation: running ? 'spin 1s linear infinite' : 'none' }} />
            {running ? 'Running...' : 'Run All Tests'}
          </button>
          <button
            className="btn btn-ghost"
            onClick={downloadReport}
            disabled={!testResults}
          >
            <Download size={18} />
            Download Report
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && !testResults && (
        <div className="otp-loading">
          <div className="spinner" />
          <p>Running offline test suite...</p>
        </div>
      )}

      {/* Results */}
      {testResults && !testResults.error && (
        <>
          {/* Summary Card */}
          <div className="otp-summary">
            <div className="otp-summary-item">
              <span className="otp-summary-label">Total Tests</span>
              <span className="otp-summary-value">{testResults.summary.total}</span>
            </div>
            <div className={`otp-summary-item ${testResults.summary.passed === testResults.summary.total ? 'success' : 'warning'}`}>
              <span className="otp-summary-label">Passed</span>
              <span className="otp-summary-value">{testResults.summary.passed}</span>
            </div>
            <div className={`otp-summary-item ${testResults.summary.failed > 0 ? 'error' : 'success'}`}>
              <span className="otp-summary-label">Failed</span>
              <span className="otp-summary-value">{testResults.summary.failed}</span>
            </div>
            <div className="otp-summary-item">
              <span className="otp-summary-label">Success Rate</span>
              <span className="otp-summary-value">{testResults.summary.percentage}%</span>
            </div>
            <div className="otp-summary-item muted">
              <Clock size={14} />
              <span className="otp-summary-label">Last Run</span>
              <span className="otp-summary-value otp-timestamp">
                {new Date(testResults.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>

          {/* Test Categories */}
          <div className="otp-categories">
            {testResults.categories.map((category, categoryIdx) => {
              const categoryPassed = category.results.filter(r => r.pass).length;
              const categoryTotal = category.results.length;
              const categorySuccess = categoryTotal === categoryPassed;

              return (
                <div key={categoryIdx} className={`otp-category ${categorySuccess ? 'success' : 'warning'}`}>
                  <div className="otp-category-header">
                    <h2>{category.category}</h2>
                    <span className="otp-category-badge">
                      {categoryPassed}/{categoryTotal}
                    </span>
                  </div>

                  <div className="otp-tests">
                    {category.results.map((result, testIdx) => (
                      <div
                        key={testIdx}
                        className={`otp-test ${result.pass ? 'pass' : 'fail'}`}
                      >
                        <div className="otp-test-icon">
                          {result.pass ? (
                            <CheckCircle2 size={20} className="otp-icon-pass" />
                          ) : (
                            <AlertCircle size={20} className="otp-icon-fail" />
                          )}
                        </div>
                        <div className="otp-test-content">
                          <div className="otp-test-name">{result.test}</div>
                          <div className="otp-test-detail">{result.detail}</div>
                          {result.count !== undefined && (
                            <div className="otp-test-meta">Count: {result.count}</div>
                          )}
                        </div>
                        <div className={`otp-test-status ${result.pass ? 'pass' : 'fail'}`}>
                          {result.pass ? '✅' : '❌'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary Stats */}
          <div className="otp-footer">
            <div className="otp-footer-content">
              {testResults.summary.passed === testResults.summary.total ? (
                <div className="otp-footer-success">
                  <CheckCircle2 size={24} />
                  <div>
                    <strong>All systems operational!</strong>
                    <p>Offline functionality is fully ready.</p>
                  </div>
                </div>
              ) : (
                <div className="otp-footer-warning">
                  <AlertCircle size={24} />
                  <div>
                    <strong>Some tests failed</strong>
                    <p>Check the details above and run tests again after fixing issues.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default OfflineTestPage;
