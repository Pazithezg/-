import { Prisma, type PrismaClient } from "../generated/prisma";
import { buildContributionFromSubmission } from "./wellness";

export type PublicationStatus = "APPROVED" | "REJECTED" | "NEEDS_REVIEW";
export type PublicationDatabase = Pick<PrismaClient, "$transaction">;

export class PublicationError extends Error {
  constructor(public readonly code: "NOT_FOUND" | "SOURCE_CONFLICT" | "ROBOT_NOT_FOUND" | "UNSUPPORTED_TYPE", message: string) {
    super(message);
    this.name = "PublicationError";
  }
}

/** An edit always withdraws a publication until the administrator approves it again. */
export async function saveSubmissionForReview(
  input: { id: string; title: string; url: string | null; notes: string | null; reviewNotes: string | null; payloadJson?: Record<string, string> },
  database?: PublicationDatabase
) {
  const db = database ?? (await import("./prisma")).prisma;
  return db.$transaction(async (tx) => {
    const existing = await tx.submittedData.findUnique({ where: { id: input.id } });
    if (!existing) throw new PublicationError("NOT_FOUND", "Submission was not found.");
    const publication = await tx.contribution.findUnique({ where: { submissionId: input.id } });
    await tx.submittedData.update({
      where: { id: input.id },
      data: {
        title: input.title, url: input.url, notes: input.notes, reviewNotes: input.reviewNotes,
        ...(input.payloadJson ? { payloadJson: input.payloadJson } : {}),
        status: "NEEDS_REVIEW"
      }
    });
    if (publication) await tx.contribution.update({
      where: { id: publication.id },
      data: { visibility: "private", verificationStatus: "NEEDS_REVIEW" }
    });
    return { submissionId: input.id };
  }, { isolationLevel: "Serializable" });
}

/** Caller must authenticate an administrator before invoking this service. */
export async function publishSubmission(
  input: { id: string; status: PublicationStatus; reviewNotes?: string },
  database?: PublicationDatabase
) {
  // Lazy loading keeps validation/unit tests independent of configured database credentials.
  const db = database ?? (await import("./prisma")).prisma;
  return db.$transaction(async (tx) => {
    const submission = await tx.submittedData.findUnique({ where: { id: input.id } });
    if (!submission) throw new PublicationError("NOT_FOUND", "Submission was not found.");

    const existing = await tx.contribution.findUnique({ where: { submissionId: input.id } });
    let contributionId = existing?.id ?? null;

    if (input.status === "APPROVED") {
      if (!["wellness_case", "contribution_claim"].includes(submission.submissionType)) {
        throw new PublicationError("UNSUPPORTED_TYPE", "Publish a wellness case or contribution claim. Other submissions require manual processing.");
      }

      const data = buildContributionFromSubmission(submission);
      if (data.relatedRobotModelId) {
        const robot = await tx.robotModel.findUnique({ where: { id: data.relatedRobotModelId }, select: { id: true } });
        if (!robot) throw new PublicationError("ROBOT_NOT_FOUND", "The selected robot no longer exists. Update the submission before publishing.");
      }

      const sameSource = await tx.contribution.findUnique({ where: { sourceUrl: data.sourceUrl } });
      if (sameSource && sameSource.submissionId !== submission.id) {
        throw new PublicationError("SOURCE_CONFLICT", "This source URL already belongs to another contribution. Review the existing record instead of publishing a duplicate.");
      }

      const contribution = await tx.contribution.upsert({
        where: { submissionId: submission.id },
        create: { ...data, wellnessDetails: "wellnessDetails" in data ? data.wellnessDetails : Prisma.JsonNull },
        update: { ...data, wellnessDetails: "wellnessDetails" in data ? data.wellnessDetails : Prisma.JsonNull }
      });
      contributionId = contribution.id;
    } else if (existing) {
      await tx.contribution.update({
        where: { id: existing.id },
        data: { verificationStatus: input.status, visibility: "private" }
      });
    }

    await tx.submittedData.update({
      where: { id: submission.id },
      data: {
        status: input.status,
        ...(input.reviewNotes !== undefined ? { reviewNotes: input.reviewNotes.trim().slice(0, 4000) || null } : {})
      }
    });
    return { submissionId: submission.id, contributionId, status: input.status };
  }, { isolationLevel: "Serializable" });
}
