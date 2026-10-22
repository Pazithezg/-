import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const [robots, cases] = await Promise.all([
    prisma.robotModel.count(),
    prisma.contribution.count({ where: { contributionType: "wellness_case", visibility: "public", verificationStatus: "APPROVED" } })
  ]);
  console.log(JSON.stringify({ connected: true, robots, publishedWellnessCases: cases }));
}

main()
  .catch((error) => {
    console.error("Database/schema check failed.", error && typeof error === "object" && "code" in error ? String(error.code) : "Check the configured database connection.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
