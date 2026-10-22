import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, verifySessionToken, type SessionPayload } from "@/lib/session";
import { credentialsMatch } from "@/lib/passwords";

export { SESSION_COOKIE_NAME, createSessionToken, verifySessionToken, type SessionPayload } from "@/lib/session";

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  try {
    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true, role: true } });
    return user && user.email === session.email && user.role === session.role ? session : null;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/profile?error=sign_in_required");
  return session;
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Administrator authentication required.");
  return session;
}

export async function isAdminRequest(request: Request) {
  const session = await getSession();
  if (session?.role === "ADMIN") return true;
  const expectedUser = process.env.ADMIN_BASIC_USER;
  const expectedPassword = process.env.ADMIN_BASIC_PASSWORD;
  const header = request.headers.get("authorization");
  if (!expectedUser || !expectedPassword || !header?.startsWith("Basic ")) return false;
  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(":");
    return separator > 0 && credentialsMatch(decoded.slice(0, separator), expectedUser) && credentialsMatch(decoded.slice(separator + 1), expectedPassword);
  } catch {
    return false;
  }
}

export async function setSessionCookie(user: Omit<SessionPayload, "expiresAt">) {
  const token = await createSessionToken(user);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });
  for (const legacyCookie of ["user_email", "user_role", "admin_session"]) cookieStore.delete(legacyCookie);
}

export async function clearSessionCookies() {
  const cookieStore = await cookies();
  for (const name of [SESSION_COOKIE_NAME, "user_email", "user_role", "admin_session"]) cookieStore.delete(name);
}
