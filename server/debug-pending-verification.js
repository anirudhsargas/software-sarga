const { pool } = require('./database');

const CUSTOMER_PAYMENT_LIST_COLUMNS = [
    'id',
    'customer_id',
    'customer_name',
    'customer_mobile',
    'bill_amount',
    'total_amount',
    'net_amount',
    'sgst_amount',
    'cgst_amount',
    'advance_paid',
    'balance_amount',
    'payment_method',
    'cash_amount',
    'upi_amount',
    'branch_id',
    'reference_number',
    'description',
    'discount_percent',
    'discount_amount',
    'payment_date',
    'created_at',
    'verification_status',
    'verified_by',
    'verified_at',
    'verification_note'
].join(', ');

async function test() {
    try {
        console.log('CUSTOMER_PAYMENT_LIST_COLUMNS:', CUSTOMER_PAYMENT_LIST_COLUMNS);
        
        // Simulate the query construction from the endpoint
        let whereClauses = [];
        const params = [];
        
        whereClauses.push(`payment_method IN ('UPI', 'Cheque', 'Account Transfer', 'Both')`);
        whereClauses.push(`(verification_status = 'Pending' OR verification_status IS NULL)`);
        
        const whereSection = whereClauses.length > 0 ? ' WHERE ' + whereClauses.join(' AND ') : '';
        const baseFrom = `FROM sarga_customer_payments ${whereSection}`;
        
        const countQuery = `SELECT COUNT(*) as total ${baseFrom}`;
        const selectQuery = `SELECT ${CUSTOMER_PAYMENT_LIST_COLUMNS} ${baseFrom} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        
        console.log('\nCount Query:');
        console.log(countQuery);
        console.log('Params:', params);
        
        console.log('\nSelect Query:');
        console.log(selectQuery);
        console.log('Params (with limit/offset):', [...params, 20, 0]);
        
        console.log('\nTesting count query...');
        const [[result1]] = await pool.query(countQuery, params);
        console.log('Count result:', result1);
        
        console.log('\nTesting select query...');
        const [rows] = await pool.query(selectQuery, [...params, 20, 0]);
        console.log('Select result count:', rows.length);
        console.log('First row:', rows[0]);
        
        console.log('\n✅ Query successful!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error('Stack:', err.stack);
        process.exit(1);
    }
}

test();
