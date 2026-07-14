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
                        // Default to primary branch
                        const primary = assignments.find(a => a.is_primary);
                        branchId = primary ? primary.branch_id : assignments[0].branch_id;
                    }
                } else {
                    const primary = assignments.find(a => a.is_primary);
                    branchId = primary ? primary.branch_id : assignments[0].branch_id;
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

module.exports = {
    branchFilter,
    isPrivilegedRole,
};
