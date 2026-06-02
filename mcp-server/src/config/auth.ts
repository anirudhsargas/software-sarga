/**
 * Sarga Prints MCP Server — Authentication & Authorization
 *
 * Implements JWT validation using the dual-secret rotation pattern
 * from the existing backend. Used only by the HTTP transport.
 */
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';
import { READ_ROLES, WRITE_ROLES, ADMIN_ROLES, StaffRole } from './constants.js';

interface JwtPayload {
  userId: number;
  role: string;
  branch_id?: number | null;
  iat: number;
  exp: number;
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_SECRET_PREVIOUS = process.env.JWT_SECRET_PREVIOUS;

if (!JWT_SECRET) {
  logger.warn('JWT_SECRET is not set! Authentication will fail.');
}

/**
 * Verify token trying multiple secrets (for key rotation)
 */
function verifyWithAnySecret(token: string): JwtPayload {
  const secrets = [JWT_SECRET, JWT_SECRET_PREVIOUS].filter(Boolean) as string[];

  if (secrets.length === 0) {
    throw new Error('No JWT secrets configured');
  }

  let lastError: unknown;
  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret) as JwtPayload;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

/**
 * Express middleware to authenticate MCP requests via JWT
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Authentication token required' });
    return;
  }

  try {
    const payload = verifyWithAnySecret(token);
    (req as any).user = payload;
    next();
  } catch (err) {
    logger.error('JWT Verification failed:', err);
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Determine if a role has permission to execute a specific tool
 */
export function canExecuteTool(toolName: string, role: string): boolean {
  const r = role as StaffRole;

  // 1. System tools require Admin
  if (toolName.startsWith('get_system_health') || toolName.startsWith('get_audit_logs')) {
    return ADMIN_ROLES.includes(r);
  }

  // 2. Write/Create/Update tools require Write roles
  if (toolName.startsWith('create_') || toolName.startsWith('update_') ||
      toolName.startsWith('record_') || toolName.startsWith('allocate_') ||
      toolName.startsWith('reconcile_')) {
    return WRITE_ROLES.includes(r);
  }

  // 3. Website inquiry creation is public/open
  if (toolName === 'create_website_inquiry') {
    return true;
  }

  // 4. Read tools require any valid role
  return READ_ROLES.includes(r);
}
