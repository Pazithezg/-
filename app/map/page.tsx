import { cookies } from "next/headers";
import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getTranslation } from "@/lib/translations";
import GoogleMapClient from "./GoogleMapClient";
import { fetchContributionClusters, reanalyzeClustersWithGemini, type ContributionMapPoint } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ecosystem Contribution Map | Thailand Humanoid Atlas",
  description: "Geospatial visualization and AI-clustered mapping of humanoid robotics research, development, and inventories across Thailand",
  alternates: { canonical: "/map" },
  openGraph: {
    title: "Ecosystem Contribution Map | Thailand Humanoid Atlas",
    description: "Geospatial visualization and AI-clustered mapping of humanoid robotics research, development, and inventories across Thailand",
    url: "/map",
    siteName: "Thailand Humanoid Atlas",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "Thailand Humanoid Atlas Logo"
      }
    ],
    locale: "en_US",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Ecosystem Contribution Map | Thailand Humanoid Atlas",
    description: "Geospatial visualization and AI-clustered mapping of humanoid robotics research, development, and inventories across Thailand",
    images: ["/logo.png"]
  }
};const localT = {
  en: {
    clustersStat: "Ecosystem Clusters",
    analyzedStat: "Available Public Database Items",
    geolocatedStat: "Geolocated Entities",
    engineStat: "Analysis Engine",
    noticeText: "Saved AI analysis groups public database records by organization. Locations and summaries are AI estimates that require source checking before use. Browsing this page does not run a new analysis.",
    buttonText: "Trigger Gemini AI Ecosystem Analysis",
    buttonMuted: "Analyzes approved public contributions, robot models and public inventories. Requires administrator access and a configured Gemini API key.",
    thHeaderCluster: "Cluster / Institution",
    thHeaderLocation: "Location",
    thHeaderType: "Type",
    thHeaderRecords: "Records",
    thHeaderSummary: "Ecosystem Summary",
    itemsPrefix: "Items:",
    emptyState: "No saved ecosystem analysis is available. An administrator can run an analysis when database and AI access are ready.",
    unavailable: "Map data could not be loaded. No replacement locations are displayed. Please try again later.",
    analysisError: "Analysis did not complete. Check service access and configuration; the last successful saved analysis has been preserved.",
    analysisUpdated: "The saved map analysis has been updated. Locations and summaries still require source verification.",
    signIn: "Administrator sign-in",
    engine: "Gemini · AI estimates"
  },
  th: {
    clustersStat: "คลัสเตอร์ระบบนิเวศ",
    analyzedStat: "รายการสาธารณะในฐานข้อมูล",
    geolocatedStat: "พิกัดหน่วยงานทั้งหมด",
    engineStat: "เครื่องมือวิเคราะห์ AI",
    noticeText: "แผนที่ใช้ผลวิเคราะห์ AI ที่บันทึกไว้เพื่อจัดกลุ่มข้อมูลสาธารณะตามหน่วยงาน พิกัดและสรุปเป็นการประมาณโดย AI ควรตรวจสอบต้นทางก่อนใช้งาน การเปิดหน้านี้ไม่ได้เริ่มวิเคราะห์ใหม่",
    buttonText: "เริ่มต้นการวิเคราะห์ระบบนิเวศด้วย Gemini AI",
    buttonMuted: "วิเคราะห์ผลงานสาธารณะที่อนุมัติแล้ว ทะเบียนหุ่นยนต์ และคลังสาธารณะ ต้องใช้บัญชีผู้ดูแลและคีย์ Gemini ที่ตั้งค่าไว้",
    thHeaderCluster: "คลัสเตอร์ / สถาบัน",
    thHeaderLocation: "สถานที่ตั้ง",
    thHeaderType: "ประเภท",
    thHeaderRecords: "จำนวนรายการ",
    thHeaderSummary: "สรุปภาพรวมระบบนิเวศ",
    itemsPrefix: "รายการย่อย:",
    emptyState: "ยังไม่มีผลวิเคราะห์แผนที่ที่บันทึกไว้ ผู้ดูแลสามารถเริ่มวิเคราะห์เมื่อฐานข้อมูลและบริการ AI พร้อมใช้งาน",
    unavailable: "ยังโหลดข้อมูลแผนที่ไม่ได้ ระบบไม่แสดงตำแหน่งอื่นแทน กรุณาลองใหม่ภายหลัง",
    analysisError: "วิเคราะห์ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อและการตั้งค่าบริการ โดยยังเก็บผลวิเคราะห์ครั้งล่าสุดที่สำเร็จไว้",
    analysisUpdated: "บันทึกผลวิเคราะห์แผนที่แล้ว พิกัดและสรุปยังต้องตรวจสอบกับแหล่งข้อมูล",
    signIn: "เข้าสู่ระบบผู้ดูแล",
    engine: "Gemini · ตำแหน่งประมาณโดย AI"
  }
};

export default async function MapPage({ searchParams }: { searchParams: Promise<{ analysis?: string }> }) {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("lang")?.value || "en") as "en" | "th";
  const t = getTranslation(lang);

  const [params, session] = await Promise.all([searchParams, getSession()]);
  let clusters: ContributionMapPoint[] = [];
  let totalAvailable: number | null = null;
  let unavailable = false;
  try {
    const [saved, contributionCount, robotCount, inventoryCount] = await Promise.all([
      fetchContributionClusters(),
      prisma.contribution.count({ where: { visibility: "public", verificationStatus: "APPROVED" } }),
      prisma.robotModel.count(),
      prisma.ownedInventory.count({ where: { visibility: "public" } })
    ]);
    clusters = saved;
    totalAvailable = contributionCount + robotCount + inventoryCount;
  } catch {
    unavailable = true;
  }

  // 3. Count unique geolocated organizations
  const uniqueOrgs = new Set(clusters.map((c) => c.organization));

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  return (
    <>
      <div className="topline">
        <div>
          <h1>{t.mapTitle}</h1>
          <p className="muted">{t.mapDesc}</p>
        </div>
      </div>

      <div className="grid" style={{ marginBottom: 12 }}>
        <div className="panel motion-panel">
          <p className="muted" style={{ margin: 0 }}>{localT[lang].clustersStat}</p>
          <div className="stat">{unavailable ? "—" : clusters.length}</div>
        </div>
        <div className="panel motion-panel">
          <p className="muted" style={{ margin: 0 }}>{localT[lang].analyzedStat}</p>
          <div className="stat">{totalAvailable ?? "—"}</div>
        </div>
        <div className="panel motion-panel">
          <p className="muted" style={{ margin: 0 }}>{localT[lang].geolocatedStat}</p>
          <div className="stat">{unavailable ? "—" : uniqueOrgs.size}</div>
        </div>
        <div className="panel motion-panel">
          <p className="muted" style={{ margin: 0 }}>{localT[lang].engineStat}</p>
          <div className="stat" style={{ fontSize: 15, marginTop: 10 }}>{localT[lang].engine}</div>
        </div>
      </div>

      <div className="notice" style={{ marginBottom: 12 }}>
        {localT[lang].noticeText}
      </div>
      {unavailable && <p className="notice" role="alert">{localT[lang].unavailable}</p>}
      {params.analysis === "unavailable" && <p className="notice" role="alert">{localT[lang].analysisError}</p>}
      {params.analysis === "updated" && <p className="notice" role="status">{localT[lang].analysisUpdated}</p>}

      {session?.role === "ADMIN" ? <form action={reanalyzeClustersWithGemini} className="toolbar" style={{ marginTop: 0 }}>
        <button className="primary" type="submit">
          <Sparkles size={16} aria-hidden="true" />
          {localT[lang].buttonText}
        </button>
        <span className="muted">{localT[lang].buttonMuted}</span>
      </form> : <p><Link href="/admin-login?from=%2Fmap">{localT[lang].signIn}</Link></p>}

      {clusters.length > 0 && <GoogleMapClient apiKey={apiKey} points={clusters} lang={lang} />}

      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table>
          <thead>
            <tr>
              <th>{localT[lang].thHeaderCluster}</th>
              <th>{localT[lang].thHeaderLocation}</th>
              <th>{localT[lang].thHeaderType}</th>
              <th style={{ textAlign: "center" }}>{localT[lang].thHeaderRecords}</th>
              <th>{localT[lang].thHeaderSummary}</th>
            </tr>
          </thead>
          <tbody>
            {clusters.map((cluster) => (
              <tr key={cluster.id}>
                <td style={{ fontWeight: "700" }}>{cluster.title}</td>
                <td>{cluster.locationLabel}</td>
                <td>
                  <span className="badge" style={{ fontSize: "11px", fontWeight: "600", background: "rgba(74, 124, 89, 0.1)", color: "var(--accent)", borderColor: "rgba(74, 124, 89, 0.2)" }}>{cluster.contributorType}</span>
                </td>
                <td style={{ textAlign: "center", fontWeight: "800" }}>{cluster.contributionCount}</td>
                <td style={{ fontSize: "13px", lineHeight: "1.45" }}>
                  {cluster.summary}
                  <div className="muted" style={{ fontSize: "11px", marginTop: 6 }}>
                    <strong>{localT[lang].itemsPrefix}</strong> {cluster.detailsList.join(", ")}
                  </div>
                </td>
              </tr>
            ))}
            {!clusters.length ? (
              <tr>
                <td colSpan={5} className="empty">
                  {localT[lang].emptyState}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
