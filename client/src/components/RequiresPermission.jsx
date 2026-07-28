import React from 'react';
import useAuth from '../hooks/useAuth';
import PermissionDeniedState from './PermissionDeniedState';

const normalizeRole = (role) => {
  if (!role) return '';
  const map = { 'admin': 'Admin', 'front office': 'Front Office', 'designer': 'Designer', 'printer': 'Printer', 'accountant': 'Accountant', 'other staff': 'Other Staff' };
  return map[role.toLowerCase().trim()] || role;
};

const RequiresPermission = ({
  children,
  roles,
  permission,
  fallback,
  size,
  compact,
  title,
  message,
  hideContent,
}) => {
  const { user } = useAuth();
  const userRole = normalizeRole(user?.role);

  const hasRole = !roles || roles.some(r => normalizeRole(r) === userRole);
  const hasPermission = !permission || false;

  if (!hasRole || !hasPermission) {
    if (fallback) return fallback;
    if (hideContent) return null;
    return (
      <PermissionDeniedState
        title={title}
        message={message}
        requiredRole={roles?.[0]}
        requiredPermission={permission}
        size={size}
        compact={compact}
      />
    );
  }

  return children;
};

export default RequiresPermission;
