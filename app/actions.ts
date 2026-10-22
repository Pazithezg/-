"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { SourceType } from "../generated/prisma";
import { prisma } from "@/lib/prisma";
import { runAdapter } from "@/lib/ingest/adapters";
import { canonicalizeUrl } from "@/lib/url";
import { z } from "zod";
import { contributionClaimSchema, sourceUrlSchema, wellnessCaseSchema } from "@/lib/wellness";
import { publishSubmission, PublicationError, saveSubmissionForReview } from "@/lib/publication";
import { clearSessionCookies, requireAdmin, setSessionCookie } from "@/lib/auth";
import { credentialsMatch, hashPassword, verifyPassword } from "@/lib/passwords";

function readTextField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readOptionalTextField(formData: FormData, key: string) {
  const value = readTextField(formData, key);
  return value || null;
}

function readOptionalUrlField(formData: FormData, key: string) {
  const value = canonicalizeUrl(readTextField(formData, key));
  return value || null;
}

function readOptionalNumberField(formData: FormData, key: string) {
  const value = readTextField(formData, key);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readOptionalDateField(formData: FormData, key: string) {
  const value = readTextField(formData, key);
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function revalidateAtlasCms() {
  const paths = [
    "/",
    "/dashboard",
    "/database",
    "/robots",
    "/inventory",
    "/contributions",
    "/perspectives",
    "/wellness",
    "/analytics",
    "/submit-data",
    "/admin",
    "/admin/submitted-data",
    "/admin/cms"
  ];

  for (const path of paths) {
    revalidatePath(path);
  }
}

async function saveCommunitySubmission(formData: FormData) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session) throw new Error("กรุณาเข้าสู่ระบบก่อนส่งข้อมูล / Please sign in first.");
  const submissionType = z.enum(["wellness_case", "contribution_claim", "source_url", "robot_model", "owned_inventory_update", "event_demo_record", "correction_request"]).parse(formData.get("submissionType"));
  const title = z.string().trim().min(3, "ชื่อเรื่องต้องมีอย่างน้อย 3 ตัวอักษร").max(250).parse(formData.get("title"));
  const notes = z.string().trim().max(4000).parse(String(formData.get("notes") ?? ""));
  const rawUrl = String(formData.get("url") ?? "").trim();
  const url = rawUrl ? sourceUrlSchema.parse(rawUrl) : null;
  let payloadJson: Record<string, string> = {};
  if (submissionType === "wellness_case") {
    if (!url) throw new Error("กรุณาระบุลิงก์แหล่งอ้างอิง / A source URL is required.");
    payloadJson = wellnessCaseSchema.parse(Object.fromEntries([
      "robotModelId", "scenario", "participantGroup", "setting", "interactionDescription", "reportedOutcome", "limitations", "evidenceType", "organization"
    ].map((key) => [key, String(formData.get(key) ?? "")])));
  } else if (submissionType === "contribution_claim") {
    if (!url) throw new Error("กรุณาระบุลิงก์แหล่งอ้างอิง / A source URL is required.");
    payloadJson = contributionClaimSchema.parse({
      robotModelId: String(formData.get("robotModelId") ?? ""),
      contributionType: String(formData.get("contributionType") ?? "field_observation"),
      organization: String(formData.get("organization") ?? ""),
      description: notes
    });
  }
  if (payloadJson.robotModelId && !await prisma.robotModel.findUnique({ where: { id: payloadJson.robotModelId }, select: { id: true } })) {
    throw new Error("ไม่พบหุ่นยนต์ที่เลือก กรุณาเลือกใหม่ / Robot not found.");
  }
  const submission = await prisma.submittedData.create({
    data: {
      submissionType, title, url, notes: notes || null, payloadJson,
      submitterContact: session.email,
      submittedById: session.userId,
      status: "QUEUED"
    }
  });

  revalidateAtlasCms();
  revalidatePath("/profile");
  return submission.id;
}

export async function createSubmission(formData: FormData) {
  await saveCommunitySubmission(formData);
  redirect("/profile");
}

export async function submitCasebookData(_state: { success: boolean; message: string }, formData: FormData) {
  try {
    const id = await saveCommunitySubmission(formData);
    return { success: true, message: `ส่งข้อมูลแล้ว รอผู้ดูแลตรวจสอบ / Submitted for review (${id.slice(-6)})` };
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
      : error instanceof Error && !/prisma|database|connection|authentication failed/i.test(error.message)
        ? error.message : "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองอีกครั้ง / Unable to save submission.";
    return { success: false, message };
  }
}

export async function updateSubmissionStatus(id: string, status: "APPROVED" | "REJECTED" | "NEEDS_REVIEW") {
  const { requireAdmin } = await import("@/lib/auth");
  await requireAdmin();
  try {
    await publishSubmission({ id, status });
  } catch (error) {
    const message = error instanceof PublicationError ? error.message : error instanceof z.ZodError ? "This submission is missing required case or contribution details. Request a corrected submission." : "Unable to publish this submission. No review status was changed.";
    redirect(`/admin?collection=submitted-data&selectedId=${encodeURIComponent(id)}&reviewError=${encodeURIComponent(message)}`);
  }
  revalidateAtlasCms();
  revalidatePath("/wellness/[id]", "page");
}

export async function runDataPull(formData: FormData) {
  await requireAdmin();
  const adapter = String(formData.get("adapter") ?? "OPENALEX") as SourceType;
  const query = String(formData.get("query") ?? "").trim();
  const limit = Number(formData.get("limit") ?? 10);

  if (!query) {
    throw new Error("Query is required.");
  }

  const job = await prisma.sourcePullJob.create({
    data: { adapter, query, status: "RUNNING", startedAt: new Date() }
  });

  try {
    const result = await runAdapter(adapter, { query, limit });
    await prisma.sourcePullJob.update({
      where: { id: job.id },
      data: {
        status: result.missingKeys?.length ? "SKIPPED_MISSING_KEY" : "SUCCEEDED",
        recordsFound: result.recordsFound,
        recordsSaved: result.recordsSaved,
        errorMessage: result.missingKeys?.join(", ") || null,
        finishedAt: new Date()
      }
    });
  } catch (error) {
    await prisma.sourcePullJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown ingestion error",
        finishedAt: new Date()
      }
    });
  }

  revalidatePath("/data-pulls");
  revalidatePath("/");
}

export async function loginAsUser(formData: FormData) {
  const email = readTextField(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  let user;
  try {
    user = await prisma.user.findUnique({ where: { email } });
  } catch {
    redirect("/profile?error=service_unavailable");
  }
  if (!user || !await verifyPassword(password, user.passwordHash)) {
    redirect("/profile?error=invalid_credentials");
  }
  try {
    await setSessionCookie({ userId: user.id, email: user.email, role: user.role });
  } catch {
    redirect("/profile?error=sign_in_unavailable");
  }
  revalidatePath("/", "layout");
  redirect("/profile");
}

export async function registerAndLoginUser(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/profile");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || name.length > 120) {
    redirect("/profile?error=invalid_registration");
  }
  if (password.length < 12 || password.length > 256) redirect("/profile?error=password_length");
  let existing;
  try {
    existing = await prisma.user.findUnique({ where: { email } });
  } catch {
    redirect("/profile?error=service_unavailable");
  }
  let user;
  if (existing) {
    // Legacy records without a password cannot be claimed by supplying their email.
    if (!await verifyPassword(password, existing.passwordHash)) redirect("/profile?error=invalid_credentials");
    user = existing;
  } else {
    const configuredAdminEmail = process.env.ADMIN_BASIC_USER?.trim().toLowerCase();
    if (configuredAdminEmail && email === configuredAdminEmail) redirect("/profile?error=invalid_credentials");
    try {
      user = await prisma.user.create({
        data: { email, name: name || email.split("@")[0], role: "USER", passwordHash: await hashPassword(password) }
      });
    } catch {
      redirect("/profile?error=registration_failed");
    }
  }
  try {
    await setSessionCookie({ userId: user.id, email: user.email, role: user.role });
  } catch {
    redirect("/profile?error=sign_in_unavailable");
  }
  revalidatePath("/profile");
  revalidateAtlasCms();
  redirect(redirectTo.startsWith("/") && !redirectTo.startsWith("//") && !redirectTo.includes("\\") ? redirectTo : "/profile");
}

export async function logoutUser() {
  await clearSessionCookies();
  revalidatePath("/profile");
  revalidateAtlasCms();
  redirect("/profile");
}

export async function adminLoginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const expectedUser = process.env.ADMIN_BASIC_USER?.trim().toLowerCase();
  const expectedPassword = process.env.ADMIN_BASIC_PASSWORD;

  if (expectedUser && expectedPassword && credentialsMatch(email, expectedUser) && credentialsMatch(password, expectedPassword)) {
    try {
      const user = await prisma.user.upsert({
        where: { email },
        update: { role: "ADMIN", passwordHash: null },
        create: { email, name: "Admin", role: "ADMIN" }
      });
      await setSessionCookie({ userId: user.id, email: user.email, role: "ADMIN" });
    } catch {
      redirect("/admin-login?error=sign_in_unavailable");
    }
    
    revalidateAtlasCms();
    redirect("/admin?collection=submitted-data");
  } else {
    redirect("/admin-login?error=invalid_credentials");
  }
}

export async function setLanguage(lang: "en" | "th") {
  const cookieStore = await cookies();
  cookieStore.set("lang", lang, { path: "/" });
  revalidatePath("/", "layout");
}

export async function upsertSourceRecordAction(formData: FormData) {
  await requireAdmin();
  const id = readTextField(formData, "id");
  const url = readOptionalUrlField(formData, "url");
  const sourceType = readTextField(formData, "sourceType") as any;
  const title = readTextField(formData, "title");

  if (!title) throw new Error("Source title is required.");
  if (!url) throw new Error("Source URL is required.");

  const existing = id
    ? await prisma.sourceRecord.findUnique({ where: { id }, select: { rawMeta: true } })
    : null;

  const payload = {
    sourceType,
    title,
    url,
    excerpt: readOptionalTextField(formData, "excerpt") || "",
    publishedAt: readOptionalDateField(formData, "publishedAt"),
    author: readOptionalTextField(formData, "author"),
    platform: readOptionalTextField(formData, "platform"),
    relevanceStatus: readTextField(formData, "relevanceStatus") as any,
    relevanceReason: readOptionalTextField(formData, "relevanceReason"),
    relevanceConfidence: readOptionalNumberField(formData, "relevanceConfidence") ?? 0
  };

  if (id) {
    await prisma.sourceRecord.update({ where: { id }, data: { ...payload, rawMeta: existing?.rawMeta ?? {} } });
  } else {
    await prisma.sourceRecord.upsert({
      where: { url },
      create: { ...payload, rawMeta: {} },
      update: { ...payload, rawMeta: existing?.rawMeta ?? {} }
    });
  }

  revalidateAtlasCms();
}

export async function upsertRobotModelAction(formData: FormData) {
  await requireAdmin();
  const id = readTextField(formData, "id");
  const canonicalName = readTextField(formData, "canonicalName");

  if (!canonicalName) throw new Error("Canonical name is required.");

  const existing = id
    ? await prisma.robotModel.findUnique({ where: { id }, select: { sourceMeta: true } })
    : null;

  const payload = {
    canonicalName,
    manufacturer: readOptionalTextField(formData, "manufacturer"),
    developerOrg: readOptionalTextField(formData, "developerOrg"),
    countryOfOrigin: readOptionalTextField(formData, "countryOfOrigin"),
    robotType: readOptionalTextField(formData, "robotType") || "unknown",
    embodimentLevel: readOptionalTextField(formData, "embodimentLevel"),
    primaryUseCase: readOptionalTextField(formData, "primaryUseCase"),
    thailandStatus: readOptionalTextField(formData, "thailandStatus") || "observed_in_thailand",
    statusConfidence: readOptionalNumberField(formData, "statusConfidence") ?? 0.5,
    officialUrl: readOptionalUrlField(formData, "officialUrl"),
    description: readOptionalTextField(formData, "description"),
    firstSeenYear: readOptionalNumberField(formData, "firstSeenYear"),
    lastVerifiedAt: readOptionalDateField(formData, "lastVerifiedAt")
  };

  if (id) {
    await prisma.robotModel.update({ where: { id }, data: { ...payload, sourceMeta: existing?.sourceMeta ?? {} } });
  } else {
    await prisma.robotModel.upsert({
      where: { canonicalName },
      create: { ...payload, sourceMeta: {} },
      update: { ...payload, sourceMeta: existing?.sourceMeta ?? {} }
    });
  }

  revalidateAtlasCms();
}

export async function upsertContributionAction(formData: FormData) {
  await requireAdmin();
  const id = readTextField(formData, "id");
  const title = readTextField(formData, "title");
  const contributionType = readTextField(formData, "contributionType");
  const sourceUrl = readOptionalUrlField(formData, "sourceUrl");

  if (!title) throw new Error("Contribution title is required.");
  if (!contributionType) throw new Error("Contribution type is required.");

  const payload = {
    contributorName: readOptionalTextField(formData, "contributorName"),
    contributorType: readOptionalTextField(formData, "contributorType"),
    organization: readOptionalTextField(formData, "organization"),
    contributionType,
    title,
    description: readOptionalTextField(formData, "description"),
    relatedRobotModelId: readOptionalTextField(formData, "relatedRobotModelId"),
    sourceUrl,
    license: readOptionalTextField(formData, "license"),
    visibility: readOptionalTextField(formData, "visibility") || "public",
    verificationStatus: readOptionalTextField(formData, "verificationStatus") as any || "NEEDS_REVIEW"
  };

  if (id) {
    await prisma.contribution.update({ where: { id }, data: payload });
  } else if (sourceUrl) {
    await prisma.contribution.upsert({
      where: { sourceUrl },
      create: payload,
      update: payload
    });
  } else {
    await prisma.contribution.create({ data: payload });
  }

  revalidateAtlasCms();
}

export async function upsertSubmittedDataAction(formData: FormData) {
  await requireAdmin();
  const id = readTextField(formData, "id");
  let savedId = id;
  try {
    const title = z.string().trim().min(3).max(250).parse(formData.get("title"));
    const rawUrl = readTextField(formData, "url");
    const url = rawUrl ? sourceUrlSchema.parse(rawUrl) : null;
    const notes = z.string().trim().max(4000).parse(readTextField(formData, "notes")) || null;
    const reviewNotes = z.string().trim().max(4000).parse(readTextField(formData, "reviewNotes")) || null;
    if (id) {
      const existing = await prisma.submittedData.findUnique({ where: { id }, select: { submissionType: true } });
      if (!existing) throw new PublicationError("NOT_FOUND", "Submission was not found.");
      let payloadJson: Record<string, string> | undefined;
      if (existing.submissionType === "wellness_case") {
        payloadJson = wellnessCaseSchema.parse(Object.fromEntries([
          "robotModelId", "scenario", "participantGroup", "setting", "interactionDescription", "reportedOutcome", "limitations", "evidenceType", "organization"
        ].map((key) => [key, readTextField(formData, key)])));
      } else if (existing.submissionType === "contribution_claim") {
        payloadJson = contributionClaimSchema.parse({
          robotModelId: readTextField(formData, "robotModelId"),
          contributionType: readTextField(formData, "contributionType"),
          organization: readTextField(formData, "organization"),
          description: readTextField(formData, "description")
        });
      }
      if (payloadJson && !url) throw new Error("A source URL is required for this case or contribution.");
      if (payloadJson?.robotModelId && !await prisma.robotModel.findUnique({ where: { id: payloadJson.robotModelId }, select: { id: true } })) {
        throw new PublicationError("ROBOT_NOT_FOUND", "The selected robot no longer exists. Choose another robot before saving.");
      }
      await saveSubmissionForReview({ id, title, url, notes, reviewNotes, payloadJson });
    } else {
      // Structured cases enter through the validated community form.
      const submissionType = z.enum(["source_url", "correction_request"]).parse(formData.get("submissionType"));
      const created = await prisma.submittedData.create({ data: { submissionType, title, url, notes, reviewNotes, status: "NEEDS_REVIEW", payloadJson: {} } });
      savedId = created.id;
    }
  } catch (error) {
    const message = error instanceof PublicationError ? error.message : error instanceof z.ZodError
      ? "Check the required fields and source URL. No changes were saved."
      : "Unable to save these changes. A source URL and complete case details are required.";
    redirect(`/admin?collection=submitted-data&selectedId=${encodeURIComponent(id || "new")}&reviewError=${encodeURIComponent(message)}`);
  }
  revalidateAtlasCms();
  revalidatePath("/wellness/[id]", "page");
  redirect(`/admin?collection=submitted-data&selectedId=${encodeURIComponent(savedId)}&saved=review`);
}
