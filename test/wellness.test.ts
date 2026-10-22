import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContributionFromSubmission, parseWellnessDetails, sourceUrlSchema, wellnessCaseSchema } from "../lib/wellness";

const validCase = {
  robotModelId: "robot-test",
  scenario: "care_communication",
  participantGroup: "Older adults and staff",
  setting: "A supervised community workshop",
  interactionDescription: "Staff support a video conversation through the robot.",
  reportedOutcome: "The source reports that participants completed a conversation.",
  limitations: "Small observation only; no validated clinical benefit is claimed.",
  evidenceType: "field_observation"
};

test("case validation requires a real registry selection and complete limitations", () => {
  assert.equal(wellnessCaseSchema.safeParse(validCase).success, true);
  assert.equal(wellnessCaseSchema.safeParse({ ...validCase, robotModelId: "" }).success, false);
  assert.equal(wellnessCaseSchema.safeParse({ ...validCase, limitations: "" }).success, false);
  assert.equal(parseWellnessDetails({ ...validCase, scenario: "medical_treatment" }), null);
});

test("publication only takes explicit public case fields, excluding submitter identity and contact", () => {
  const submission = {
    id: "submission-test",
    submissionType: "wellness_case",
    title: "Remote communication observation",
    url: "https://example.test/case?utm_source=email#section",
    payloadJson: { ...validCase, submitterContact: "private@example.test", notes: "Private reviewer context" },
    submitterName: "Private person",
    submitterContact: "private@example.test",
    notes: "Private reviewer context"
  };
  const contribution = buildContributionFromSubmission(submission);
  assert.equal(contribution.sourceUrl, "https://example.test/case");
  assert.equal(contribution.relatedRobotModelId, "robot-test");
  assert.equal(contribution.contributionType, "wellness_case");
  assert.equal(JSON.stringify(contribution).includes("private@example.test"), false);
  assert.equal(JSON.stringify(contribution).includes("Private reviewer context"), false);
  assert.equal("contributorName" in contribution, false);
});

test("source URLs reject executable schemes and malformed addresses", () => {
  assert.equal(sourceUrlSchema.safeParse("javascript:alert(1)").success, false);
  assert.equal(sourceUrlSchema.safeParse("not a URL").success, false);
  assert.equal(sourceUrlSchema.parse("https://example.test/report/?utm_campaign=test"), "https://example.test/report");
});

test("ordinary contribution claim publishes optional registry relation and explicit description", () => {
  const contribution = buildContributionFromSubmission({
    id: "claim-test",
    submissionType: "contribution_claim",
    title: "Published robotics project",
    url: "https://example.test/project",
    payloadJson: { contributionType: "research", description: "An explicitly provided public project summary." }
  });
  assert.equal(contribution.relatedRobotModelId, null);
  assert.equal(contribution.contributionType, "research");
  assert.equal(contribution.description, "An explicitly provided public project summary.");
});
