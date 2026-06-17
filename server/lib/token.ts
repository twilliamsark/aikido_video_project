/**
 * URL-safe random share tokens (TECHNICAL_SPEC.md §5.2, §9).
 *
 * Tokens are cryptographically random and unguessable so that inactive/unknown
 * tokens can't be enumerated. Base62 keeps them URL-safe with no escaping.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function randomToken(length = 22): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}
