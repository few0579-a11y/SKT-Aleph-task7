// T07 인증: 비밀번호 해시(argon2id) + DB에 저장하는 세션.
// 비밀키(서명 키)는 쓰지 않는다. 세션 값은 추측할 수 없는 무작위 32바이트이고, DB에는 그 SHA-256 해시만 둔다.
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'sid';
export const SESSION_DAYS = 7; // 로그인 후 7일 고정(쓰는 동안 늘리지 않음)
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;

// OWASP 권장값(argon2id, 메모리 19MiB, 반복 2, 병렬 1). 라이브러리 기본값과 같지만 바뀌지 않게 적어 둔다.
// 솔트는 라이브러리가 해시마다 무작위로 만든다 → 같은 비밀번호라도 계정마다 저장값이 다르다.
// algorithm 2 = Argon2id (라이브러리의 Algorithm은 TypeScript 전용 상수라 실행 중에는 비어 있어 숫자로 적는다)
const ARGON2 = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (pw) => hash(pw, ARGON2);
export const verifyPassword = (stored, pw) => verify(stored, pw).catch(() => false);

// 없는 아이디로 로그인할 때도 비밀번호 검사를 한 번 해서, 응답 시간으로 아이디 존재 여부가 드러나지 않게 한다.
let dummyHash = null;
export async function verifyAgainstDummy(pw) {
  dummyHash ||= await hashPassword('dummy-password-for-timing-only');
  await verifyPassword(dummyHash, pw);
  return false;
}

export const newToken = () => randomBytes(32).toString('base64url');
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
export const sessionExpiry = () => new Date(Date.now() + SESSION_SECONDS * 1000);

export function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// HttpOnly: 화면 스크립트가 읽지 못함 / Secure: HTTPS에서만 전송(localhost는 브라우저가 예외 허용)
// SameSite=Lax: 다른 사이트에서 보낸 POST·PATCH·DELETE에는 쿠키가 붙지 않음
export const sessionCookie = (token) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
export const clearCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
