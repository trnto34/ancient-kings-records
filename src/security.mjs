import { scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { first, run } from './data.mjs';

const scrypt = promisify(derive);
const scryptOptions = { N: 32768, r: 8, p: 3, maxmem: 40 * 1024 * 1024 };
const customerLifetime = 60 * 60 * 24 * 14;
const adminLifetime = 60 * 60 * 8;
const columns = { customer: 'akr_session', admin: 'akr_admin' };
const encoder = new TextEncoder();

export function now() {
  return Math.floor(Date.now() / 1000);
}

export function randomHex(size = 32) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(size))).toString('hex');
}

export async function digest(value) {
  return Buffer.from(await crypto.subtle.digest('SHA-256', encoder.encode(value))).toString('hex');
}

export function emailAddress(value) {
  const email = String(value ?? '').trim().toLowerCase();
  return email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : '';
}

export async function hashPassword(password, salt = randomHex(16)) {
  const hash = await scrypt(password, Buffer.from(salt, 'hex'), 64, scryptOptions);
  return `${salt}:${hash.toString('hex')}`;
}

export async function passwordMatches(password, stored) {
  const candidate = await hashPassword(password, stored?.split(':')[0] ?? '5d9ff39810b4dcba390c53a097b5f43e');
  return Boolean(stored) && timingSafeEqual(Buffer.from(stored), Buffer.from(candidate));
}

export async function adminKeyMatches(key, expected) {
  if (!expected || expected.length < 24 || key.length > 256) return false;
  const [left, right] = await Promise.all([digest(key), digest(expected)]);
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export async function setSession(c, role, accountId = null) {
  const lifetime = role === 'admin' ? adminLifetime : customerLifetime;
  const token = randomHex();
  const db = c.env.DB;
  const old = getCookie(c, columns[role]);
  if (old && /^[a-f0-9]{64}$/.test(old)) await run(db, 'DELETE FROM sessions WHERE token_hash = ? AND role = ?', [await digest(old), role]);
  await run(db, 'DELETE FROM sessions WHERE expires_at < ?', [now()]);
  await run(db, 'INSERT INTO sessions (token_hash, account_id, role, expires_at) VALUES (?, ?, ?, ?)',
    [await digest(token), accountId, role, now() + lifetime]);
  setCookie(c, columns[role], token, {
    path: '/', httpOnly: true, sameSite: 'Lax', secure: c.get('shop').secure, maxAge: lifetime,
  });
}

export async function session(c, role = 'customer') {
  const token = getCookie(c, columns[role]);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return await first(c.env.DB, `
    SELECT s.token_hash, s.account_id, a.email FROM sessions s LEFT JOIN accounts a ON a.id = s.account_id
    WHERE s.token_hash = ? AND s.role = ? AND s.expires_at >= ?`,
  [await digest(token), role, now()]);
}

export async function clearSession(c, role) {
  const existing = await session(c, role);
  if (existing) await run(c.env.DB, 'DELETE FROM sessions WHERE token_hash = ?', [existing.token_hash]);
  deleteCookie(c, columns[role], { path: '/', secure: c.get('shop').secure });
}

export async function rateAllowed(db, action, identity, max, seconds = 900) {
  const key = `${action}:${await digest(identity)}`;
  const window = Math.floor(now() / seconds) * seconds;
  const result = await first(db, `
    INSERT INTO limits (key, window) VALUES (?, ?)
    ON CONFLICT(key, window) DO UPDATE SET attempts = attempts + 1
    RETURNING attempts`, [key, window]);
  if (result.attempts === 1) await run(db, 'DELETE FROM limits WHERE window < ?', [now() - 86400]);
  return result.attempts <= max;
}

export function sameOrigin(c) {
  const origin = c.req.header('origin');
  if (!origin) return c.req.header('sec-fetch-site') === 'same-origin';
  return origin === new URL(c.req.url).origin || origin === c.get('shop').origin;
}

export function redirectPath(value, fallback = '/store') {
  return typeof value === 'string' && /^\/(?![/\\])[^\\\x00-\x1f]*$/.test(value) ? value : fallback;
}
