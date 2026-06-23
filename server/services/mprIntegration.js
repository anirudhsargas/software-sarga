/**
 * MPR (Multifunction Printer) Integration Service
 * Fetches meter counts from printers via SNMP or HTTP (for Canon, etc).
 *
 * Vendor detection via sysDescr (1.3.6.1.2.1.1.1.0):
 *   - Kyocera  → SNMP, sum 1.3.6.1.4.1.1347.42.2.5.1.1.1.1 + 1.3.6.1.4.1.1347.42.2.5.1.1.2.1
 *   - Canon    → HTTP to http://{ip}:8000/rps/dcounter.cgi?CorePGTAG=14
 *   - Others   → SNMP standard prtMarkerLifeCount 1.3.6.1.2.1.43.10.2.1.4.1.1
 */

const snmp = require('net-snmp');
const http = require('http');
const crypto = require('crypto');

const OID_SYS_DESCR   = '1.3.6.1.2.1.1.1.0';
const OID_STANDARD    = '1.3.6.1.2.1.43.10.2.1.4.1.1';
const OID_KY_C1       = '1.3.6.1.4.1.1347.42.2.5.1.1.1.1';
const OID_KY_C2       = '1.3.6.1.4.1.1347.42.2.5.1.1.2.1';

function snmpGet(session, oids) {
    return new Promise((resolve, reject) => {
        session.get(oids, (err, vbs) => { if (err) return reject(err); resolve(vbs); });
    });
}

function canonHttpGet(hostname, port, path, cookieStr) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname, port, method: 'GET', path, timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': cookieStr || '' }
        }, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: d }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

function canonHttpPost(hostname, port, path, body, cookieStr) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname, port, method: 'POST', path, timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
                'Cookie': cookieStr || '',
            }
        }, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: d }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(body);
        req.end();
    });
}

function extractCookies(headers) {
    return (headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
}

function extractField(html, fieldName) {
    // Handle spaces in attributes like: name = "FIELD"
    const norm = html.replace(/\s*=\s*"/g, '="');
    const m = norm.match(new RegExp('name="' + fieldName + '"[^>]*value="([^"]*)"', 'i'))
           || norm.match(new RegExp('value="([^"]*)"[^>]*name="' + fieldName + '"', 'i'));
    return m ? m[1] : '';
}

function extractPK(html) {
    const m = html.match(/(-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----)/);
    if (!m) return null;
    // Strip trailing whitespace from each line (Canon HTML has trailing spaces that corrupt base64)
    return m[1].split('\n').map(line => line.trimEnd()).join('\n').trim();
}

function extractDomain(html) {
    // Get the first option value from the domainname select
    const m = html.match(/<option[^>]+value\s*=\s*["']([^"']*)["'][^>]*>/i);
    return m ? m[1] : 'localhost';
}

function canonRsaEncrypt(password, challenge, pkPem) {
    const input = Buffer.from(password + challenge, 'utf8');
    const encrypted = crypto.publicEncrypt({ key: pkPem, padding: crypto.constants.RSA_PKCS1_PADDING }, input);
    return encrypted.toString('base64');
}

function isCanonLoginPage(html) {
    return html.includes('User Authentication') || html.includes('CHALLENGE');
}

function detectCanonModelFromHtml(html) {
    const m = html.match(/<title>[^<]*(iR[^<]*|imageRUNNER[^<]*|LBP[^<]*)</i);
    return m ? m[1].trim() : 'Canon';
}

function parseCanonMeterPage(html) {
    // Canon dcounter.cgi page: look for large numbers in value= attributes or table cells
    const valueMatches = html.match(/value\s*=\s*"(\d{4,})"/gi) || [];
    for (const m of valueMatches) {
        const n = parseInt(m.replace(/[^\d]/g, ''), 10);
        if (n > 100 && n < 100000000) return n;
    }
    // Look for large number in table cells/spans
    const cellMatches = html.match(/>(\d{5,})</g) || [];
    const candidates = cellMatches.map(m => parseInt(m.replace(/[^\d]/g, ''), 10)).filter(n => n > 100 && n < 100000000);
    if (candidates.length) return Math.max(...candidates);
    return null;
}

async function fetchCanonMeterCounts(ipAddress, _timeoutMs = 6000, username = null, password = null) {
    const ts = Date.now();
    const meterPath = `/rps/dcounter.cgi?CorePGTAG=14&Dummy=${ts}`;
    const port = 8000;

    try {
        // Step 1: GET the meter page (will redirect to login if auth required)
        const res1 = await canonHttpGet(ipAddress, port, meterPath, '');
        const cookies1 = extractCookies(res1.headers);

        // If not a login page, parse the meter directly
        if (res1.status === 200 && !isCanonLoginPage(res1.data)) {
            const count = parseCanonMeterPage(res1.data);
            return {
                total_prints: count,
                vendor: 'Canon',
                black_prints: null, color_prints: null,
                source: 'http',
                fetched_at: new Date(),
                error: count === null ? 'Connected but could not parse meter value' : undefined
            };
        }

        // It's a login page — check if we have credentials
        const vendorName = res1.data ? detectCanonModelFromHtml(res1.data) : 'Canon';

        if (!username || !password) {
            return {
                total_prints: null,
                vendor: vendorName,
                black_prints: null, color_prints: null,
                error: `Canon printer requires login. Open the machine form, check "Printer requires login", and enter your Canon web UI username and password.`,
                fetched_at: new Date(),
            };
        }

        // Step 2: Extract challenge + PK, do RSA login
        const challenge = extractField(res1.data, 'CHALLENGE');
        const pk = extractPK(res1.data);

        if (!challenge || !pk) {
            return { total_prints: null, vendor: vendorName, error: 'Could not extract Canon login fields', fetched_at: new Date() };
        }

        let encPassword;
        try {
            encPassword = canonRsaEncrypt(password, challenge, pk);
        } catch (e) {
            return { total_prints: null, vendor: vendorName, error: `Canon RSA error: ${e.message}`, fetched_at: new Date() };
        }

        // Extract login destination domain ("localhost" for local auth, or AD domain)
        const domain = extractDomain(res1.data);

        const formBody = [
            'USERNAME=' + encodeURIComponent(username),
            'PASSWORD=' + encodeURIComponent(encPassword),
            'PASSWORD_T=',
            'CHALLENGE=' + encodeURIComponent(challenge),
            'URI=' + encodeURIComponent(meterPath),
            'GUEST=',
            'DOMAIN=' + encodeURIComponent(domain),
            'admin=', 'invalidCH='
        ].join('&');

        // Step 3: POST login
        const res2 = await canonHttpPost(ipAddress, port, '/login', formBody, cookies1);
        const cookies2 = (extractCookies(res2.headers) || '') + (cookies1 ? '; ' + cookies1 : '');
        const redirectTo = res2.headers['location'] || meterPath;

        // Step 4: Follow redirect / re-fetch meter page
        const res3 = await canonHttpGet(ipAddress, port, redirectTo, cookies2);

        if (isCanonLoginPage(res3.data)) {
            return {
                total_prints: null,
                vendor: vendorName,
                error: 'Canon login failed — wrong username or password. Please update the credentials in the machine settings.',
                fetched_at: new Date(),
            };
        }

        const count = parseCanonMeterPage(res3.data);
        return {
            total_prints: count,
            vendor: vendorName,
            black_prints: null, color_prints: null,
            source: 'http',
            fetched_at: new Date(),
            error: count === null ? 'Logged in but could not parse meter value from Canon response' : undefined
        };

    } catch (err) {
        return {
            total_prints: null,
            vendor: 'Canon',
            error: `Canon connection error: ${err.message}`,
            fetched_at: new Date(),
        };
    }
}

function mergeCookies(newCookies, existingCookies) { // eslint-disable-line no-unused-vars
    const map = new Map();
    const parse = str => (str || '').split(';').map(s => s.trim()).filter(Boolean).forEach(pair => {
        const i = pair.indexOf('=');
        if (i > 0) map.set(pair.substring(0, i).trim(), pair.substring(i + 1).trim());
    });
    parse(existingCookies);
    parse(newCookies);
    return [...map.entries()].map(([k, v]) => k + '=' + v).join('; ');
}

function parseWriteValueCounts(html) { // eslint-disable-line no-unused-vars
    // Canon dcounter.cgi "Check Counter" page embeds counts as:
    //   write_value("101", 241946)  -- Type 101 = Total 1 (grand total)
    //   write_value("201", 56142)   -- Type 201 = Copy or Print sub-total
    // Only 3-digit type codes (length <= 3) get rendered; the second arg is the count.
    const counts = {};
    for (const m of html.matchAll(/write_value\s*\(\s*["'](\d{1,3})["']\s*,\s*(\d+)\s*\)/g)) {
        counts[m[1]] = parseInt(m[2], 10);
    }
    // 101 = "Total 1" (grand total — most reliable)
    if (counts['101'] !== undefined) return counts['101'];
    // Fallback: largest value across any short type code
    const vals = Object.values(counts).filter(v => !isNaN(v));
    return vals.length ? Math.max(...vals) : null;
}

/* DUPLICATE FUNCTION - second definition of fetchCanonMeterCounts removed to fix parsing error.
async function fetchCanonMeterCounts(ipAddress, timeoutMs = 6000, username = null, password = null) {
    const port = 8000;
    const ts = Date.now();
    const meterPath = `/rps/dcounter.cgi?CorePGTAG=14&Dummy=${ts}`;
        const res1 = await canonHttpGet(ipAddress, port, meterPath, '');
        let cookies = extractCookies(res1.headers);

        // No auth needed — parse directly
        if (res1.status === 200 && !isCanonLoginPage(res1.data) && !res1.data.includes('Cannot open')) {
            const count = parseWriteValueCounts(res1.data) || parseCanonMeterPage(res1.data);
            return {
                total_prints: count,
                vendor: detectCanonModelFromHtml(res1.data) || 'Canon',
                black_prints: null, color_prints: null,
                source: 'http',
                fetched_at: new Date(),
                error: count === null ? 'Connected but could not parse meter value' : undefined,
            };
        }

        const vendorName = detectCanonModelFromHtml(res1.data) || 'Canon';

        if (!username || !password) {
            return {
                total_prints: null,
                vendor: vendorName,
                black_prints: null, color_prints: null,
                error: `Canon printer requires login. Open the machine form, check "Printer requires login", and enter your Canon web UI username and password.`,
                fetched_at: new Date(),
            };
        }

        // Step 2: RSA login
        const challenge = extractField(res1.data, 'CHALLENGE');
        const pk = extractPK(res1.data);
        if (!challenge || !pk) {
            return { total_prints: null, vendor: vendorName, error: 'Could not extract Canon login fields', fetched_at: new Date() };
        }
        let encPassword;
        try { encPassword = canonRsaEncrypt(password, challenge, pk); }
        catch (e) { return { total_prints: null, vendor: vendorName, error: `Canon RSA error: ${e.message}`, fetched_at: new Date() }; }

        const domain = extractDomain(res1.data);
        const formBody = [
            'USERNAME=' + encodeURIComponent(username),
            'PASSWORD=' + encodeURIComponent(encPassword),
            'PASSWORD_T=',
            'CHALLENGE=' + encodeURIComponent(challenge),
            'URI=' + encodeURIComponent(meterPath),
            'GUEST=',
            'DOMAIN=' + encodeURIComponent(domain),
            'admin=', 'invalidCH='
        ].join('&');

        const res2 = await canonHttpPost(ipAddress, port, '/login', formBody, cookies);
        cookies = extractCookies(res2.headers);

        if (res2.status !== 302 && isCanonLoginPage(res2.data || '')) {
            return {
                total_prints: null, vendor: vendorName,
                error: 'Canon login failed — wrong username or password. Please update the credentials in the machine settings.',
                fetched_at: new Date(),
            };
        }

        const rPortal = await canonHttpGet(ipAddress, port, '/', cookies);
        cookies = mergeCookies(extractCookies(rPortal.headers), cookies);

        const ts2 = Date.now();
        const rNav = await canonHttpGet(ipAddress, port, `/rps/nativetop.cgi?RUIPNxBundle=default&CorePGTAG=14&Dummy=${ts2}`, cookies);
        cookies = mergeCookies(extractCookies(rNav.headers), cookies);

        const ts3 = Date.now();
        const rCounter = await canonHttpGet(ipAddress, port, `/rps/dcounter.cgi?CorePGTAG=14&Dummy=${ts3}`, cookies);

        if (isCanonLoginPage(rCounter.data)) {
            return {
                total_prints: null, vendor: vendorName,
                error: 'Canon login failed — wrong username or password. Please update the credentials in the machine settings.',
                fetched_at: new Date(),
            };
        }
        if (rCounter.data.includes('Cannot open') || rCounter.data.includes('Cannot display')) {
            return { total_prints: null, vendor: vendorName, error: 'Canon denied access to counter page after login', fetched_at: new Date() };
        }

        const count = parseWriteValueCounts(rCounter.data);
        return {
            total_prints: count,
            vendor: vendorName,
            black_prints: null, color_prints: null,
            source: 'http',
            fetched_at: new Date(),
            error: count === null ? 'Logged in but could not parse Canon counter value' : undefined,
        };

    } catch (err) {
        return {
            total_prints: null,
            vendor: 'Canon',
            error: `Canon connection error: ${err.message}`,
            fetched_at: new Date(),
        };
    }
}
*/

async function fetchBizhubMeterCounts(ipAddress, timeoutMs = 6000, community = 'public', username = null, password = null) {
    // First: try to detect vendor via SNMP
    const session = snmp.createSession(ipAddress, community, {
        version: snmp.Version2c,
        timeout: Math.min(timeoutMs, 3000),
        retries: 0,
    });

    try {
        // Step 1: Try to identify vendor via SNMP sysDescr
        const descVbs = await snmpGet(session, [OID_SYS_DESCR]);
        const sysDescr = (!snmp.isVarbindError(descVbs[0]))
            ? descVbs[0].value.toString()
            : '';
        
        const isCanon = /canon/i.test(sysDescr);
        const isKyocera = /kyocera/i.test(sysDescr);

        // If Canon, use HTTP method instead
        if (isCanon) {
            session.close();
            return await fetchCanonMeterCounts(ipAddress, timeoutMs, username, password);
        }

        let total_prints = null;
        let vendor = sysDescr || 'Unknown';

        if (isKyocera) {
            // Step 2a: Kyocera — sum two counter buckets that match the web UI "Total Printed Pages"
            const vbs = await snmpGet(session, [OID_KY_C1, OID_KY_C2]);
            const v1 = !snmp.isVarbindError(vbs[0]) ? parseInt(vbs[0].value.toString(), 10) : 0;
            const v2 = !snmp.isVarbindError(vbs[1]) ? parseInt(vbs[1].value.toString(), 10) : 0;
            if (!isNaN(v1) && !isNaN(v2)) {
                total_prints = v1 + v2;
            }
        } else {
            // Step 2b: Standard printer MIB (works for Konica Minolta, HP, etc.)
            const vbs = await snmpGet(session, [OID_STANDARD]);
            const vb = vbs[0];
            if (!snmp.isVarbindError(vb)) {
                const v = parseInt(vb.value.toString(), 10);
                if (!isNaN(v)) total_prints = v;
            }
        }

        session.close();
        return {
            total_prints,
            black_prints: null,
            color_prints: null,
            vendor,
            source: 'snmp',
            fetched_at: new Date(),
        };
    } catch (err) {
        session.close();
        
        // If SNMP fails, try Canon HTTP as fallback
        const fallbackResult = await fetchCanonMeterCounts(ipAddress, timeoutMs, username, password);
        if (fallbackResult.total_prints !== null) {
            return fallbackResult;
        }
        
        return {
            total_prints: null,
            black_prints: null,
            color_prints: null,
            error: `SNMP error: ${err.message}. Ensure printer is reachable and SNMP is enabled (community: public).`,
            fetched_at: new Date(),
        };
    }
}

function compareCounterData(manualEntry, actualMeterData, yesterdayClosingCount = null) {
    const comparison = {
        manual_entry: manualEntry,
        actual_count: actualMeterData ? actualMeterData.total_prints : null,
        has_mismatch: false,
        mismatch_details: null,
        daily_change: null,
        daily_change_expected: null,
    };
    if (!actualMeterData || actualMeterData.total_prints === null) {
        comparison.mismatch_details = actualMeterData ? actualMeterData.error : 'Could not fetch meter count';
        comparison.has_mismatch = true;
        return comparison;
    }
    const actual = actualMeterData.total_prints;
    const variance = Math.abs(manualEntry - actual);
    const variancePercent = actual > 0 ? ((variance / actual) * 100).toFixed(2) : '0.00';
    if (variance > 0) {
        comparison.has_mismatch = true;
        comparison.mismatch_details = {
            expected_count: manualEntry, actual_count: actual, variance,
            variance_percent: variancePercent,
            machine_ahead: actual > manualEntry,
            message: actual > manualEntry
                ? `Machine count is ${variance} higher than entered`
                : `Entered count is ${variance} higher than machine`,
        };
    }
    if (yesterdayClosingCount !== null) {
        comparison.daily_change = actual - yesterdayClosingCount;
        comparison.daily_change_expected = manualEntry - yesterdayClosingCount;
        if (comparison.daily_change !== comparison.daily_change_expected) {
            comparison.has_mismatch = true;
            if (!comparison.mismatch_details) comparison.mismatch_details = {};
            comparison.mismatch_details.daily_change_mismatch = {
                daily_change_actual: comparison.daily_change,
                daily_change_expected: comparison.daily_change_expected,
                difference: Math.abs(comparison.daily_change - comparison.daily_change_expected),
            };
        }
    }
    return comparison;
}

module.exports = { fetchBizhubMeterCounts, compareCounterData };
