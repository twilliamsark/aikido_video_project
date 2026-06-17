/**
 * Seeds a teacher account for local development.
 *
 * Creates the account through better-auth so the password is hashed the same way
 * as a normal sign-up. Idempotent: if the email already exists it does nothing.
 *
 * Credentials are configurable via env (with dev-friendly defaults):
 *   ADMIN_EMAIL    (default: admin@dojo.test)
 *   ADMIN_PASSWORD (default: changeme123)
 *   ADMIN_NAME     (default: Admin Teacher)
 *
 * Usage: bun run db:seed
 */
import { eq } from 'drizzle-orm';
import { auth } from '../auth';
import { db } from './client';
import { user } from './auth-schema';

const email = process.env['ADMIN_EMAIL'] ?? 'admin@dojo.test';
const password = process.env['ADMIN_PASSWORD'] ?? 'changeme123';
const name = process.env['ADMIN_NAME'] ?? 'Admin Teacher';

const existing = db.select({ id: user.id }).from(user).where(eq(user.email, email)).get();

if (existing) {
  console.log(`Teacher already exists: ${email} (no changes made)`);
} else {
  await auth.api.signUpEmail({ body: { name, email, password } });
  console.log('Seeded teacher account:');
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
}
