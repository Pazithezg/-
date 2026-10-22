"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const clusterSchema = z.object({
  id: z.string().min(1).max(150),
  title: z.string().min(1).max(300),
  organization: z.string().min(1).max(300),
  locationLabel: z.string().min(1).max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  summary: z.string().max(4000),
  contributorType: z.string().max(100),
  contributionCount: z.number().int().nonnegative(),
  detailsList: z.array(z.string().max(500)).max(500)
});

export type ContributionMapPoint = z.infer<typeof clusterSchema>;

// A new key excludes old cached records whose source cannot be established.
const clusterCacheKey = "map_contribution_clusters_v2";

export async function analyzeClustersWithGemini(): Promise<ContributionMapPoint[]> {
  await requireAdmin();
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("Map analysis requires a configured Gemini API key.");

  const [contributions, robots, inventory] = await Promise.all([
    prisma.contribution.findMany({
      where: { visibility: "public", verificationStatus: "APPROVED" },
      select: { id: true, title: true, description: true, organization: true, contributionType: true }
    }),
    prisma.robotModel.findMany({
      select: { id: true, canonicalName: true, description: true, developerOrg: true, countryOfOrigin: true }
    }),
    prisma.ownedInventory.findMany({
      where: { visibility: "public" },
      select: { id: true, displayName: true, ownerOrg: true, locationLabel: true }
    })
  ]);

  if (!contributions.length && !robots.length && !inventory.length) {
    throw new Error("There are no public database records to analyze.");
  }

  const payload = { contributions, robots, inventory };
  const prompt = `Group only the supplied public robotics database records into organizations with a known location in Thailand.
Do not invent organizations, robot models, projects, activities or counts. Omit records without sufficient location information.
Coordinates are AI estimates and will be labeled accordingly. Do not claim a verified deployment or clinical effect.
Return a JSON object with a clusters array. Every cluster needs id, title, organization, locationLabel,
latitude, longitude, summary, contributorType, contributionCount and detailsList.
contributionCount must equal the number of supplied records represented by that cluster; detailsList must name those records.
Database records:\n${JSON.stringify(payload)}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error("The map analysis service did not complete successfully.");
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("The map analysis service returned no content.");
  const parsed = z.object({ clusters: z.array(clusterSchema).max(200) }).parse(JSON.parse(text));
  const recordNames = new Set([
    ...contributions.map((item) => item.title),
    ...robots.map((item) => item.canonicalName),
    ...inventory.map((item) => item.displayName)
  ]);
  const seenIds = new Set<string>();
  for (const cluster of parsed.clusters) {
    if (seenIds.has(cluster.id) || cluster.detailsList.length !== cluster.contributionCount ||
      !cluster.detailsList.length || cluster.detailsList.some((title) => !recordNames.has(title))) {
      throw new Error("Analysis could not be matched to the public database records.");
    }
    seenIds.add(cluster.id);
  }

  await prisma.statsCache.upsert({
    where: { key: clusterCacheKey },
    update: { valueJson: parsed.clusters },
    create: { key: clusterCacheKey, valueJson: parsed.clusters }
  });
  return parsed.clusters;
}

export async function fetchContributionClusters(): Promise<ContributionMapPoint[]> {
  const cached = await prisma.statsCache.findUnique({ where: { key: clusterCacheKey } });
  if (!cached) return [];
  return z.array(clusterSchema).parse(cached.valueJson);
}

export async function reanalyzeClustersWithGemini() {
  await requireAdmin();
  try {
    await analyzeClustersWithGemini();
  } catch {
    // Keep the last successful analysis intact and display the failure on the map page.
    redirect("/map?analysis=unavailable");
  }
  revalidatePath("/map");
  redirect("/map?analysis=updated");
}
