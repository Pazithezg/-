import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { evidenceLabel, parseWellnessDetails, scenarioLabel, sourceUrlSchema } from "@/lib/wellness";
import PrintCaseButton from "../PrintCaseButton";
import styles from "../wellness.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "รายละเอียดเคส HRI Wellness",
  description: "บริบทการใช้งาน การปฏิสัมพันธ์ ผลที่รายงาน ข้อจำกัด และแหล่งอ้างอิงของเคส HRI Wellness"
};

export default async function WellnessCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let record;
  try {
    const { prisma } = await import("@/lib/prisma");
    record = await prisma.contribution.findFirst({
      where: { id, contributionType: "wellness_case", verificationStatus: "APPROVED", visibility: "public" },
      include: { relatedRobotModel: { select: { id: true, canonicalName: true, manufacturer: true, developerOrg: true } } }
    });
  } catch {
    return (
      <section className={`${styles.page} ${styles.empty}`} lang="th" role="status">
        <h1>ยังเปิดเคสนี้ไม่ได้</h1>
        <p>ไม่สามารถเชื่อมต่อฐานข้อมูลได้ในขณะนี้ กรุณาลองใหม่ภายหลัง</p>
        <Link className="button" href="/wellness">กลับไปคลังเคส</Link>
      </section>
    );
  }

  if (!record) notFound();
  const details = parseWellnessDetails(record.wellnessDetails);
  const source = sourceUrlSchema.safeParse(record.sourceUrl);
  if (!details || !source.success || record.relatedRobotModel?.id !== details.robotModelId) notFound();
  const robot = record.relatedRobotModel;

  return (
    <article className={styles.page} lang="th">
      <Link className={styles.breadcrumb} href="/wellness">← กลับไปคลังเคส HRI Wellness</Link>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>HRI Wellness Casebook</p>
        <p><span className={styles.scenarioBadge}>{scenarioLabel(details.scenario, "th")}</span></p>
        <h1>{record.title}</h1>
        <p className={styles.intro}>{robot.canonicalName} · {evidenceLabel(details.evidenceType, "th")}</p>
        <div className={styles.actions}>
          <a className="button primary" href={source.data} target="_blank" rel="noopener noreferrer">อ่านแหล่งข้อมูลต้นฉบับ ↗</a>
          <PrintCaseButton />
        </div>
      </header>

      <div className={styles.detailGrid}>
        <div>
          <section className={styles.detailSection}>
            <h2>บริบทของเคส</h2>
            <dl className={styles.contextList}>
              <dt>หุ่นยนต์</dt>
              <dd><Link href={`/robots#robot-${encodeURIComponent(robot.id)}`}>{robot.canonicalName} → ดูในทะเบียน</Link></dd>
              <dt>กลุ่มผู้มีส่วนร่วม</dt><dd>{details.participantGroup}</dd>
              <dt>สถานที่ / บริบท</dt><dd>{details.setting}</dd>
              <dt>สถานการณ์ HRI</dt><dd>{scenarioLabel(details.scenario, "th")}</dd>
            </dl>
          </section>
          <section className={styles.detailSection}>
            <h2>คนกับหุ่นยนต์ทำอะไรด้วยกัน</h2>
            <p className={styles.detailText}>{details.interactionDescription}</p>
          </section>
          <section className={styles.detailSection}>
            <h2>สิ่งที่แหล่งข้อมูลรายงาน</h2>
            <p className={styles.detailText}>{details.reportedOutcome}</p>
          </section>
          <section className={styles.detailSection} style={{ borderLeft: "4px solid #bca16e" }}>
            <h2>ข้อจำกัดและสิ่งที่ยังไม่ทราบ</h2>
            <p className={styles.detailText}>{details.limitations}</p>
          </section>
        </div>

        <aside className={styles.provenance} aria-label="ที่มาและสถานะเคส">
          <h2>ที่มาและการตรวจเผยแพร่</h2>
          <span className={styles.reviewed}>ผ่านการตรวจเผยแพร่</span>
          <dl>
            <dt>ประเภทแหล่งข้อมูล</dt><dd>{evidenceLabel(details.evidenceType, "th")}</dd>
            <dt>หน่วยงานที่ระบุในเคส</dt><dd>{record.organization || details.organization || "ไม่ระบุ"}</dd>
            <dt>อัปเดตข้อมูลในคลัง</dt><dd><time dateTime={record.updatedAt.toISOString()}>{record.updatedAt.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" })}</time></dd>
            <dt>ผู้พัฒนา / ผู้ผลิตหุ่นยนต์</dt><dd>{robot.developerOrg || robot.manufacturer || "ไม่ระบุในทะเบียน"}</dd>
          </dl>
          <a className={styles.sourceLink} href={source.data} target="_blank" rel="noopener noreferrer">{new URL(source.data).hostname} ↗</a>
          <p className="muted" style={{ fontSize: 12 }}>ตรวจสอบรายละเอียดและวันที่ของเหตุการณ์จากต้นฉบับ วันที่อัปเดตในคลังไม่ใช่วันที่ทดลอง</p>
          <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "22px 0" }} />
          <Link href={`/wellness?robot=${encodeURIComponent(robot.id)}`}>ดูเคสอื่นของ {robot.canonicalName} →</Link>
        </aside>
      </div>

      <aside className={styles.evidenceNote}>
        <h2>การตรวจเผยแพร่บอกอะไร</h2>
        <p>สถานะนี้ใช้กับการตรวจเนื้อหาและแหล่งที่มาก่อนแสดงในคลัง การสาธิต ความสามารถที่รายงาน และข้อสังเกตจากภาคสนามอาจมีหลักฐานต่างกัน
          เคสนี้ไม่ได้รับรองผลการรักษาหรือยืนยันความเหมาะสมสำหรับผู้ใช้ทุกกลุ่ม ควรประเมินบริบทและข้อจำกัดร่วมกับผู้รับผิดชอบกิจกรรม</p>
      </aside>
      <div className={styles.actions}>
        <Link className="button" href="/wellness">สำรวจเคสอื่น</Link>
        <Link href="/submit-data?type=wellness_case">มีบทเรียนเพิ่มเติม? ส่งเคสให้ตรวจ →</Link>
      </div>
    </article>
  );
}
