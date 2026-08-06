/**
 * One password rule for the whole product.
 *
 * Sign-up enforced 8–20 characters with a letter, a number and a symbol, while every other path
 * inherited Supabase's 6-character default — so the rule a customer met at sign-up was not the
 * rule that applied when they later set or changed a password. This is that rule, in one place.
 */
import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 20;

/** Letter + digit + symbol, within the length bounds. */
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^\dA-Za-z\s]).{8,20}$/u;

/** Shown wherever a password is chosen, so the requirement reads the same everywhere. */
export const PASSWORD_REQUIREMENT_MESSAGE =
  'Use 8–20 characters with a letter, number, and special character.';

export function passwordMeetsPolicy(password: string): boolean {
  return PASSWORD_PATTERN.test(password);
}

/** Schema for a newly chosen password. Sign-in keeps its own looser rule for existing accounts. */
export const newPasswordSchema = z
  .string()
  .max(200)
  .refine(passwordMeetsPolicy, PASSWORD_REQUIREMENT_MESSAGE);
