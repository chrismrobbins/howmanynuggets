// Sign in with Google — pure ID-token verification (no Cloudflare deps, so it's
// unit-testable in Node). index.js supplies Google's live JWKS + the expected
// audience; this module does the RS256 signature check and claim validation.

export function b64urlToBytes(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

// Verify an RS256 JWT against a JWKS + expected audience/issuers. Throws on any
// failure; returns the decoded payload on success. Never trust an unverified
// token — the signature check is what makes "sign in with Google" safe.
export async function verifyRS256(idToken, keys, expectAud, issuers) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const header = b64urlToJson(parts[0]);
  if (header.alg !== 'RS256') throw new Error('unexpected alg');
  const jwk = (keys || []).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown signing key');
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1])
  );
  if (!ok) throw new Error('bad signature');
  const p = b64urlToJson(parts[1]);
  if (!issuers.has(p.iss)) throw new Error('bad issuer');
  if (p.aud !== expectAud) throw new Error('bad audience');
  if (!p.exp || p.exp * 1000 < Date.now()) throw new Error('token expired');
  return p;
}
