import "dotenv/config";
import { prisma } from "../lib/prisma";
import { seedWellnessCases } from "../lib/wellness-seed";

seedWellnessCases(prisma).then(({ published, preserved }) => {
  console.log(`Wellness seed complete: ${published} sourced cases published; ${preserved} withdrawn cases preserved.`);
}).catch(() => {
  // Avoid logging driver errors that could contain connection information.
  console.error("Wellness seed failed. Check database access, schema and source URL conflicts.");
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
