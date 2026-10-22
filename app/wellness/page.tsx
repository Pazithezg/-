import type { Metadata } from "next";
import Link from "next/link";
import {
  evidenceLabel,
  evidenceTypes,
  evidenceTypeSchema,
  parseWellnessDetails,
  scenarioLabel,
  scenarioSchema,
  sourceUrlSchema,
  wellnessScenarios
} from "@/lib/wellness";
import styles from "./wellness.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "HRI Wellness Casebook",
  description: "คลังเคสการใช้หุ่นยนต์กับคน เพื่อศึกษาบทบาทการปฏิสัมพันธ์ ผลที่แหล่งข้อมูลรายงาน และข้อจำกัดก่อนออกแบบกิจกรรม HRI",
  alternates: { canonical: "/wellness" }
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type RobotOption = { id: string; canonicalName: string };
type PublicCase = {
  id: string;
  title: string;
  sourceUrl: string | null;
  organization: string | null;
  updatedAt: Date;
  wellnessDetails: unknown;
  relatedRobotModel: RobotOption | null;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function WellnessPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rawScenario = first(params.scenario);
  const rawEvidence = first(params.evidence);
  const scenario = scenarioSchema.safeParse(rawScenario);
  const evidence = evidenceTypeSchema.safeParse(rawEvidence);
  const selectedScenario = scenario.success ? scenario.data : "";
  const selectedEvidence = evidence.success ? evidence.data : "";
  const selectedRobot = first(params.robot).slice(0, 100);
  const invalidFilters = Boolean((rawScenario && !scenario.success) || (rawEvidence && !evidence.success));

  let records: PublicCase[] = [];
  let robots: RobotOption[] = [];
  let unavailable = false;

  try {
    const { prisma } = await import("@/lib/prisma");
    [records, robots] = await Promise.all([
      prisma.contribution.findMany({
        where: { contributionType: "wellness_case", verificationStatus: "APPROVED", visibility: "public" },
        include: { relatedRobotModel: { select: { id: true, canonicalName: true } } },
        orderBy: { updatedAt: "desc" },
        take: 500
      }),
      prisma.robotModel.findMany({ select: { id: true, canonicalName: true }, orderBy: { canonicalName: "asc" } })
    ]);
  } catch {
    unavailable = true;
  }

  // A malformed legacy record must not appear as a reviewed, structured case.
  const published = records.flatMap((record) => {
    const details = parseWellnessDetails(record.wellnessDetails);
    const source = sourceUrlSchema.safeParse(record.sourceUrl);
    return details && source.success && record.relatedRobotModel?.id === details.robotModelId
      ? [{ ...record, details, safeSourceUrl: source.data }]
      : [];
  });
  const matching = published.filter((record) => (
    (!selectedScenario || record.details.scenario === selectedScenario) &&
    (!selectedEvidence || record.details.evidenceType === selectedEvidence) &&
    (!selectedRobot || record.relatedRobotModel?.id === selectedRobot)
  ));
  const activeFilters = Boolean(selectedScenario || selectedEvidence || selectedRobot);
  const unknownRobot = selectedRobot && !robots.some((robot) => robot.id === selectedRobot);
  const robotCount = new Set(published.map((record) => record.relatedRobotModel?.id)).size;

  return (
    <div className={styles.page} lang="th">
      <header className={styles.hero}>
        <p className={styles.eyebrow}>HRI Wellness Casebook</p>
        <h1>เรียนรู้จากเคสจริง<br />ก่อนออกแบบกิจกรรมกับหุ่นยนต์</h1>
        <p className={styles.intro}>
          ศึกษาว่าใครใช้หุ่นยนต์อะไร คนกับหุ่นยนต์ทำอะไรด้วยกัน
          และแหล่งข้อมูลรายงานผลหรือข้อจำกัดอย่างไร เพื่อเตรียมกิจกรรม HRI ในบริบทของคุณ
        </p>
        <div className={styles.actions}>
          <Link className="button primary" href="/submit-data?type=wellness_case">แบ่งปันเคสพร้อมแหล่งอ้างอิง</Link>
          <Link href="/robots">ดูทะเบียนหุ่นยนต์ →</Link>
        </div>
        {!unavailable && (
          <div className={styles.stats} aria-label="ข้อมูลในคลังเคส">
            <p><strong>{published.length}</strong> เคสที่เผยแพร่</p>
            <p><strong>{robotCount}</strong> รุ่นหุ่นยนต์</p>
            <p><strong>{wellnessScenarios.length}</strong> สถานการณ์ HRI</p>
          </div>
        )}
      </header>

      {unavailable ? (
        <section className={styles.empty} role="status">
          <h2>ยังเชื่อมต่อคลังเคสไม่ได้</h2>
          <p>ไม่สามารถอ่านข้อมูลจากฐานข้อมูลได้ในขณะนี้ กรุณาลองใหม่ภายหลัง ข้อมูลตัวอย่างไม่ได้ถูกนำมาแสดงแทนข้อมูลจริง</p>
          <Link className="button" href="/wellness">ลองโหลดอีกครั้ง</Link>
        </section>
      ) : (
        <>
          <form className={styles.filters} action="/wellness" method="get" aria-label="ค้นหาเคส HRI Wellness">
            <label htmlFor="wellness-scenario">
              สถานการณ์ที่สนใจ
              <select id="wellness-scenario" name="scenario" defaultValue={selectedScenario}>
                <option value="">ทุกสถานการณ์</option>
                {wellnessScenarios.map((item) => <option key={item.value} value={item.value}>{item.labelTh}</option>)}
              </select>
            </label>
            <label htmlFor="wellness-robot">
              หุ่นยนต์
              <select id="wellness-robot" name="robot" defaultValue={selectedRobot}>
                <option value="">ทุกรุ่น</option>
                {unknownRobot && <option value={selectedRobot}>ไม่พบหุ่นยนต์รุ่นที่เลือก</option>}
                {robots.map((robot) => <option key={robot.id} value={robot.id}>{robot.canonicalName}</option>)}
              </select>
            </label>
            <label htmlFor="wellness-evidence">
              ประเภทแหล่งข้อมูล
              <select id="wellness-evidence" name="evidence" defaultValue={selectedEvidence}>
                <option value="">ทุกประเภท</option>
                {evidenceTypes.map((item) => <option key={item.value} value={item.value}>{item.labelTh}</option>)}
              </select>
            </label>
            <div className={styles.filterActions}>
              <button className="primary" type="submit">ค้นหาเคส</button>
              {activeFilters && <Link href="/wellness">ล้างตัวกรอง</Link>}
            </div>
          </form>

          {invalidFilters && <p className="notice" role="status">ตัวกรองบางรายการไม่ถูกต้อง ระบบแสดงผลโดยใช้เฉพาะตัวกรองที่รองรับ</p>}

          <div className={styles.resultsHeading}>
            <h2>{activeFilters ? "เคสที่ตรงกับตัวเลือก" : "สำรวจเคสการใช้งาน"}</h2>
            <p className="muted" aria-live="polite">{matching.length} เคส</p>
          </div>

          {matching.length ? (
            <div className={styles.cards}>
              {matching.map((record, index) => (
                <article key={record.id} className={styles.caseCard}>
                  <div className={styles.cardTop}>
                    <span className={styles.scenarioBadge}>{scenarioLabel(record.details.scenario, "th")}</span>
                    <span className={styles.caseNumber}>CASE {String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <h3><Link href={`/wellness/${encodeURIComponent(record.id)}`}>{record.title}</Link></h3>
                  <div className={styles.caseMeta}>
                    <span>{record.relatedRobotModel?.canonicalName}</span>
                    <span>{evidenceLabel(record.details.evidenceType, "th")}</span>
                  </div>
                  <p className={styles.excerpt}>{record.details.interactionDescription}</p>
                  <div className={styles.limitation}>
                    <strong>ข้อจำกัดที่ควรรู้</strong>
                    <p>{record.details.limitations}</p>
                  </div>
                  <footer className={styles.cardFooter}>
                    <Link href={`/wellness/${encodeURIComponent(record.id)}`}>อ่านเคสและบทเรียน →</Link>
                    <a href={record.safeSourceUrl} target="_blank" rel="noopener noreferrer">แหล่งข้อมูลต้นฉบับ ↗</a>
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <section className={styles.empty}>
              <h2>{activeFilters ? "ยังไม่มีเคสที่ตรงกับตัวเลือกนี้" : "คลังเคสพร้อมรับบทเรียนแรก"}</h2>
              <p>{activeFilters
                ? "ลองเปลี่ยนสถานการณ์ หุ่นยนต์ หรือประเภทแหล่งข้อมูล หากคุณมีเคสที่เกี่ยวข้อง สามารถส่งให้ผู้ดูแลตรวจและเผยแพร่ได้"
                : "เคสจะแสดงเมื่อผ่านการตรวจเนื้อหาและแหล่งอ้างอิงโดยผู้ดูแลแล้ว คุณสามารถส่งรายงานการใช้งานหรืองานวิจัยที่ระบุบทบาทคนกับหุ่นยนต์ได้"}</p>
              <div className={styles.actions} style={{ justifyContent: "center" }}>
                {activeFilters && <Link className="button" href="/wellness">ดูทุกเคส</Link>}
                <Link className="button primary" href="/submit-data?type=wellness_case">ส่งเคสให้ตรวจ</Link>
              </div>
            </section>
          )}
        </>
      )}

      <aside className={styles.evidenceNote}>
        <h2>อ่านเคสอย่างเข้าใจหลักฐาน</h2>
        <p>แต่ละเคสสรุปสิ่งที่แหล่งข้อมูลรายงาน การผ่านการตรวจเผยแพร่หมายถึงการตรวจเนื้อหาและที่มา
          ผลที่รายงานอาจเป็นเพียงการสาธิตหรือข้อสังเกต และไม่รับรองผลด้านสุขภาพหรือความเหมาะสมทางการแพทย์
          ควรอ่านต้นฉบับและข้อจำกัดก่อนนำไปออกแบบกิจกรรม</p>
      </aside>
    </div>
  );
}
