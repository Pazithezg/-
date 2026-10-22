import type { PrismaClient } from "../generated/prisma";
import { publishSubmission } from "./publication";
import { wellnessCaseSchema } from "./wellness";

// Curated summaries of institutional reports, not generated results or a clinical dataset.
const cases = [
  {
    id: "wellness-case-dinsaw-mini-3-home-ai",
    robot: {
      canonicalName: "Dinsaw Mini 3 Home AI",
      manufacturer: "CT Asia Robotics",
      countryOfOrigin: "Thailand",
      robotType: "social_robot",
      primaryUseCase: "Home communication and reminders for older adults",
      description: "A home-support robot described in a Chulalongkorn University report published in November 2024.",
      officialUrl: "https://www.dinsaw.com/",
      sourceMeta: { sourceUrl: "https://www.chula.ac.th/en/highlight/198924/", reportPublishedAt: "2024-11-07" }
    },
    title: "Dinsaw Mini 3 Home AI: communication and reminders at home",
    url: "https://www.chula.ac.th/en/highlight/198924/",
    details: {
      scenario: "social_connection",
      participantGroup: "Older adults and family caregivers",
      setting: "Home care; capabilities described in a 2024 institutional report",
      interactionDescription: "The report describes a home robot that communicates with older adults and gives medication and appointment reminders.",
      reportedOutcome: "These are reported product capabilities. The article does not provide a controlled evaluation of wellness outcomes for this model.",
      limitations: "Interview-based institutional coverage is not clinical validation. Confirm the model's current capabilities, consent and caregiver supervision before planning an activity.",
      evidenceType: "institutional_report",
      organization: "CT Asia Robotics; reported by Chulalongkorn University"
    }
  },
  {
    id: "wellness-case-mirror-telepresence",
    robot: {
      canonicalName: "Mirror telepresence system",
      developerOrg: "CURoboCOVID, Chulalongkorn University",
      countryOfOrigin: "Thailand",
      robotType: "telepresence_system",
      primaryUseCase: "Remote communication between care staff and patients",
      description: "A quarantine telepresence system documented in a Chulalongkorn University report published in January 2021.",
      sourceMeta: { sourceUrl: "https://www.chula.ac.th/en/news/42184/", reportPublishedAt: "2021-01-19", historicalReport: true }
    },
    title: "Mirror: remote communication in COVID-19 care",
    url: "https://www.chula.ac.th/en/news/42184/",
    details: {
      scenario: "care_communication",
      participantGroup: "Patients and healthcare workers",
      setting: "Hospital and quarantine care during Thailand's 2020–2021 COVID-19 response",
      interactionDescription: "Mirror supports communication and observation between patients and healthcare staff at a distance through telepresence.",
      reportedOutcome: "The university reported deployment alongside Pinto systems and described reduced close-contact requirements. This card does not claim an independently measured clinical effect.",
      limitations: "This historical deployment report does not establish current availability or quantified effectiveness. Mirror is a telepresence device, not a humanoid robot or autonomous clinician.",
      evidenceType: "institutional_report",
      organization: "CURoboCOVID; reported by Chulalongkorn University"
    }
  }
] as const;

export async function seedWellnessCases(prisma: PrismaClient) {
  let published = 0;
  let preserved = 0;
  for (const item of cases) {
    // Preserve any existing robot edits and reviewed submissions on repeated runs.
    const robot = await prisma.robotModel.upsert({
      where: { canonicalName: item.robot.canonicalName },
      create: { ...item.robot, thailandStatus: "observed_in_thailand", statusConfidence: 0.8 },
      update: {}
    });
    const payloadJson = wellnessCaseSchema.parse({ ...item.details, robotModelId: robot.id });
    const submission = await prisma.submittedData.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        submissionType: "wellness_case",
        title: item.title,
        url: item.url,
        payloadJson,
        status: "QUEUED",
        reviewNotes: "Curated from the linked institutional report. Capabilities and limitations checked; clinical effectiveness is not certified."
      },
      update: {}
    });
    // Never republish a case an administrator has deliberately withdrawn.
    if (submission.status === "REJECTED" || submission.status === "NEEDS_REVIEW") {
      preserved += 1;
      continue;
    }
    await publishSubmission({ id: submission.id, status: "APPROVED" }, prisma);
    published += 1;
  }
  return { published, preserved };
}
