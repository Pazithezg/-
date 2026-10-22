import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getTranslation } from "@/lib/translations";
import { requireAdmin } from "@/lib/auth";
import { evidenceTypes, sourceUrlSchema, wellnessScenarios } from "@/lib/wellness";
import {
  updateSubmissionStatus,
  upsertContributionAction,
  upsertRobotModelAction,
  upsertSourceRecordAction,
  upsertSubmittedDataAction
} from "@/app/actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  collection?: string;
  selectedId?: string;
  reviewError?: string;
  saved?: string;
}>;

type CmsCollection = "source-records" | "robot-models" | "contributions" | "submitted-data";

const collectionLabels: Record<CmsCollection, string> = {
  "source-records": "Source Records",
  "robot-models": "Robot Models",
  contributions: "Contributions",
  "submitted-data": "Submitted Data"
};

const sourceTypes = ["SEED", "RSS", "GDELT", "YOUTUBE", "OPENALEX", "GITHUB", "MANUAL_SOCIAL", "SUBMISSION", "WEB"] as const;
const relevanceStatuses = ["PENDING", "ACCEPTED", "REJECTED", "UNCERTAIN"] as const;
const reviewStatuses = ["QUEUED", "FETCHING", "ANALYZED", "NEEDS_REVIEW", "APPROVED", "REJECTED", "FAILED"] as const;
const visibilityOptions = ["public", "private"] as const;
const robotStatusOptions = ["observed_in_thailand", "developed_in_thailand", "imported_for_evaluation", "unknown"] as const;

function toLocalDateTime(value?: Date | null) {
  if (!value) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = value.getFullYear();
  const month = pad(value.getMonth() + 1);
  const day = pad(value.getDate());
  const hours = pad(value.getHours());
  const minutes = pad(value.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default async function AdminConsolePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdmin();
  const cookieStore = await cookies();
  const lang = (cookieStore.get("lang")?.value || "en") as "en" | "th";
  const t = getTranslation(lang);
  const isAdmin = session.role === "ADMIN";

  const localT = {
    en: {
      denied: "Access Denied",
      deniedDesc: "You must have the ADMIN role to review submissions or edit CMS content.",
      goProfile: "Go to Profile & Login as Admin",
      addNew: "Add new record",
      save: "Save record",
      create: "Create record",
      list: "Admin records",
      editor: "Record editor",
      empty: "No records found for this collection.",
      dbOffline: "Database connection failed. CMS content cannot be mocked because this page edits live records.",
      sourceRecord: "Source Record",
      robotModel: "Robot Model",
      contribution: "Contribution",
      submittedData: "Submitted Data"
    },
    th: {
      denied: "ปฏิเสธการเข้าถึง",
      deniedDesc: "คุณต้องมีบทบาทผู้ดูแลระบบ (ADMIN) เพื่อแก้ไขข้อมูล CMS",
      goProfile: "ไปที่โปรไฟล์และเข้าสู่ระบบในฐานะผู้ดูแล",
      addNew: "เพิ่มรายการใหม่",
      save: "บันทึกรายการ",
      create: "สร้างรายการ",
      list: "รายการในคอลเลกชัน",
      editor: "ตัวแก้ไขข้อมูล",
      empty: "ไม่พบรายการในคอลเลกชันนี้",
      dbOffline: "การเชื่อมต่อฐานข้อมูลล้มเหลว หน้านี้แก้ไขข้อมูลจริงจึงไม่สามารถใช้ข้อมูลตัวอย่างได้",
      sourceRecord: "บันทึกแหล่งข้อมูล",
      robotModel: "โมเดลหุ่นยนต์",
      contribution: "รายการผลงาน",
      submittedData: "ข้อมูลที่ส่งมา"
    }
  }[lang];

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <div style={{ maxWidth: "560px", margin: "40px auto", textAlign: "center" }} className="panel">
          <h1 style={{ color: "var(--danger)" }}>{localT.denied}</h1>
          <p className="muted" style={{ margin: "14px 0" }}>{localT.deniedDesc}</p>
          <Link href="/profile" className="button primary">{localT.goProfile}</Link>
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const collection = (["source-records", "robot-models", "contributions", "submitted-data"] as const).includes(
    params.collection as CmsCollection
  )
    ? (params.collection as CmsCollection)
    : "submitted-data";
  const selectedId = params.selectedId || "new";
  const isNew = selectedId === "new";

  let dbOffline = false;
  let records: any[] = [];
  let robotOptions: Array<{ id: string; canonicalName: string }> = [];

  try {
    if (collection === "source-records") {
      records = await prisma.sourceRecord.findMany({
        orderBy: { updatedAt: "desc" },
        take: 100
      });
    } else if (collection === "robot-models") {
      records = await prisma.robotModel.findMany({
        orderBy: { updatedAt: "desc" },
        take: 100
      });
    } else if (collection === "contributions") {
      records = await prisma.contribution.findMany({
        include: { relatedRobotModel: true },
        orderBy: { updatedAt: "desc" },
        take: 100
      });
      robotOptions = await prisma.robotModel.findMany({
        select: { id: true, canonicalName: true },
        orderBy: { canonicalName: "asc" }
      });
    } else {
      [records, robotOptions] = await Promise.all([
        prisma.submittedData.findMany({ orderBy: { updatedAt: "desc" }, take: 100 }),
        prisma.robotModel.findMany({ select: { id: true, canonicalName: true }, orderBy: { canonicalName: "asc" } })
      ]);
    }
  } catch {
    dbOffline = true;
  }

  const selectedItem = isNew ? null : records.find((record) => record.id === selectedId) ?? null;
  const details: Record<string, unknown> = selectedItem?.payloadJson && typeof selectedItem.payloadJson === "object" && !Array.isArray(selectedItem.payloadJson) ? selectedItem.payloadJson : {};
  const detailText = (key: string) => typeof details[key] === "string" ? details[key] as string : "";
  const structuredCase = selectedItem?.submissionType === "wellness_case";
  const structuredClaim = selectedItem?.submissionType === "contribution_claim";
  const selectedSource = sourceUrlSchema.safeParse(selectedItem?.url);
  const reviewError = typeof params.reviewError === "string" ? params.reviewError.replace(/[\u0000-\u001f]/g, " ").slice(0, 400) : null;

  const collectionTabs = [
    { key: "submitted-data" as const, label: "Review Queue" },
    { key: "source-records" as const, label: localT.sourceRecord },
    { key: "robot-models" as const, label: localT.robotModel },
    { key: "contributions" as const, label: localT.contribution }
  ];

  const titleForCollection = collectionLabels[collection];

  return (
    <div className="admin-page">
      <div className="topline">
        <div>
          <h1>{t.adminTitle}</h1>
          <p className="muted">{t.adminDesc} {t.cmsDesc}</p>
        </div>
        <Link className="button primary" href="/admin?collection=submitted-data">
          Review queue
        </Link>
      </div>

      {dbOffline && (
        <div className="notice" style={{ backgroundColor: "#fff4f4", borderLeftColor: "var(--danger)", marginBottom: "16px" }}>
          <strong>Database Offline:</strong> {localT.dbOffline}
        </div>
      )}

      {reviewError && <div role="alert" className="notice" style={{ borderLeftColor: "var(--danger)", marginBottom: 16 }}>{reviewError}</div>}
      {params.saved === "review" && <div role="status" className="notice" style={{ marginBottom: 16 }}>Changes saved. This submission is now awaiting review; any previous publication was withdrawn. Check the saved details, then use Approve and publish.</div>}

      <div className="toolbar" style={{ marginTop: 0 }}>
        {collectionTabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin?collection=${tab.key}${selectedItem ? `&selectedId=${selectedItem.id}` : "&selectedId=new"}`}
            className={`button ${collection === tab.key ? "primary" : ""}`}
          >
            {tab.label}
          </Link>
        ))}
        <Link href={`/admin?collection=${collection}&selectedId=new`} className="button">
          {localT.addNew}
        </Link>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(360px, 0.8fr)" }}>
        <section className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "baseline" }}>
            <div>
              <h2>{localT.list}</h2>
              <div className="muted" style={{ fontSize: "12px" }}>{titleForCollection}</div>
            </div>
            <div className="badge">{records.length} items</div>
          </div>

          <div className="table-wrap" style={{ marginTop: "12px" }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Meta</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    style={{
                      background: selectedItem?.id === record.id ? "var(--surface-muted)" : "transparent",
                      cursor: "pointer"
                    }}
                  >
                    <td>
                      <Link href={`/admin?collection=${collection}&selectedId=${record.id}`} style={{ color: "inherit", display: "block" }}>
                        <strong>
                          {record.title || record.canonicalName || record.displayName || "Untitled"}
                        </strong>
                        <div className="muted" style={{ fontSize: "12px", maxWidth: "380px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {record.url || record.sourceUrl || record.description || record.notes || record.organization || ""}
                        </div>
                      </Link>
                    </td>
                    <td style={{ fontSize: "12px" }}>
                      {collection === "source-records" && (
                        <>
                          <span className="badge">{record.sourceType}</span>{" "}
                          <span className="badge">{record.relevanceStatus}</span>
                        </>
                      )}
                      {collection === "robot-models" && (
                        <>
                          <span className="badge">{record.robotType}</span>{" "}
                          <span className="badge">{record.thailandStatus}</span>
                        </>
                      )}
                      {collection === "contributions" && (
                        <>
                          <span className="badge">{record.contributionType}</span>{" "}
                          <span className="badge">{record.verificationStatus}</span>
                        </>
                      )}
                      {collection === "submitted-data" && <span className="badge">{record.status}</span>}
                    </td>
                    <td style={{ fontSize: "12px" }}>{record.updatedAt?.toLocaleDateString?.() ?? ""}</td>
                  </tr>
                ))}
                {!records.length && (
                  <tr>
                    <td className="empty" colSpan={3}>{localT.empty}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "baseline" }}>
            <div>
              <h2>{localT.editor}</h2>
              <div className="muted" style={{ fontSize: "12px" }}>
                {isNew ? localT.create : selectedItem?.title || selectedItem?.canonicalName || selectedItem?.displayName || "Selected record"}
              </div>
            </div>
            {!isNew && selectedItem && (
              <Link href={`/admin?collection=${collection}&selectedId=new`} className="button">
                {localT.addNew}
              </Link>
            )}
          </div>

          {!selectedItem && !isNew && (
            <div className="empty" style={{ paddingTop: "28px" }}>
              {localT.empty}
            </div>
          )}

          {collection === "source-records" && (
            <form key={selectedItem?.id ?? "new"} action={upsertSourceRecordAction} className="form" style={{ marginTop: "12px" }}>
              <input type="hidden" name="id" defaultValue={selectedItem?.id ?? ""} />
              <label>
                Title
                <input name="title" defaultValue={selectedItem?.title ?? ""} />
              </label>
              <label>
                URL
                <input name="url" defaultValue={selectedItem?.url ?? ""} placeholder="https://example.com/article" />
              </label>
              <label>
                Source Type
                <select name="sourceType" defaultValue={selectedItem?.sourceType ?? "WEB"}>
                  {sourceTypes.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Excerpt
                <textarea name="excerpt" rows={4} defaultValue={selectedItem?.excerpt ?? ""} />
              </label>
              <label>
                Published At
                <input type="datetime-local" name="publishedAt" defaultValue={toLocalDateTime(selectedItem?.publishedAt)} />
              </label>
              <label>
                Author
                <input name="author" defaultValue={selectedItem?.author ?? ""} />
              </label>
              <label>
                Platform
                <input name="platform" defaultValue={selectedItem?.platform ?? ""} />
              </label>
              <label>
                Relevance Status
                <select name="relevanceStatus" defaultValue={selectedItem?.relevanceStatus ?? "PENDING"}>
                  {relevanceStatuses.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Relevance Confidence
                <input type="number" step="0.01" min="0" max="1" name="relevanceConfidence" defaultValue={selectedItem?.relevanceConfidence ?? 0} />
              </label>
              <label>
                Relevance Reason
                <textarea name="relevanceReason" rows={3} defaultValue={selectedItem?.relevanceReason ?? ""} />
              </label>
              <button type="submit" className="primary">
                {selectedItem ? localT.save : localT.create}
              </button>
            </form>
          )}

          {collection === "robot-models" && (
            <form key={selectedItem?.id ?? "new"} action={upsertRobotModelAction} className="form" style={{ marginTop: "12px" }}>
              <input type="hidden" name="id" defaultValue={selectedItem?.id ?? ""} />
              <label>
                Canonical Name
                <input name="canonicalName" defaultValue={selectedItem?.canonicalName ?? ""} />
              </label>
              <label>
                Manufacturer
                <input name="manufacturer" defaultValue={selectedItem?.manufacturer ?? ""} />
              </label>
              <label>
                Developer Org
                <input name="developerOrg" defaultValue={selectedItem?.developerOrg ?? ""} />
              </label>
              <label>
                Country of Origin
                <input name="countryOfOrigin" defaultValue={selectedItem?.countryOfOrigin ?? ""} />
              </label>
              <label>
                Robot Type
                <input name="robotType" defaultValue={selectedItem?.robotType ?? "unknown"} />
              </label>
              <label>
                Thailand Status
                <select name="thailandStatus" defaultValue={selectedItem?.thailandStatus ?? "observed_in_thailand"}>
                  {robotStatusOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Embodiment Level
                <input name="embodimentLevel" defaultValue={selectedItem?.embodimentLevel ?? ""} />
              </label>
              <label>
                Primary Use Case
                <input name="primaryUseCase" defaultValue={selectedItem?.primaryUseCase ?? ""} />
              </label>
              <label>
                Official URL
                <input name="officialUrl" defaultValue={selectedItem?.officialUrl ?? ""} />
              </label>
              <label>
                Description
                <textarea name="description" rows={4} defaultValue={selectedItem?.description ?? ""} />
              </label>
              <label>
                Status Confidence
                <input type="number" step="0.01" min="0" max="1" name="statusConfidence" defaultValue={selectedItem?.statusConfidence ?? 0.5} />
              </label>
              <label>
                First Seen Year
                <input type="number" name="firstSeenYear" defaultValue={selectedItem?.firstSeenYear ?? ""} />
              </label>
              <label>
                Last Verified At
                <input type="datetime-local" name="lastVerifiedAt" defaultValue={toLocalDateTime(selectedItem?.lastVerifiedAt)} />
              </label>
              <button type="submit" className="primary">
                {selectedItem ? localT.save : localT.create}
              </button>
            </form>
          )}

          {collection === "contributions" && (
            <form key={selectedItem?.id ?? "new"} action={upsertContributionAction} className="form" style={{ marginTop: "12px" }}>
              <input type="hidden" name="id" defaultValue={selectedItem?.id ?? ""} />
              <label>
                Title
                <input name="title" defaultValue={selectedItem?.title ?? ""} />
              </label>
              <label>
                Contribution Type
                <input name="contributionType" defaultValue={selectedItem?.contributionType ?? ""} />
              </label>
              <label>
                Contributor Name
                <input name="contributorName" defaultValue={selectedItem?.contributorName ?? ""} />
              </label>
              <label>
                Contributor Type
                <input name="contributorType" defaultValue={selectedItem?.contributorType ?? ""} />
              </label>
              <label>
                Organization
                <input name="organization" defaultValue={selectedItem?.organization ?? ""} />
              </label>
              <label>
                Related Robot Model
                <select name="relatedRobotModelId" defaultValue={selectedItem?.relatedRobotModelId ?? ""}>
                  <option value="">None</option>
                  {robotOptions.map((robot) => (
                    <option key={robot.id} value={robot.id}>{robot.canonicalName}</option>
                  ))}
                </select>
              </label>
              <label>
                Source URL
                <input name="sourceUrl" defaultValue={selectedItem?.sourceUrl ?? ""} />
              </label>
              <label>
                License
                <input name="license" defaultValue={selectedItem?.license ?? ""} />
              </label>
              <label>
                Visibility
                <select name="visibility" defaultValue={selectedItem?.visibility ?? "public"}>
                  {visibilityOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Verification Status
                <select name="verificationStatus" defaultValue={selectedItem?.verificationStatus ?? "NEEDS_REVIEW"}>
                  {reviewStatuses.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Description
                <textarea name="description" rows={4} defaultValue={selectedItem?.description ?? ""} />
              </label>
              <button type="submit" className="primary">
                {selectedItem ? localT.save : localT.create}
              </button>
            </form>
          )}

          {collection === "submitted-data" && (
            <div style={{ display: "grid", gap: "12px", marginTop: "12px" }}>
              {selectedItem && (
                <div className="notice" style={{ margin: 0 }}>
                  <strong>Review the saved submission</strong>
                  <p className="muted">Open the source, check every reported outcome and limitation, and approve only after saving your corrections. Reject or Needs review withdraws any previous publication.</p>
                  {selectedSource.success && <p><a href={selectedSource.data} target="_blank" rel="noopener noreferrer">Open submitted source ↗</a></p>}
                  {!selectedSource.success && <p role="alert">The submitted source is missing or invalid. Correct it before publishing.</p>}
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                    {(structuredCase || structuredClaim) && <form action={updateSubmissionStatus.bind(null, selectedItem.id, "APPROVED")}>
                      <button type="submit" className="primary" style={{ background: "var(--success)", borderColor: "var(--success)" }}>
                        Approve and publish saved version
                      </button>
                    </form>}
                    <form action={updateSubmissionStatus.bind(null, selectedItem.id, "REJECTED")}>
                      <button type="submit" className="button" style={{ color: "var(--danger)", borderColor: "var(--danger)" }}>
                        Reject
                      </button>
                    </form>
                    <form action={updateSubmissionStatus.bind(null, selectedItem.id, "NEEDS_REVIEW")}>
                      <button type="submit" className="button">
                        Needs review
                      </button>
                    </form>
                  </div>
                  {!structuredCase && !structuredClaim && <p className="muted">This submission type needs manual processing. Automatic publication supports wellness cases and contribution claims.</p>}
                  {Object.keys(details).length > 0 && <details style={{ marginTop: 12 }}><summary>Full saved submission details</summary><pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12 }}>{JSON.stringify(details, null, 2)}</pre></details>}
                </div>
              )}

              <form key={selectedItem?.id ?? "new"} action={upsertSubmittedDataAction} className="form">
                <input type="hidden" name="id" defaultValue={selectedItem?.id ?? ""} />
                <label>
                  Submission Type
                  {selectedItem ? <input name="submissionType" value={selectedItem.submissionType} readOnly /> : <select name="submissionType" defaultValue="source_url"><option value="source_url">Source URL for manual review</option><option value="correction_request">Correction request</option></select>}
                </label>
                <label>
                  Title
                  <input name="title" defaultValue={selectedItem?.title ?? ""} required minLength={3} maxLength={250} />
                </label>
                <label>
                  URL
                  <input name="url" type="url" defaultValue={selectedItem?.url ?? ""} required={structuredCase || structuredClaim} />
                </label>
                <label>
                  Current review status
                  <input value={selectedItem?.status ?? "New draft"} readOnly />
                </label>
                <label>
                  Submitter Name
                  <input value={selectedItem?.submitterName ?? "Not supplied"} readOnly />
                </label>
                <label>
                  Submitter Contact
                  <input value={selectedItem?.submitterContact ?? "Not supplied"} readOnly />
                </label>
                {(structuredCase || structuredClaim) && <>
                  <h3>Details to publish after approval</h3>
                  <label>Related robot<select name="robotModelId" defaultValue={detailText("robotModelId")} required={structuredCase}>
                    <option value="">Select a robot</option>
                    {robotOptions.map((robot) => <option value={robot.id} key={robot.id}>{robot.canonicalName}</option>)}
                  </select></label>
                  <label>Reporting organization<input name="organization" defaultValue={detailText("organization")} maxLength={250} /></label>
                </>}
                {structuredCase && <>
                  <label>Wellness scenario<select name="scenario" defaultValue={detailText("scenario")} required>{wellnessScenarios.map((scenario) => <option key={scenario.value} value={scenario.value}>{lang === "th" ? scenario.labelTh : scenario.label}</option>)}</select></label>
                  <label>Participant group<input name="participantGroup" defaultValue={detailText("participantGroup")} required minLength={2} maxLength={250} /></label>
                  <label>Setting<input name="setting" defaultValue={detailText("setting")} required minLength={2} maxLength={250} /></label>
                  <label>Human–robot interaction<textarea name="interactionDescription" defaultValue={detailText("interactionDescription")} required minLength={10} maxLength={4000} rows={4} /></label>
                  <label>Outcome reported by the source<textarea name="reportedOutcome" defaultValue={detailText("reportedOutcome")} required minLength={10} maxLength={4000} rows={4} /></label>
                  <label>Limitations<textarea name="limitations" defaultValue={detailText("limitations")} required minLength={10} maxLength={4000} rows={4} /></label>
                  <label>Evidence type<select name="evidenceType" defaultValue={detailText("evidenceType")} required>{evidenceTypes.map((type) => <option value={type.value} key={type.value}>{lang === "th" ? type.labelTh : type.label}</option>)}</select></label>
                </>}
                {structuredClaim && <>
                  <label>Contribution type<input name="contributionType" defaultValue={detailText("contributionType")} required minLength={2} maxLength={80} /></label>
                  <label>Public description<textarea name="description" defaultValue={detailText("description")} maxLength={4000} rows={4} /></label>
                </>}
                <label>
                  Private submission notes
                  <textarea name="notes" rows={4} maxLength={4000} defaultValue={selectedItem?.notes ?? ""} />
                </label>
                <label>
                  Review Notes
                  <textarea name="reviewNotes" rows={4} maxLength={4000} defaultValue={selectedItem?.reviewNotes ?? ""} />
                </label>
                <button type="submit" className="primary">
                  {selectedItem ? "Save changes and return to review" : "Create draft for review"}
                </button>
                <p className="muted">Saving never publishes. Saving an existing submission returns it to Needs review and hides its previous publication until you approve the saved version.</p>
              </form>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
