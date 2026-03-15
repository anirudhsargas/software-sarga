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
        branchId = await getUserBranchId(req.user.id);
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
