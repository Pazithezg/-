ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "Contribution" ADD COLUMN "submissionId" TEXT;
ALTER TABLE "Contribution" ADD COLUMN "wellnessDetails" JSONB;
CREATE UNIQUE INDEX "Contribution_submissionId_key" ON "Contribution"("submissionId");
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "SubmittedData"("id") ON DELETE SET NULL ON UPDATE CASCADE;
