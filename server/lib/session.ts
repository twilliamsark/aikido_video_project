/**
 * Session helpers built on better-auth. Authorization is enforced server-side on
 * every mutating/admin endpoint (TECHNICAL_SPEC.md §9).
 */
import { auth } from '../auth';
import { HttpError } from './http';

export interface Teacher {
  id: string;
  email: string;
  name: string;
}

/** Returns the authenticated user, or null if there is no valid session. */
export async function getCurrentUser(req: Request): Promise<Teacher | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

/** Returns the authenticated teacher or throws 401. Use to gate teacher routes. */
export async function requireTeacher(req: Request): Promise<Teacher> {
  const user = await getCurrentUser(req);
  if (!user) {
    throw new HttpError(401, 'unauthorized', 'Authentication required');
  }
  return user;
}
