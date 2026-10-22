export const SESSION_COOKIE_NAME = "atlas_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export type SessionPayload = {
  userId: string;
  email: string;
  role: "USER" | "RESEARCHER" | "ADMIN";
  expiresAt: number;
};

type SessionOptions = { secret?: string; now?: number };

function sessionSecret(explicit?: string) {
  const secret = explicit ?? process.env.ADMIN_SESSION_SECRET ?? process.env.ADMIN_BASIC_PASSWORD;
  if (!secret || secret.length < 16) {
    throw new Error("Configure ADMIN_SESSION_SECRET with at least 32 random characters before signing in.");
  }
  return secret;
}

function encode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid session encoding");
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSessionToken(user: Omit<SessionPayload, "expiresAt">, options: SessionOptions = {}) {
  const payload: SessionPayload = { ...user, expiresAt: Math.floor((options.now ?? Date.now()) / 1000) + SESSION_MAX_AGE_SECONDS };
  const body = encode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(sessionSecret(options.secret)), new TextEncoder().encode(body));
  return `${body}.${encode(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string | undefined, options: SessionOptions = {}): Promise<SessionPayload | null> {
  if (!token || token.length > 4096) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [body, signature] = parts;
    const valid = await crypto.subtle.verify("HMAC", await signingKey(sessionSecret(options.secret)), decode(signature), new TextEncoder().encode(body));
    if (!valid) return null;
    const payload: unknown = JSON.parse(new TextDecoder().decode(decode(body)));
    if (!payload || typeof payload !== "object") return null;
    const session = payload as SessionPayload;
    const now = Math.floor((options.now ?? Date.now()) / 1000);
    if (typeof session.userId !== "string" || !session.userId || typeof session.email !== "string" || !session.email ||
        !["USER", "RESEARCHER", "ADMIN"].includes(session.role) || !Number.isSafeInteger(session.expiresAt) ||
        session.expiresAt <= now || session.expiresAt > now + SESSION_MAX_AGE_SECONDS) return null;
    return session;
  } catch {
    return null;
  }
}
