import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { loginAsUser, logoutUser, registerAndLoginUser } from "@/app/actions";
import { getTranslation } from "@/lib/translations";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your Profile", robots: { index: false, follow: false } };

const errors: Record<string, string> = {
  invalid_credentials: "Sign-in failed. Check your email and password. Existing imported accounts need administrator assistance before they can sign in.",
  password_length: "Choose a password between 12 and 256 characters.",
  invalid_registration: "Enter a valid email and a name under 120 characters.",
  registration_failed: "Unable to create this account. Try signing in or use another email.",
  service_unavailable: "Account access is temporarily unavailable. Please try again later.",
  sign_in_unavailable: "Sign-in is currently unavailable. Please contact the site administrator.",
  sign_in_required: "Sign in to submit a case and track its review."
};

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [cookieStore, session, params] = await Promise.all([cookies(), getSession(), searchParams]);
  const lang = cookieStore.get("lang")?.value === "th" ? "th" : "en";
  const t = getTranslation(lang);
  const currentUser = session ? await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true, submissions: { orderBy: { createdAt: "desc" }, take: 50 } }
  }) : null;
  const submissions = currentUser?.submissions ?? [];

  return (
    <>
      <h1>{t.profileTitle}</h1>
      <p className="muted" style={{ marginBottom: 20 }}>Submit a sourced HRI case and follow its review from your account.</p>
      {params.error && <p role="alert" className="notice">{errors[params.error] ?? "Unable to sign in. Please try again."}</p>}

      {session ? (
        <section className="panel" style={{ marginBottom: 20 }}>
          <h2>{currentUser?.name || "Your account"}</h2>
          <p>{session.email} <span className="badge">{session.role}</span></p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
            <Link href="/submit-data" className="button primary">Share a case</Link>
            {session.role === "ADMIN" && <Link href="/admin" className="button">Review queue</Link>}
            <form action={logoutUser}><button type="submit" className="button">Sign out</button></form>
          </div>
        </section>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", marginBottom: 24 }}>
          <section className="panel">
            <h2>Sign in</h2>
            <form action={loginAsUser} className="form" style={{ marginTop: 16 }}>
              <label>Email<input name="email" type="email" required autoComplete="email" maxLength={254} /></label>
              <label>Password<input name="password" type="password" required autoComplete="current-password" maxLength={256} /></label>
              <button type="submit" className="primary">Sign in</button>
            </form>
          </section>
          <section className="panel">
            <h2>Create an account</h2>
            <p className="muted">Use at least 12 characters for your password. New accounts can submit cases for review.</p>
            <form action={registerAndLoginUser} className="form" style={{ marginTop: 16 }}>
              <label>Name<input name="name" autoComplete="name" maxLength={120} /></label>
              <label>Email<input name="email" type="email" required autoComplete="email" maxLength={254} /></label>
              <label>Password<input name="password" type="password" required minLength={12} maxLength={256} autoComplete="new-password" /></label>
              <button type="submit" className="primary">Create account</button>
            </form>
          </section>
        </div>
      )}

      {session && (
        <section className="panel">
          <h2>Your submissions</h2>
          <p className="muted">Only you and the review team can see your pending submissions.</p>
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead><tr><th>Submission</th><th>Status</th><th>Review notes</th><th>Submitted</th></tr></thead>
              <tbody>
                {submissions.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.title}</strong><div className="muted">{item.submissionType.replace(/_/g, " ")}</div></td>
                    <td><span className={`badge ${item.status === "APPROVED" ? "ok" : item.status === "REJECTED" ? "danger" : "warn"}`}>{item.status.toLowerCase()}</span></td>
                    <td>{item.reviewNotes || "Review pending."}</td>
                    <td>{item.createdAt.toLocaleDateString()}</td>
                  </tr>
                ))}
                {!submissions.length && <tr><td className="empty" colSpan={4}>You have not submitted any cases yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
