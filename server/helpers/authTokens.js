// Access-token + refresh-token issuing shared by login, refresh and branch switching.
//
// Access token: short-lived JWT (ACCESS_TOKEN_TTL_SECONDS, default 1h) recorded in
//   sarga_user_sessions so it can be revoked.
// Refresh token: random opaque string, only its SHA-256 is stored. Rotated on every use;
//   presenting an already-rotated token revokes the whole family for that staff member
//   (token theft / replay detection).
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pool } = require('../database');
const { JWT_SECRET, normalizeRole } = require('../middleware/auth');

const ACCESS_TTL_SECONDS = parseInt(process.env.ACCESS_TOKEN_TTL_SECONDS || '3600', 10);
const REFRESH_TTL_DAYS_REMEMBER = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10);
const REFRESH_TTL_DAYS_SESSION = parseInt(process.env.REFRESH_TOKEN_SESSION_TTL_DAYS || '1', 10);

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

function permissionsForRole(role) {
    switch (role) {
        case 'Admin':
            return ['view_dashboard', 'manage_orders', 'manage_customers', 'manage_inventory', 'manage_staff', 'manage_expenses', 'manage_vendors', 'view_reports', 'manage_designs', 'manage_blog'];
        case 'Accountant':
            return ['view_dashboard', 'manage_orders', 'manage_inventory', 'manage_expenses', 'manage_vendors', 'view_reports'];
        case 'Front Office':
            return ['view_dashboard', 'manage_orders', 'manage_customers', 'manage_inventory'];
        case 'Designer':
            return ['view_dashboard', 'manage_designs', 'manage_blog'];
        default:
            return [];
    }
}

/** Sign an access token for a sarga_staff row and record it as a session. */
async function issueAccessToken(user, req) {
    const role = normalizeRole(user.role);
    const token = jwt.sign(
        {
            id: user.id,
            user_id: user.user_id,
            role,
            branch_id: user.branch_id,
            sub: String(user.id),
            branch: user.branch_id,
            permissions: permissionsForRole(role),
        },
        JWT_SECRET,
        { expiresIn: ACCESS_TTL_SECONDS }
    );
    try {
        await pool.query(
            `INSERT INTO sarga_user_sessions (user_id_internal, session_token, ip_address, user_agent, expires_at)
             VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
            [user.id, token, req?.ip || null, req?.headers?.['user-agent'] || null, ACCESS_TTL_SECONDS]
        );
    } catch (err) {
        console.error('Session recording failed (non-fatal):', err.message);
    }
    return { token, expiresIn: ACCESS_TTL_SECONDS };
}

/** Create a new refresh token. Returns the raw token (only time it exists in plain text). */
async function createRefreshToken(staffId, rememberMe, req, conn = pool) {
    const raw = crypto.randomBytes(48).toString('hex');
    const days = rememberMe ? REFRESH_TTL_DAYS_REMEMBER : REFRESH_TTL_DAYS_SESSION;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const [result] = await conn.query(
        `INSERT INTO sarga_refresh_tokens (staff_id, token_hash, remember_me, expires_at, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [staffId, sha256(raw), rememberMe ? 1 : 0, expiresAt, req?.ip || null, String(req?.headers?.['user-agent'] || '').slice(0, 512) || null]
    );
    return { refreshToken: raw, refreshExpiresAt: expiresAt.toISOString(), id: result.insertId };
}

/**
 * Exchange a refresh token for a new access token + rotated refresh token.
 * Throws an Error with .status = 401 when the token is not usable.
 */
async function rotateRefreshToken(raw, req) {
    const fail = (message) => Object.assign(new Error(message), { status: 401 });
    if (!raw || typeof raw !== 'string' || raw.length > 200) throw fail('Refresh token is required');

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[row]] = await conn.query(
            'SELECT * FROM sarga_refresh_tokens WHERE token_hash = ? FOR UPDATE',
            [sha256(raw)]
        );
        if (!row) {
            await conn.rollback();
            throw fail('Invalid refresh token');
        }
        if (row.revoked) {
            // Re-use of a rotated token → assume it was stolen; kill every refresh token for this user.
            if (row.replaced_by_id) {
                await conn.query(
                    'UPDATE sarga_refresh_tokens SET revoked = 1, revoked_at = NOW() WHERE staff_id = ? AND revoked = 0',
                    [row.staff_id]
                );
                await conn.commit();
                console.warn(`[Auth] Refresh token reuse detected for staff #${row.staff_id}; all refresh tokens revoked`);
            } else {
                await conn.rollback();
            }
            throw fail('Refresh token has been revoked');
        }
        if (new Date(row.expires_at).getTime() <= Date.now()) {
            await conn.rollback();
            throw fail('Refresh token has expired');
        }

        const [[user]] = await conn.query(
            `SELECT s.id, s.user_id, s.name, s.role, s.branch_id, s.is_first_login, s.image_url, s.settings,
                    b.short_name AS branch_short_name
             FROM sarga_staff s LEFT JOIN sarga_branches b ON b.id = s.branch_id
             WHERE s.id = ? LIMIT 1`,
            [row.staff_id]
        );
        if (!user) {
            await conn.query('UPDATE sarga_refresh_tokens SET revoked = 1, revoked_at = NOW() WHERE id = ?', [row.id]);
            await conn.commit();
            throw fail('Account no longer exists');
        }

        const next = await createRefreshToken(user.id, !!row.remember_me, req, conn);
        await conn.query(
            'UPDATE sarga_refresh_tokens SET revoked = 1, revoked_at = NOW(), replaced_by_id = ? WHERE id = ?',
            [next.id, row.id]
        );
        await conn.commit();

        const access = await issueAccessToken(user, req);
        return { user, ...access, refreshToken: next.refreshToken, refreshExpiresAt: next.refreshExpiresAt };
    } catch (err) {
        try { await conn.rollback(); } catch (_) { /* already finished */ }
        throw err;
    } finally {
        conn.release();
    }
}

async function revokeRefreshToken(raw) {
    if (!raw || typeof raw !== 'string') return;
    await pool.query(
        'UPDATE sarga_refresh_tokens SET revoked = 1, revoked_at = NOW() WHERE token_hash = ? AND revoked = 0',
        [sha256(raw)]
    );
}

async function revokeAllUserTokens(staffId) {
    try {
        await pool.query('UPDATE sarga_refresh_tokens SET revoked = 1, revoked_at = NOW() WHERE staff_id = ? AND revoked = 0', [staffId]);
    } catch (err) {
        console.error('Refresh token revocation failed (non-fatal):', err.message);
    }
    try {
        await pool.query('UPDATE sarga_user_sessions SET is_revoked = 1 WHERE user_id_internal = ?', [staffId]);
    } catch (err) {
        console.error('Session revocation failed (non-fatal):', err.message);
    }
}

/** Shared password policy. Returns an error message, or null if the password is acceptable. */
function passwordPolicyError(pw) {
    const value = String(pw || '');
    if (value.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter (A-Z)';
    if (!/[a-z]/.test(value)) return 'Password must contain at least one lowercase letter (a-z)';
    if (!/[0-9]/.test(value)) return 'Password must contain at least one number (0-9)';
    if (!/[^A-Za-z0-9]/.test(value)) return 'Password must contain at least one special character';
    return null;
}

module.exports = {
    ACCESS_TTL_SECONDS,
    sha256,
    permissionsForRole,
    issueAccessToken,
    createRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
    revokeAllUserTokens,
    passwordPolicyError,
};
