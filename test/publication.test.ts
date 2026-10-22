import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicationError, publishSubmission, saveSubmissionForReview, type PublicationDatabase } from "../lib/publication";

interface Submission {
  id: string;
  title: string;
  submissionType: string;
  url: string | null;
  status: string;
  payloadJson: Record<string, unknown>;
  submitterContact?: string;
}
interface Contribution {
  id: string;
  submissionId: string | null;
  sourceUrl: string | null;
  verificationStatus: string;
  visibility: string;
  [key: string]: unknown;
}
interface State {
  submissions: Submission[];
  contributions: Contribution[];
  robots: { id: string }[];
}

function fakeDatabase(initial: State, failStatusUpdate = false) {
  let state = structuredClone(initial);
  const database = {
    async $transaction(work: (tx: unknown) => Promise<unknown>) {
      const staged = structuredClone(state);
      const tx = {
        submittedData: {
          async findUnique({ where }: { where: { id: string } }) {
            return staged.submissions.find((item) => item.id === where.id) ?? null;
          },
          async update({ where, data }: { where: { id: string }; data: Partial<Submission> }) {
            if (failStatusUpdate) throw new Error("Simulated status write failure");
            const item = staged.submissions.find((row) => row.id === where.id)!;
            return Object.assign(item, data);
          }
        },
        contribution: {
          async findUnique({ where }: { where: { submissionId?: string; sourceUrl?: string } }) {
            return staged.contributions.find((row) => where.submissionId !== undefined
              ? row.submissionId === where.submissionId : row.sourceUrl === where.sourceUrl) ?? null;
          },
          async upsert({ where, create, update }: { where: { submissionId: string }; create: Omit<Contribution, "id">; update: Partial<Contribution> }) {
            const existing = staged.contributions.find((row) => row.submissionId === where.submissionId);
            if (existing) return Object.assign(existing, update);
            const created = { ...create, id: `contribution-${staged.contributions.length + 1}` } as Contribution;
            staged.contributions.push(created);
            return created;
          },
          async update({ where, data }: { where: { id: string }; data: Partial<Contribution> }) {
            return Object.assign(staged.contributions.find((row) => row.id === where.id)!, data);
          }
        },
        robotModel: {
          async findUnique({ where }: { where: { id: string } }) {
            return staged.robots.find((row) => row.id === where.id) ?? null;
          }
        }
      };
      const result = await work(tx);
      state = staged;
      return result;
    }
  } as unknown as PublicationDatabase;
  return { database, state: () => state };
}

function fixture(): State {
  return {
    robots: [{ id: "robot-1" }],
    submissions: [{
      id: "submission-1",
      title: "Observed care communication",
      submissionType: "wellness_case",
      url: "https://example.test/observed-case",
      status: "QUEUED",
      submitterContact: "private@example.test",
      payloadJson: {
        robotModelId: "robot-1",
        scenario: "care_communication",
        participantGroup: "Patients and staff",
        setting: "A supervised care workshop",
        interactionDescription: "Participants communicate through a telepresence robot.",
        reportedOutcome: "An observation report describes completed conversations.",
        limitations: "No measured clinical benefit is claimed by this observation.",
        evidenceType: "field_observation"
      }
    }],
    contributions: []
  };
}

test("approval creates a public contribution and repeated approval preserves the same record", async () => {
  const db = fakeDatabase(fixture());
  const first = await publishSubmission({ id: "submission-1", status: "APPROVED" }, db.database);
  const second = await publishSubmission({ id: "submission-1", status: "APPROVED" }, db.database);
  assert.equal(first.contributionId, second.contributionId);
  assert.equal(db.state().contributions.length, 1);
  assert.equal(db.state().submissions[0].status, "APPROVED");
  assert.equal(db.state().contributions[0].visibility, "public");
  assert.equal(JSON.stringify(db.state().contributions).includes("private@example.test"), false);
});

test("rejecting or returning an approved case for review removes public visibility", async () => {
  for (const status of ["REJECTED", "NEEDS_REVIEW"] as const) {
    const db = fakeDatabase(fixture());
    await publishSubmission({ id: "submission-1", status: "APPROVED" }, db.database);
    await publishSubmission({ id: "submission-1", status }, db.database);
    assert.equal(db.state().submissions[0].status, status);
    assert.equal(db.state().contributions[0].visibility, "private");
    assert.equal(db.state().contributions[0].verificationStatus, status);
    await publishSubmission({ id: "submission-1", status: "APPROVED" }, db.database);
    assert.equal(db.state().contributions.length, 1);
    assert.equal(db.state().contributions[0].visibility, "public");
  }
});

test("a source owned by another contribution is not overwritten and the submission stays queued", async () => {
  const initial = fixture();
  initial.contributions.push({
    id: "existing-publication", submissionId: null,
    sourceUrl: "https://example.test/observed-case", visibility: "public", verificationStatus: "APPROVED", title: "Existing work"
  });
  const db = fakeDatabase(initial);
  await assert.rejects(
    publishSubmission({ id: "submission-1", status: "APPROVED" }, db.database),
    (error: unknown) => error instanceof PublicationError && error.code === "SOURCE_CONFLICT"
  );
  assert.deepEqual(db.state(), initial);
});

test("a missing robot prevents publication without marking a case approved", async () => {
  const initial = fixture();
  initial.robots = [];
  const db = fakeDatabase(initial);
  await assert.rejects(
    publishSubmission({ id: "submission-1", status: "APPROVED" }, db.database),
    (error: unknown) => error instanceof PublicationError && error.code === "ROBOT_NOT_FOUND"
  );
  assert.deepEqual(db.state(), initial);
});

test("transaction failure does not leave a published contribution behind", async () => {
  const initial = fixture();
  const db = fakeDatabase(initial, true);
  await assert.rejects(publishSubmission({ id: "submission-1", status: "APPROVED" }, db.database));
  assert.deepEqual(db.state(), initial);
});

test("unsupported approval never creates an empty or misleading contribution", async () => {
  const initial = fixture();
  initial.submissions[0].submissionType = "source_url";
  const db = fakeDatabase(initial);
  await assert.rejects(
    publishSubmission({ id: "submission-1", status: "APPROVED" }, db.database),
    (error: unknown) => error instanceof PublicationError && error.code === "UNSUPPORTED_TYPE"
  );
  assert.deepEqual(db.state(), initial);
});

test("ordinary contribution claims also complete the existing submit-to-publish flow", async () => {
  const initial = fixture();
  initial.submissions[0].submissionType = "contribution_claim";
  initial.submissions[0].payloadJson = {
    robotModelId: "robot-1", contributionType: "research", description: "Public description explicitly provided for publication."
  };
  const db = fakeDatabase(initial);
  await publishSubmission({ id: "submission-1", status: "APPROVED" }, db.database);
  assert.equal(db.state().contributions[0].contributionType, "research");
  assert.equal(db.state().submissions[0].status, "APPROVED");
});

test("editing an approved submission withdraws it until the saved version is approved again", async () => {
  const db = fakeDatabase(fixture());
  await publishSubmission({ id: "submission-1", status: "APPROVED" }, db.database);
  await saveSubmissionForReview({ id: "submission-1", title: "Corrected report title", url: "https://example.test/corrected", notes: "Private edit notes", reviewNotes: "Check corrected source" }, db.database);
  assert.equal(db.state().submissions[0].title, "Corrected report title");
  assert.equal(db.state().submissions[0].status, "NEEDS_REVIEW");
  assert.equal(db.state().contributions[0].visibility, "private");
  assert.equal(db.state().contributions[0].verificationStatus, "NEEDS_REVIEW");
  await publishSubmission({ id: "submission-1", status: "APPROVED" }, db.database);
  assert.equal(db.state().contributions.length, 1);
  assert.equal(db.state().contributions[0].title, "Corrected report title");
  assert.equal(db.state().contributions[0].visibility, "public");
});
