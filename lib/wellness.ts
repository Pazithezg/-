import { z } from "zod";
import { canonicalizeUrl } from "./url";

export const wellnessScenarios = [
  { value: "social_connection", label: "Social connection", labelTh: "เพื่อนและการมีส่วนร่วมทางสังคม", description: "Communication and shared activities with a robot." },
  { value: "care_communication", label: "Care communication", labelTh: "การสื่อสารในการดูแล", description: "Communication between people receiving care and their caregivers." },
  { value: "assisted_activity", label: "Assisted activity", labelTh: "กิจกรรมที่มีหุ่นยนต์ช่วย", description: "Human-led activities supported by a robot." }
] as const;

export const evidenceTypes = [
  { value: "institutional_report", label: "Institutional report", labelTh: "รายงานจากหน่วยงาน" },
  { value: "research_paper", label: "Research paper", labelTh: "งานวิจัย" },
  { value: "field_observation", label: "Field observation", labelTh: "บันทึกจากภาคสนาม" }
] as const;

export const scenarioSchema = z.enum(["social_connection", "care_communication", "assisted_activity"]);
export const evidenceTypeSchema = z.enum(["institutional_report", "research_paper", "field_observation"]);
const shortText = z.string().trim().min(2).max(250);
const caseText = z.string().trim().min(10).max(4000);

export const sourceUrlSchema = z.string().trim().max(2000).url("Enter a complete source URL.")
  .refine((url) => {
    try {
      return ["https:", "http:"].includes(new URL(url).protocol);
    } catch {
      return false;
    }
  }, "Use an http or https source URL.")
  .transform(canonicalizeUrl);

// Zod strips unknown fields so private submission/contact fields cannot enter public metadata.
export const wellnessCaseSchema = z.object({
  robotModelId: z.string().trim().min(1, "Choose a robot from the registry.").max(100),
  scenario: scenarioSchema,
  participantGroup: shortText,
  setting: shortText,
  interactionDescription: caseText,
  reportedOutcome: caseText,
  limitations: caseText,
  evidenceType: evidenceTypeSchema,
  organization: z.string().trim().max(250).optional()
});

export const contributionClaimSchema = z.object({
  robotModelId: z.string().trim().max(100).optional(),
  contributionType: z.string().trim().min(2).max(80),
  organization: z.string().trim().max(250).optional(),
  description: caseText.optional()
});

export type WellnessCase = z.infer<typeof wellnessCaseSchema>;
export type WellnessScenario = z.infer<typeof scenarioSchema>;
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;

export function parseWellnessDetails(value: unknown): WellnessCase | null {
  const parsed = wellnessCaseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function scenarioLabel(value: string, language: "en" | "th" = "en") {
  const scenario = wellnessScenarios.find((item) => item.value === value);
  return scenario ? (language === "th" ? scenario.labelTh : scenario.label) : value;
}

export function evidenceLabel(value: string, language: "en" | "th" = "en") {
  const evidence = evidenceTypes.find((item) => item.value === value);
  return evidence ? (language === "th" ? evidence.labelTh : evidence.label) : value;
}

export interface PublishableSubmission {
  id: string;
  submissionType: string;
  title: string;
  url: string | null;
  payloadJson: unknown;
}

export function buildContributionFromSubmission(submission: PublishableSubmission) {
  const title = z.string().trim().min(3).max(250).parse(submission.title);
  const sourceUrl = sourceUrlSchema.parse(submission.url);
  const base = {
    title,
    sourceUrl,
    submissionId: submission.id,
    visibility: "public",
    verificationStatus: "APPROVED" as const
  };

  if (submission.submissionType === "wellness_case") {
    const details = wellnessCaseSchema.parse(submission.payloadJson);
    return {
      ...base,
      contributionType: "wellness_case",
      organization: details.organization || null,
      relatedRobotModelId: details.robotModelId,
      description: details.interactionDescription,
      wellnessDetails: details
    };
  }

  if (submission.submissionType === "contribution_claim") {
    const details = contributionClaimSchema.parse(submission.payloadJson);
    return {
      ...base,
      contributionType: details.contributionType,
      organization: details.organization || null,
      relatedRobotModelId: details.robotModelId || null,
      description: details.description || null
    };
  }

  throw new Error("Only wellness cases and contribution claims can be published as contributions.");
}
