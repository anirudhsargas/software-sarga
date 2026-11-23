const { pool } = require('../database');
const { getUserBranchId } = require('../helpers');

const PRIVILEGED_ROLES = new Set(['Admin', 'Accountant']);

function isPrivilegedRole(role) {
    return PRIVILEGED_ROLES.has(role);
}

async function branchFilter(req, options = {}) {
    const {
        column = 'branch_id',
        queryKey = 'branch_id',
        allowPrivilegedQuery = true,
        nullableForPrivileged = true,
    } = options;

    const role = req?.user?.role;
    const isPrivileged = isPrivilegedRole(role);

    let branchId = null;
    if (isPrivileged) {
        if (allowPrivilegedQuery && req?.query?.[queryKey]) {
            branchId = req.query[queryKey];
        } else if (!nullableForPrivileged) {
            branchId = req?.user?.branch_id || null;
        }
    } else {
        // Check if user has multi-branch assignments
        try {
            const [assignments] = await pool.query(
                'SELECT branch_id FROM staff_branch_assignments WHERE staff_id = ?',
                [req.user.id]
            );
            if (assignments.length > 0) {
                // Use the branch_id from query param if it's in their assignments
                if (req?.query?.[queryKey]) {
                    const requestedBranchId = req.query[queryKey];
                    const hasAccess = assignments.some(a => String(a.branch_id) === String(requestedBranchId));
                    if (hasAccess) {
                        branchId = requestedBranchId;
                    } else {
                        branchId = getAssignedDefaultBranch(assignments, req.user.branch_id);
                    }
                } else {
                    branchId = getAssignedDefaultBranch(assignments, req.user.branch_id);
                }
            } else {
                branchId = await getUserBranchId(req.user.id);
            }
        } catch {
            branchId = await getUserBranchId(req.user.id);
        }
    }

    const hasBranch = branchId !== null && branchId !== undefined && branchId !== '';
    return {
        branchId: hasBranch ? branchId : null,
        isPrivileged,
        clause: hasBranch ? ` AND ${column} = ?` : '',
        params: hasBranch ? [branchId] : [],
    };
}

function getAssignedDefaultBranch(assignments, activeBranchId) {
    const active = assignments.find(a => String(a.branch_id) === String(activeBranchId));
    if (active) return active.branch_id;
    const primary = assignments.find(a => a.is_primary);
    return primary ? primary.branch_id : assignments[0].branch_id;
}

/**
 * Resolve the branch a new record should be written to, honouring a branch the
 * client explicitly selected (e.g. the branch picker on the billing form).
 * - Admin/Accountant: the requested branch is used if it exists.
 * - Other staff: the requested branch is used only if it is one of their
 *   assigned branches; otherwise they fall back to their own branch.
 */
async function resolveWriteBranch(req, requestedBranchId, db = pool) {
    const requested = Number(requestedBranchId);
    const hasRequested = Number.isInteger(requested) && requested > 0;

    if (hasRequested && isPrivilegedRole(req?.user?.role)) {
        const [rows] = await db.query('SELECT 1 FROM sarga_branches WHERE id = ? LIMIT 1', [requested]);
        if (rows.length > 0) return requested;
    }

    const scopedReq = hasRequested ? { ...req, query: { ...(req.query || {}), branch_id: String(requested) } } : req;
    const { branchId } = await branchFilter(scopedReq, { allowPrivilegedQuery: false });
    return branchId;
}

module.exports = {
    branchFilter,
    isPrivilegedRole,
    resolveWriteBranch,
};
