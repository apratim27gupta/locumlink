import * as bcrypt from 'bcrypt';

/** Lower cost than passwords — OTPs are short-lived single-use codes. */
const OTP_BCRYPT_ROUNDS = 10;

export async function hashOtpCode(code: string): Promise<string> {
  return bcrypt.hash(code, OTP_BCRYPT_ROUNDS);
}

/** Supports legacy plaintext rows until they expire (~10 min after deploy). */
export async function verifyOtpCode(
  code: string,
  stored: string,
): Promise<boolean> {
  if (!code || !stored) return false;
  if (stored.startsWith('$2')) {
    return bcrypt.compare(code, stored);
  }
  return stored === code;
}
