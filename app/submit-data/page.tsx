import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SubmissionForm from "./SubmissionForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Submit a Wellness Case | Thailand Humanoid Atlas",
  description: "Share a sourced human–robot interaction case for human review and publication.",
  alternates: { canonical: "/submit-data" }
};

export default async function SubmitDataPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const params = await searchParams;
  const session = await getSession();
  let robots: { id: string; canonicalName: string }[] = [];
  let submissions: { id: string; submissionType: string; title: string; status: string; reviewNotes: string | null; createdAt: Date; publishedContribution: { id: string } | null }[] = [];
  let unavailable = false;
  try {
    robots = await prisma.robotModel.findMany({ select: { id: true, canonicalName: true }, orderBy: { canonicalName: "asc" } });
    if (session) {
      submissions = await prisma.submittedData.findMany({
        where: { submittedById: session.userId }, orderBy: { createdAt: "desc" }, take: 20,
        select: { id: true, submissionType: true, title: true, status: true, reviewNotes: true, createdAt: true, publishedContribution: { select: { id: true } } }
      });
    }
  } catch {
    unavailable = true;
  }
  const initialType = params.type === "contribution_claim" ? "contribution_claim" : "wellness_case";
  return <>
    <div className="topline"><div><h1>แบ่งปันเคส HRI Wellness</h1><p className="muted">ส่งกรณีใช้งานพร้อมแหล่งอ้างอิง ผู้ดูแลจะตรวจสอบก่อนเผยแพร่ใน Casebook</p></div><Link className="button" href="/wellness">ดู Casebook</Link></div>
    {!session && <div className="notice"><p>เข้าสู่ระบบหรือสร้างบัญชีด้วยอีเมลและรหัสผ่านก่อนส่งข้อมูล</p><Link className="button primary" href="/profile?from=%2Fsubmit-data">เข้าสู่ระบบ / สร้างบัญชี</Link></div>}
    {unavailable && <div className="notice" role="alert">ฐานข้อมูลยังไม่พร้อม จึงยังส่งข้อมูลไม่ได้ กรุณาลองใหม่เมื่อเชื่อมต่อได้</div>}
    <div className="two" style={{ gap: 20, alignItems: "start" }}>
      <SubmissionForm robots={robots} enabled={!!session && !unavailable} initialType={initialType} />
      <aside className="panel"><h2>ก่อนส่งเคส</h2><ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
        <li>เลือกหุ่นยนต์จากทะเบียน และอธิบายว่าคนกับหุ่นยนต์มีปฏิสัมพันธ์กันอย่างไร</li>
        <li>ระบุสิ่งที่แหล่งข้อมูลรายงาน แยกความสามารถออกจากผลที่ทดสอบแล้ว</li>
        <li>หากไม่มีผลประเมิน ให้ระบุว่า “แหล่งข้อมูลไม่ได้รายงานผลประเมิน”</li>
        <li>ระบุข้อจำกัดและประเภทหลักฐาน พร้อมลิงก์ต้นทางที่เปิดตรวจได้</li>
        <li>ไม่ใส่ชื่อผู้ป่วย ข้อมูลสุขภาพส่วนบุคคล ภาพบุคคล หรือช่องทางติดต่อในเนื้อหาเคส</li>
      </ul><p className="muted">อีเมลบัญชีใช้ติดตามรายการของคุณ และจะไม่ถูกคัดลอกลงการ์ดสาธารณะ การอนุมัติเป็นการตรวจความครบถ้วนของแหล่งข้อมูล ไม่ใช่การรับรองผลทางการแพทย์</p></aside>
    </div>
    {session && <section className="panel" style={{ marginTop: 24 }}><h2>รายการที่คุณส่ง</h2>
      <div className="table-wrap"><table><thead><tr><th>ชื่อเรื่อง</th><th>สถานะ</th><th>หมายเหตุผู้ตรวจ</th><th>วันที่</th></tr></thead><tbody>
        {submissions.map((item) => <tr key={item.id}><td>{item.title}{item.status === "APPROVED" && item.publishedContribution && <div><Link href={item.submissionType === "wellness_case" ? `/wellness/${item.publishedContribution.id}` : `/contributions?q=${encodeURIComponent(item.title)}`}>เปิดรายการที่เผยแพร่</Link></div>}</td><td><span className={`badge ${item.status === "APPROVED" ? "ok" : "warn"}`}>{item.status}</span></td><td>{item.reviewNotes || "—"}</td><td>{item.createdAt.toLocaleDateString("th-TH")}</td></tr>)}
        {!submissions.length && <tr><td colSpan={4}>ยังไม่มีรายการที่ส่ง</td></tr>}
      </tbody></table></div></section>}
  </>;
}
