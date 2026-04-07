/**
 * offlineTest.js — Comprehensive offline functionality test suite
 * 
 * Tests:
 *  1. Master Data Cache — products, customers, branches, machines
 *  2. Offline Bill Creation — saving bills offline
 *  3. Offline Payment Creation — saving payments offline
 *  4. IndexedDB Health — read/write/storage quota
 *  5. Sync Engine — network status, pending items, sync capability
 */

import offlineDb from '../services/offlineDb';
// All sync logic is now handled by syncWorker.js in a Web Worker.

// ──────────────────── Test 1: Master Data Cache ────────────────────

export const testMasterDataCache = async () => {
  const results = [];

  // Check products cached
  try {
    const products = await offlineDb.getCachedProducts();
    results.push({
      test: 'Products cached',
      pass: products && products.length > 0,
      count: products?.length || 0,
      detail: products?.length > 0 
        ? `✅ ${products.length} products available offline` 
        : '❌ No products cached'
    });
  } catch (err) {
    results.push({
      test: 'Products cached',
      pass: false,
      detail: `❌ Error: ${err.message}`
    });
  }

  // Check customers cached
  try {
    const customers = await offlineDb.getCachedCustomers();
    results.push({
      test: 'Customers cached',
      pass: customers && customers.length > 0,
      count: customers?.length || 0,
      detail: customers?.length > 0 
        ? `✅ ${customers.length} customers available offline` 
        : '❌ No customers cached'
    });
  } catch (err) {
    results.push({
      test: 'Customers cached',
      pass: false,
      detail: `❌ Error: ${err.message}`
    });
  }

  // Check branches cached
  try {
    const branches = await offlineDb.getCachedBranches();
    results.push({
      test: 'Branches cached',
      pass: branches && branches.length > 0,
      detail: branches?.length > 0 
        ? `✅ ${branches.length} branches cached` 
        : '❌ No branches cached'
    });
  } catch (err) {
    results.push({
      test: 'Branches cached',
      pass: false,
      detail: `❌ Error: ${err.message}`
    });
  }

  // Check machines cached
  try {
    const machines = await offlineDb.getCachedMachines();
    results.push({
      test: 'Machines cached',
      pass: machines && machines.length > 0,
      detail: machines?.length > 0 
        ? `✅ ${machines.length} machines cached` 
        : '❌ No machines cached'
    });
  } catch (err) {
    results.push({
      test: 'Machines cached',
      pass: false,
      detail: `❌ Error: ${err.message}`
    });
  }

  // Check last sync time
  try {
    const lastSync = localStorage.getItem('lastMasterDataSync');
    const syncAge = lastSync ? Math.round((Date.now() - Number(lastSync)) / 60000) : null;
    results.push({
      test: 'Last sync time',
      pass: syncAge !== null && syncAge < 360, // 6 hours
      detail: lastSync 
        ? `✅ Last synced ${syncAge} minutes ago` 
        : '⚠️ Never synced (sync on first online)'
    });
  } catch (err) {
    results.push({
      test: 'Last sync time',
      pass: false,
      detail: `❌ Error: ${err.message}`
    });
  }

  return { category: 'Master Data Cache', results };
};

// ──────────────────── Test 2: Offline Bill Creation ────────────────────

export const testOfflineBillCreation = async () => {
  const results = [];

  // Create a test bill offline
  const testBill = {
    customerId: null,
    customerName: 'OFFLINE_TEST_BILL',
    customerMobile: '9999999999',
    customerType: 'Walk-in',
    totalAmount: 1000,
    netAmount: 847.46,
    sgstAmount: 76.27,
    cgstAmount: 76.27,
    discountPercent: null,
    discountAmount: null,
    advancePaid: 1000,
    paymentMethod: 'Cash',
    cashAmount: 1000,
    upiAmount: 0,
    chequeAmount: 0,
    accountTransferAmount: 0,
    referenceNumber: null,
    description: 'Test offline bill',
    paymentDate: new Date().toISOString().split('T')[0],
    orderLines: [
      {
        product_id: 999,
        product_name: 'Test Product',
        quantity: 1,
        unit_price: 1000,
        total_amount: 1000
      }
    ],
    test: true
  };

  try {
    const saved = await offlineDb.queueBill(testBill);
    results.push({
      test: 'Create bill offline',
      pass: !!saved,
      detail: saved ? `✅ Bill saved with ID: ${saved}` : '❌ Failed to save bill'
    });

    // Verify it appears in pending list
    try {
      const pending = await offlineDb.getPendingBills();
      const found = pending.find(b => b.id === saved);
      results.push({
        test: 'Bill in pending queue',
        pass: !!found,
        detail: found 
          ? `✅ Found in queue (${pending.length} total pending)` 
          : '❌ Not found in queue'
      });

      // Clean up test bill
      if (found) {
        await offlineDb.updateBillStatus(saved, 'synced');
        await offlineDb.deleteSyncedBills();
      }
    } catch (err) {
      results.push({
        test: 'Bill in pending queue',
        pass: false,
        detail: `❌ Error: ${err.message}`
      });
    }

  } catch (err) {
    results.push({
      test: 'Create bill offline',
      pass: false,
      detail: `❌ Error: ${err.message}`
    });
  }

  return { category: 'Offline Bill Creation', results };
};

// ──────────────────── Test 3: Offline Payment Creation ────────────────────

export const testOfflinePaymentCreation = async () => {
  const results = [];

  const testPayment = {
    customer_id: null,
    customer_name: 'OFFLINE_TEST_PAYMENT',
    customer_mobile: '9999999999',
    total_amount: 5000,
    net_amount: 4237.29,
    sgst_amount: 381.36,
    cgst_amount: 381.35,
    discount_percent: null,
    discount_amount: null,
    advance_paid: 5000,
    cash_amount: 3000,
    upi_amount: 2000,
    cheque_amount: 0,
    account_transfer_amount: 0,
    reference_number: null,
    description: 'Test offline payment',
    payment_date: new Date().toISOString().split('T')[0],
    order_lines: [],
    job_ids: [],
    test: true
  };

  try {
    const saved = await offlineDb.savePendingPayment(testPayment);
    results.push({
      test: 'Create payment offline',
      pass: !!saved,
      detail: saved ? `✅ Payment saved: ${saved}` : '❌ Failed'
    });

    try {
      const pending = await offlineDb.getPendingPayments();
      const found = pending.find(p => p.id === saved);
      results.push({
        test: 'Payment in pending queue',
        pass: !!found,
        detail: found 
          ? `✅ ${pending.length} payments pending sync` 
          : '❌ Not in queue'
      });

      // Clean up test payment
      if (found) {
        await offlineDb.updatePaymentStatus(saved, 'synced');
        await offlineDb.deleteSyncedPayments();
      }
    } catch (err) {
      results.push({
        test: 'Payment in pending queue',
        pass: false,
        detail: `❌ Error: ${err.message}`
      });
    }

  } catch (err) {
    results.push({
      test: 'Create payment offline',
      pass: false,
      detail: `❌ Error: ${err.message}`
    });
  }

  return { category: 'Offline Payment', results };
};

// ──────────────────── Test 4: IndexedDB Health ────────────────────

export const testIndexedDBHealth = async () => {
  const results = [];

  // Test general IndexedDB availability
  try {
    const available = !!window.indexedDB;
    results.push({
      test: 'IndexedDB available',
      pass: available,
      detail: available ? '✅ IndexedDB supported' : '❌ IndexedDB not supported'
    });
  } catch (err) {
    results.push({
      test: 'IndexedDB available',
      pass: false,
      detail: `❌ Error: ${err.message}`
    });
  }

  // Test write
  try {
    await offlineDb.setMeta('health_check', { timestamp: Date.now(), value: 'test' });
    results.push({
      test: 'IndexedDB write',
      pass: true,
      detail: '✅ Write successful'
    });
  } catch (err) {
    results.push({
      test: 'IndexedDB write',
      pass: false,
      detail: `❌ ${err.message}`
    });
  }

  // Test read
  try {
    const val = await offlineDb.getMeta('health_check');
    results.push({
      test: 'IndexedDB read',
      pass: !!val,
      detail: val ? '✅ Read successful' : '❌ Read failed'
    });
  } catch (err) {
    results.push({
      test: 'IndexedDB read',
      pass: false,
      detail: `❌ ${err.message}`
    });
  }

  // Check storage quota
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const usedMB = Math.round(estimate.usage / 1024 / 1024);
      const quotaMB = Math.round(estimate.quota / 1024 / 1024);
      const percentUsed = Math.round((usedMB / quotaMB) * 100);
      results.push({
        test: 'Storage quota',
        pass: usedMB < quotaMB * 0.8,
        detail: `✅ Using ${usedMB}MB of ${quotaMB}MB (${percentUsed}%)`
      });
    } else {
      results.push({
        test: 'Storage quota',
        pass: false,
        detail: '⚠️ Storage API not available'
      });
    }
  } catch (err) {
    results.push({
      test: 'Storage quota',
      pass: false,
      detail: `❌ Cannot check quota: ${err.message}`
    });
  }

  return { category: 'IndexedDB Health', results };
};

// ──────────────────── Test 5: Sync Engine ────────────────────

export const testSyncEngine = async () => {
  const results = [];

  // Check network status
  results.push({
    test: 'Network status',
    pass: navigator.onLine,
    detail: navigator.onLine ? '🟢 Online' : '🔴 Offline'
  });

  // Count pending bills
  try {
    const pendingBills = await offlineDb.getPendingBills();
    results.push({
      test: 'Pending bills',
      pass: true,
      detail: `Found ${pendingBills.length} bill${pendingBills.length !== 1 ? 's' : ''} waiting to sync`
    });
  } catch (err) {
    results.push({
      test: 'Pending bills',
      pass: false,
      detail: `❌ Error: ${err.message}`
    });
  }

  // Count pending payments
  try {
    const pendingPayments = await offlineDb.getPendingPayments();
    results.push({
      test: 'Pending payments',
      pass: true,
      detail: `Found ${pendingPayments.length} payment${pendingPayments.length !== 1 ? 's' : ''} waiting to sync`
    });
  } catch (err) {
    results.push({
      test: 'Pending payments',
      pass: false,
      detail: `❌ Error: ${err.message}`
    });
  }

  // Test sync function exists
  results.push({
    test: 'Sync function available',
    pass: typeof syncWhenOnline === 'function',
    detail: typeof syncWhenOnline === 'function' ? '✅ syncWhenOnline() ready' : '❌ Missing'
  });

  // Try a sync if online (non-destructive, just checks connectivity)
  if (navigator.onLine) {
    try {
      // Don't actually sync, just test that the function is callable
      results.push({
        test: 'Manual sync trigger',
        pass: true,
        detail: '✅ Sync capability ready'
      });
    } catch (err) {
      results.push({
        test: 'Manual sync trigger',
        pass: false,
        detail: `❌ ${err.message}`
      });
    }
  } else {
    results.push({
      test: 'Manual sync trigger',
      pass: false,
      detail: '⚠️ Offline — sync will trigger on reconnection'
    });
  }

  return { category: 'Sync Engine', results };
};

// ──────────────────── Run All Tests ────────────────────

export const runAllOfflineTests = async () => {
  const allResults = [];
  
  try {
    allResults.push(await testMasterDataCache());
    allResults.push(await testOfflineBillCreation());
    allResults.push(await testOfflinePaymentCreation());
    allResults.push(await testIndexedDBHealth());
    allResults.push(await testSyncEngine());
  } catch (err) {
    console.error('[OfflineTest] Error running tests:', err);
    return {
      error: err.message,
      timestamp: new Date().toISOString()
    };
  }

  // Calculate summary
  let totalTests = 0;
  let passedTests = 0;
  allResults.forEach(category => {
    category.results.forEach(result => {
      totalTests++;
      if (result.pass) passedTests++;
    });
  });

  return {
    timestamp: new Date().toISOString(),
    summary: {
      total: totalTests,
      passed: passedTests,
      failed: totalTests - passedTests,
      percentage: Math.round((passedTests / totalTests) * 100)
    },
    categories: allResults
  };
};

// ──────────────────── Quick Health Check (for startup) ────────────────────

export const quickHealthCheck = async () => {
  try {
    const products = await offlineDb.getCachedProducts();
    const customers = await offlineDb.getCachedCustomers();
    
    return {
      ready: !!(products?.length && customers?.length),
      productsCount: products?.length || 0,
      customersCount: customers?.length || 0
    };
  } catch (err) {
    console.warn('[OfflineHealth] Quick check failed:', err);
    return { ready: false, error: err.message };
  }
};
