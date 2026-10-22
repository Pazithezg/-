"use client";

import { useActionState, useState } from "react";
import { submitCasebookData } from "@/app/actions";
import { evidenceTypes, wellnessScenarios } from "@/lib/wellness";

type Props = { robots: { id: string; canonicalName: string }[]; enabled: boolean; initialType: string };

export default function SubmissionForm({ robots, enabled, initialType }: Props) {
  const [type, setType] = useState(initialType);
  const [state, action, pending] = useActionState(submitCasebookData, { success: false, message: "" });
  const isCase = type === "wellness_case";
  return <form className="form panel" action={action} style={{ gap: 16 }}>
    <h2>{isCase ? "รายละเอียดเคส" : "ส่งผลงาน / Contribution"}</h2>
    {state.message && <div className="notice" role={state.success ? "status" : "alert"}>{state.message}{state.success && <p>ดูสถานะและหมายเหตุผู้ตรวจได้ในตารางด้านล่าง</p>}</div>}
    <fieldset disabled={!enabled || pending} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 16, minWidth: 0 }}>
      <label>ประเภทข้อมูล<select name="submissionType" value={type} onChange={(event) => setType(event.target.value)}><option value="wellness_case">เคส HRI Wellness</option><option value="contribution_claim">ผลงานวิจัย / โครงการ / Repository</option></select></label>
      <label>ชื่อเรื่อง<input name="title" required minLength={3} maxLength={250} placeholder="เช่น การสื่อสารผ่านหุ่นยนต์ระหว่างผู้ดูแลกับผู้สูงอายุ" /></label>
      <label>ลิงก์แหล่งอ้างอิง<input name="url" type="url" required maxLength={2000} placeholder="https://..." /></label>
      <label>หุ่นยนต์ที่เกี่ยวข้อง<select name="robotModelId" required={isCase} defaultValue=""><option value="">{isCase ? "เลือกหุ่นยนต์" : "ไม่ระบุ"}</option>{robots.map((robot) => <option key={robot.id} value={robot.id}>{robot.canonicalName}</option>)}</select></label>
      <label>หน่วยงานที่รายงาน (ถ้ามี)<input name="organization" maxLength={250} placeholder="ชื่อหน่วยงาน ไม่ใส่ข้อมูลติดต่อส่วนบุคคล" /></label>
      {isCase ? <>
        <label>สถานการณ์<select name="scenario" defaultValue={wellnessScenarios[0].value}>{wellnessScenarios.map((item) => <option key={item.value} value={item.value}>{item.labelTh}</option>)}</select></label>
        <label>กลุ่มผู้ใช้<input name="participantGroup" required minLength={2} maxLength={250} placeholder="เช่น ผู้สูงอายุและผู้ดูแล ไม่ระบุชื่อบุคคล" /></label>
        <label>บริบทหรือสถานที่ประเภทใด<input name="setting" required minLength={2} maxLength={250} placeholder="เช่น บ้าน หรือสถานดูแลผู้สูงอายุ" /></label>
        <label>คนกับหุ่นยนต์ทำอะไรด้วยกัน<textarea name="interactionDescription" required minLength={10} maxLength={4000} rows={4} /></label>
        <label>สิ่งที่แหล่งข้อมูลรายงาน<textarea name="reportedOutcome" required minLength={10} maxLength={4000} rows={4} placeholder="หากไม่มีผลประเมิน ให้ระบุว่าไม่ได้รายงานผลประเมิน" /></label>
        <label>ข้อจำกัดและสิ่งที่ยังไม่ทราบ<textarea name="limitations" required minLength={10} maxLength={4000} rows={4} /></label>
        <label>ประเภทหลักฐาน<select name="evidenceType" defaultValue={evidenceTypes[0].value}>{evidenceTypes.map((item) => <option key={item.value} value={item.value}>{item.labelTh}</option>)}</select></label>
      </> : <>
        <label>ประเภทผลงาน<select name="contributionType" defaultValue="field_observation"><option value="field_observation">Field observation</option><option value="research_paper">Research paper</option><option value="software_repository">Software repository</option><option value="robot_deployment">Robot deployment</option><option value="dataset">Dataset</option></select></label>
        <label>คำอธิบายผลงาน<textarea name="notes" required minLength={10} maxLength={4000} rows={5} /></label>
      </>}
      <button className="primary" type="submit">{pending ? "กำลังส่ง…" : "ส่งให้ผู้ดูแลตรวจสอบ"}</button>
    </fieldset>
  </form>;
}
