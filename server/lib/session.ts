/**
 * Session helpers built on better-auth. Authorization is enforced server-side on
 * every mutating/admin endpoint (TECHNICAL_SPEC.md §9).
 */
import { auth } from '../auth';
import { env } from '../env';
import { HttpError } from './http';

export interface Teacher {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

/** True if the email is on the configured admin allowlist (TECHNICAL_SPEC.md §9). */
export function isAdminEmail(email: string): boolean {
  return env.adminEmails.includes(email.toLowerCase());
}

/** Returns the authenticated user, or null if there is no valid session. */
export async function getCurrentUser(req: Request): Promise<Teacher | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    isAdmin: isAdminEmail(session.user.email),
  };
}

/** Returns the authenticated teacher or throws 401. Use to gate teacher routes. */
export async function requireTeacher(req: Request): Promise<Teacher> {
  const user = await getCurrentUser(req);
  if (!user) {
    throw new HttpError(401, 'unauthorized', 'Authentication required');
  }
  return user;
}

/** Returns the authenticated admin or throws 401/403. Gates admin-only routes. */
export async function requireAdmin(req: Request): Promise<Teacher> {
  const user = await requireTeacher(req);
  if (!user.isAdmin) {
    throw new HttpError(403, 'forbidden', 'Admin privileges required');
  }
  return user;
}
