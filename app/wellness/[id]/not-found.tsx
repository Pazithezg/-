import Link from "next/link";

export default function CaseNotFound() {
  return <section className="panel" lang="th" style={{ maxWidth: 640, margin: "32px auto" }}>
    <h1>ไม่พบเคสที่เผยแพร่</h1>
    <p>ลิงก์นี้ไม่มีเคสสาธารณะ เคสอาจยังอยู่ระหว่างตรวจสอบหรือถูกถอนเผยแพร่แล้ว</p>
    <Link className="button primary" href="/wellness">กลับไปคลังเคส</Link>
  </section>;
}
