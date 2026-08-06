/**
 * A0/A1/A2 — the password rule is one rule, and the flows that need a real database say so.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
  PASSWORD_REQUIREMENT_MESSAGE,
  newPasswordSchema,
  passwordMeetsPolicy,
} from '@/lib/auth/password-policy';

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, 'utf8');

describe('A1 — one password rule, used everywhere a password is chosen', () => {
  test('the rule accepts a compliant password and refuses the near misses', () => {
    assert.equal(passwordMeetsPolicy('Clinic1!pass'), true);
    for (const weak of [
      'short1!',           // under 8
      'a'.repeat(21) + '1!', // over 20
      'nodigits!!',        // no digit
      'nosymbol123',       // no symbol
      '12345678!!',        // no letter
    ]) {
      assert.equal(passwordMeetsPolicy(weak), false, `${weak} must be refused`);
    }
    assert.equal(newPasswordSchema.safeParse('Clinic1!pass').success, true);
    assert.equal(newPasswordSchema.safeParse('short1!').success, false);
  });

  test('sign-up and the welcome screen defer to the shared rule instead of repeating it', () => {
    const emailLogin = read('src/app/api/auth/email-login/route.ts');
    assert.match(emailLogin, /passwordMeetsPolicy\(value\.password\)/u);
    // The literal pattern must not survive in a second place, or the two can drift apart again.
    assert.doesNotMatch(emailLogin, /\(\?=\.\*\[A-Za-z\]\)/u, 'the regex is duplicated');
    const setPassword = read('src/app/api/auth/set-password/route.ts');
    assert.match(setPassword, /newPasswordSchema/u);
    assert.doesNotMatch(setPassword, /\(\?=\.\*\[A-Za-z\]\)/u);
    const form = read('src/app/(auth)/welcome/WelcomePasswordForm.tsx');
    assert.match(form, /PASSWORD_REQUIREMENT_MESSAGE/u, 'the screen states the shared rule');
    assert.ok(PASSWORD_REQUIREMENT_MESSAGE.includes('8–20'));
  });
});

describe('A1/A2 — mock mode refuses rather than simulating a password store', () => {
  test('the password routes fail closed instead of reporting a fake success', () => {
    for (const path of [
      'src/app/api/auth/set-password/route.ts',
      'src/app/api/auth/forgot-password/route.ts',
    ]) {
      const source = read(path);
      assert.match(source, /if \(isMockMode\(\)\)/u, `${path} must check mock mode`);
      assert.match(source, /REAL_MODE_ONLY/u, `${path} must refuse in mock`);
    }
  });

  test('/welcome sends a mock session to its role home instead of a password form', () => {
    const page = read('src/app/(auth)/welcome/page.tsx');
    assert.match(page, /isMockMode\(\)[\s\S]{0,300}redirect\(getDefaultPostLoginPath/u);
    // No password may be read or stored anywhere in the mock path.
    assert.doesNotMatch(page, /updateUser|password:/u);
  });
});

describe('A2 — the reset request tells the caller nothing about the address', () => {
  test('the same answer is returned whether or not the send succeeded', () => {
    const source = read('src/app/api/auth/forgot-password/route.ts');
    // One neutral payload, returned on the single exit path after the attempt.
    assert.equal(source.split('NEUTRAL_RESULT').length - 1, 2, 'one definition, one return');
    assert.match(source, /if \(error\) console\.warn/u, 'failures are logged, not returned');
    assert.doesNotMatch(
      source,
      /return[^\n]*error\.message/u,
      'a Supabase message must never reach the caller',
    );
    assert.match(source, /confirm-recovery/u, 'the email must point at the recovery route');
  });

  test('the throttle is documented as a courtesy, not the real defense', () => {
    const source = read('src/app/api/auth/forgot-password/route.ts');
    assert.match(source, /Instance-local[\s\S]{0,400}Supabase/u);
  });
});

describe('A4 — an expired link explains itself and names the way back', () => {
  test('the login page reads both link errors and says how to get a new link', () => {
    const page = read('src/app/(auth)/login/page.tsx');
    for (const code of ['invalid_invite', 'invalid_recovery', 'invite_required']) {
      assert.match(page, new RegExp(code, 'u'), `${code} must be explained`);
    }
    // Each message has to end somewhere useful, not just state the failure.
    assert.match(page, /invalid_invite:[\s\S]{0,200}send a new one/u, 'invite: operator reissues');
    assert.match(page, /invalid_recovery:[\s\S]{0,200}Forgot password/u, 'recovery: self-serve');
    assert.match(page, /searchParams\.get\('error'\)/u, 'the code is read from the URL');
  });

  test('the login page offers the reset entry point', () => {
    const page = read('src/app/(auth)/login/page.tsx');
    assert.match(page, /Forgot password\?/u);
    assert.match(page, /\/api\/auth\/forgot-password/u);
    // The neutral reply is shown verbatim rather than interpreted.
    assert.match(page, /setNotice\(data\.message/u);
  });
});
