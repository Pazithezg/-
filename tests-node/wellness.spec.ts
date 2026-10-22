import { test, expect } from "@playwright/test";

const dinsawTitle = "Dinsaw Mini 3 Home AI: communication and reminders at home";
const mirrorTitle = "Mirror: remote communication in COVID-19 care";

test("public Casebook shows sourced cases, filters, empty states and detail", async ({ page }) => {
  await page.goto("/wellness");
  await expect(page.getByRole("heading", { name: dinsawTitle, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: mirrorTitle, exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "สถานการณ์ที่สนใจ", exact: true }).selectOption("social_connection");
  await page.getByRole("button", { name: "ค้นหาเคส", exact: true }).click();
  await expect(page).toHaveURL(/scenario=social_connection/);
  await expect(page.getByRole("heading", { name: dinsawTitle, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: mirrorTitle, exact: true })).toHaveCount(0);

  await page.getByRole("heading", { name: dinsawTitle, exact: true }).getByRole("link").click();
  await expect(page.getByRole("heading", { name: dinsawTitle, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ข้อจำกัดและสิ่งที่ยังไม่ทราบ", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "อ่านแหล่งข้อมูลต้นฉบับ ↗", exact: true })).toHaveAttribute("href", /https:\/\/www\.chula\.ac\.th\/en\/highlight\/198924/);
  await expect(page.getByRole("link", { name: /Dinsaw Mini 3 Home AI → ดูในทะเบียน/ })).toHaveAttribute("href", /^\/robots#robot-/);

  await page.goto("/wellness?scenario=care_communication");
  await expect(page.getByRole("heading", { name: mirrorTitle, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: dinsawTitle, exact: true })).toHaveCount(0);

  await page.getByRole("combobox", { name: "ประเภทแหล่งข้อมูล", exact: true }).selectOption("research_paper");
  await page.getByRole("button", { name: "ค้นหาเคส", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ยังไม่มีเคสที่ตรงกับตัวเลือกนี้", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "ล้างตัวกรอง", exact: true }).click();
  await expect(page.getByRole("heading", { name: dinsawTitle, exact: true })).toBeVisible();

  const missing = await page.goto("/wellness/casebook-e2e-nonexistent-record");
  // Next's parent loading boundary can stream headers before notFound resolves.
  expect([200, 404]).toContain(missing?.status());
  await expect(page.getByRole("heading", { name: "ไม่พบเคสที่เผยแพร่", exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toHaveAttribute("content", /noindex/);
});

test("legacy and forged administrator cookies cannot open review tools", async ({ page, context, baseURL }) => {
  await context.addCookies([
    { name: "admin_session", value: "true", url: baseURL! },
    { name: "user_role", value: "ADMIN", url: baseURL! },
    { name: "user_email", value: "forged-admin@example.invalid", url: baseURL! },
    { name: "atlas_session", value: "forged-payload.forged-signature", url: baseURL! }
  ]);
  for (const route of ["/admin", "/admin/submitted-data", "/database"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/admin-login\?/);
    await expect(page.getByRole("button", { name: /Authorize Session|ยืนยันสิทธิ์การเข้าใช้งาน/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve and publish saved version", exact: true })).toHaveCount(0);
  }
});

test("mobile Casebook fits the screen and detail offers a clean print view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const printState = window as typeof window & { casebookPrintCalls?: number };
    printState.casebookPrintCalls = 0;
    window.print = () => { printState.casebookPrintCalls = (printState.casebookPrintCalls ?? 0) + 1; };
  });
  await page.goto("/wellness");
  await expect(page.getByRole("heading", { name: dinsawTitle, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByRole("heading", { name: dinsawTitle, exact: true }).getByRole("link").click();
  await expect(page.getByRole("heading", { name: dinsawTitle, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByRole("button", { name: "พิมพ์ / บันทึก PDF", exact: true }).click();
  expect(await page.evaluate(() => (window as typeof window & { casebookPrintCalls?: number }).casebookPrintCalls)).toBe(1);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".mobile-tab-nav")).toBeHidden();
  await expect(page.getByRole("heading", { name: "ข้อจำกัดและสิ่งที่ยังไม่ทราบ", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /www.chula.ac.th/ })).toBeVisible();
});

test("registered USER submits privately; admin publishes once and withdraws the case", async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(240_000);
  const configuredEmail = process.env.CASEBOOK_TEST_USER_EMAIL;
  const userPassword = process.env.CASEBOOK_TEST_USER_PASSWORD;
  const adminEmail = process.env.CASEBOOK_TEST_ADMIN_EMAIL;
  const adminPassword = process.env.CASEBOOK_TEST_ADMIN_PASSWORD;
  test.skip(!configuredEmail || !userPassword || !adminEmail || !adminPassword,
    "Provide CASEBOOK_TEST_USER_EMAIL/PASSWORD and CASEBOOK_TEST_ADMIN_EMAIL/PASSWORD to run the real write workflow.");

  const runId = `${Date.now()}-${testInfo.parallelIndex}`;
  const [localPart, domain] = configuredEmail!.split("@");
  const email = `${localPart}+casebook-e2e-${runId}@${domain}`;
  const title = `casebook-e2e-${runId}: temporary publication workflow check`;
  const sourceUrl = `https://www.chula.ac.th/en/news/42184/?casebook_e2e=${runId}`;
  const cleanup: Record<string, string> = { title, email, sourceUrl };
  const anonymousContext = await browser.newContext({ baseURL });
  const adminContext = await browser.newContext({ baseURL });
  const anonymous = await anonymousContext.newPage();
  const admin = await adminContext.newPage();

  try {
    await page.goto("/profile");
    const registration = page.locator("section").filter({ has: page.getByRole("heading", { name: "Create an account", exact: true }) });
    await registration.getByLabel("Name", { exact: true }).fill(`Casebook E2E ${runId}`);
    await registration.getByLabel("Email", { exact: true }).fill(email);
    await registration.getByLabel("Password", { exact: true }).fill(userPassword!);
    await registration.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByRole("heading", { name: `Casebook E2E ${runId}`, exact: true })).toBeVisible();
    await expect(page.getByText("USER", { exact: true })).toBeVisible();
    const session = (await page.context().cookies()).find((cookie) => cookie.name === "atlas_session");
    expect(session?.httpOnly).toBe(true);
    if (session) {
      // Record only the created account ID for cleanup; never attach its token or password.
      const payload = JSON.parse(Buffer.from(session.value.split(".")[0], "base64url").toString("utf8"));
      cleanup.userId = String(payload.userId);
    }

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin-login\?/);
    await page.goto("/submit-data?type=wellness_case");
    const submission = page.locator("form").filter({ has: page.getByRole("heading", { name: "รายละเอียดเคส", exact: true }) });
    await submission.getByLabel("ชื่อเรื่อง", { exact: true }).fill(title);
    await submission.getByLabel("ลิงก์แหล่งอ้างอิง", { exact: true }).fill(sourceUrl);
    await submission.getByRole("combobox", { name: "หุ่นยนต์ที่เกี่ยวข้อง", exact: true }).selectOption({ label: "Mirror telepresence system" });
    await submission.getByLabel("หน่วยงานที่รายงาน (ถ้ามี)", { exact: true }).fill("Temporary automated workflow verification");
    await submission.getByRole("combobox", { name: "สถานการณ์", exact: true }).selectOption("care_communication");
    await submission.getByLabel("กลุ่มผู้ใช้", { exact: true }).fill("No real participants; temporary test record");
    await submission.getByLabel("บริบทหรือสถานที่ประเภทใด", { exact: true }).fill("Automated software verification only");
    await submission.getByLabel("คนกับหุ่นยนต์ทำอะไรด้วยกัน", { exact: true }).fill("Temporary test of the publication workflow using a linked institutional report about telepresence communication. No new human interaction was conducted.");
    await submission.getByLabel("สิ่งที่แหล่งข้อมูลรายงาน", { exact: true }).fill("This is a temporary software test record and makes no new wellness or clinical outcome claim. Consult the linked institutional report for the original deployment account.");
    await submission.getByLabel("ข้อจำกัดและสิ่งที่ยังไม่ทราบ", { exact: true }).fill("This record exists only to verify software review and withdrawal. It is not a new field observation or clinical evaluation and must be removed after the test.");
    await submission.getByRole("combobox", { name: "ประเภทหลักฐาน", exact: true }).selectOption("institutional_report");
    await submission.getByRole("button", { name: "ส่งให้ผู้ดูแลตรวจสอบ", exact: true }).click();
    await expect(submission.getByRole("status")).toContainText("Submitted for review");
    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: title })).toContainText("QUEUED");

    await anonymous.goto("/wellness");
    await expect(anonymous.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
    await anonymous.goto(`/contributions?q=${encodeURIComponent(title)}`);
    await expect(anonymous.getByRole("row").filter({ hasText: title })).toHaveCount(0);

    await admin.goto("/admin-login?from=%2Fadmin");
    const login = admin.locator("form.login-form");
    await login.locator('input[name="email"]').fill(adminEmail!);
    await login.locator('input[name="password"]').fill(adminPassword!);
    await login.getByRole("button", { name: /Authorize Session|ยืนยันสิทธิ์การเข้าใช้งาน/ }).click();
    await expect(admin).toHaveURL(/\/admin(?:\?|$)/);
    await admin.getByRole("link", { name: new RegExp(title) }).click();
    await expect(admin).toHaveURL(/selectedId=/);
    const selectedId = new URL(admin.url()).searchParams.get("selectedId");
    expect(selectedId).toBeTruthy();
    cleanup.submissionId = selectedId!;
    await admin.getByRole("button", { name: "Approve and publish saved version", exact: true }).click();
    await expect(admin.getByRole("row").filter({ hasText: title })).toContainText("APPROVED");

    await anonymous.goto("/wellness");
    const publicHeading = anonymous.getByRole("heading", { name: title, exact: true });
    await expect(publicHeading).toHaveCount(1);
    const detailPath = await publicHeading.getByRole("link").getAttribute("href");
    expect(detailPath).toMatch(/^\/wellness\/.+/);
    cleanup.contributionId = detailPath!.split("/").pop()!;
    await publicHeading.getByRole("link").click();
    await expect(anonymous.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(anonymous.locator("main")).not.toContainText(email);

    // Repeating the review action must update the same linked contribution.
    await admin.getByRole("button", { name: "Approve and publish saved version", exact: true }).click();
    await expect(admin.getByRole("row").filter({ hasText: title })).toContainText("APPROVED");
    await anonymous.goto("/wellness");
    await expect(anonymous.getByRole("heading", { name: title, exact: true })).toHaveCount(1);
    await expect(anonymous.getByRole("heading", { name: title, exact: true }).getByRole("link")).toHaveAttribute("href", detailPath!);
    await anonymous.goto(`/contributions?q=${encodeURIComponent(title)}`);
    await expect(anonymous.getByRole("row").filter({ hasText: title })).toHaveCount(1);

    // Editing an approved submission withdraws the linked public record until a new review.
    const revisedOutcome = "Revised temporary software test outcome: this confirms editorial changes return to review and makes no clinical claim.";
    await admin.getByRole("textbox", { name: "Outcome reported by the source", exact: true }).fill(revisedOutcome);
    await admin.getByRole("button", { name: "Save changes and return to review", exact: true }).click();
    await expect(admin.getByRole("row").filter({ hasText: title })).toContainText("NEEDS_REVIEW");
    await anonymous.goto("/wellness");
    await expect(anonymous.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
    await anonymous.goto(`/contributions?q=${encodeURIComponent(title)}`);
    await expect(anonymous.getByRole("row").filter({ hasText: title })).toHaveCount(0);
    const underReview = await anonymous.goto(detailPath!);
    expect([200, 404]).toContain(underReview?.status());
    await expect(anonymous.getByRole("heading", { name: "ไม่พบเคสที่เผยแพร่", exact: true })).toBeVisible();
    await expect(anonymous.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
    await admin.getByRole("button", { name: "Approve and publish saved version", exact: true }).click();
    await expect(admin.getByRole("row").filter({ hasText: title })).toContainText("APPROVED");
    await anonymous.goto(detailPath!);
    await expect(anonymous.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(anonymous.getByText(revisedOutcome, { exact: true })).toBeVisible();

    await admin.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(admin.getByRole("row").filter({ hasText: title })).toContainText("REJECTED");
    await anonymous.goto("/wellness");
    await expect(anonymous.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
    await anonymous.goto(`/contributions?q=${encodeURIComponent(title)}`);
    await expect(anonymous.getByRole("row").filter({ hasText: title })).toHaveCount(0);
    const withdrawn = await anonymous.goto(detailPath!);
    expect([200, 404]).toContain(withdrawn?.status());
    await expect(anonymous.getByRole("heading", { name: "ไม่พบเคสที่เผยแพร่", exact: true })).toBeVisible();
    await expect(anonymous.getByRole("heading", { name: title, exact: true })).toHaveCount(0);

    await page.goto("/profile");
    await expect(page.getByRole("row").filter({ hasText: title })).toContainText("rejected");

    // An ordinary contribution uses the same completed review flow, without becoming a wellness case.
    const claimTitle = `casebook-e2e-${runId}: temporary ordinary contribution check`;
    const claimSourceUrl = `https://www.chula.ac.th/en/news/42184/?casebook_e2e_claim=${runId}`;
    cleanup.claimTitle = claimTitle;
    cleanup.claimSourceUrl = claimSourceUrl;
    await page.goto("/submit-data?type=contribution_claim");
    const claim = page.locator("form").filter({ has: page.getByRole("heading", { name: "ส่งผลงาน / Contribution", exact: true }) });
    await claim.getByLabel("ชื่อเรื่อง", { exact: true }).fill(claimTitle);
    await claim.getByLabel("ลิงก์แหล่งอ้างอิง", { exact: true }).fill(claimSourceUrl);
    await claim.getByRole("combobox", { name: "ประเภทผลงาน", exact: true }).selectOption("robot_deployment");
    await claim.getByLabel("คำอธิบายผลงาน", { exact: true }).fill("Temporary software workflow check linked to an institutional report. This record does not report a new deployment or outcome and will be removed after verification.");
    await claim.getByRole("button", { name: "ส่งให้ผู้ดูแลตรวจสอบ", exact: true }).click();
    await expect(claim.getByRole("status")).toContainText("Submitted for review");
    await admin.goto("/admin?collection=submitted-data");
    await admin.getByRole("link", { name: new RegExp(claimTitle) }).click();
    await expect(admin).toHaveURL(/selectedId=/);
    cleanup.claimSubmissionId = new URL(admin.url()).searchParams.get("selectedId")!;
    await admin.getByRole("button", { name: "Approve and publish saved version", exact: true }).click();
    await expect(admin.getByRole("row").filter({ hasText: claimTitle })).toContainText("APPROVED");
    await anonymous.goto(`/contributions?q=${encodeURIComponent(claimTitle)}`);
    await expect(anonymous.getByRole("row").filter({ hasText: claimTitle })).toHaveCount(1);
    await anonymous.goto("/wellness");
    await expect(anonymous.getByRole("heading", { name: claimTitle, exact: true })).toHaveCount(0);
    await page.goto("/submit-data?type=contribution_claim");
    await expect(page.getByRole("row").filter({ hasText: claimTitle }).getByRole("link", { name: "เปิดรายการที่เผยแพร่", exact: true }))
      .toHaveAttribute("href", `/contributions?q=${encodeURIComponent(claimTitle)}`);
    await admin.goto("/admin?collection=contributions");
    const claimRecordPath = await admin.getByRole("link", { name: new RegExp(claimTitle) }).getAttribute("href");
    cleanup.claimContributionId = new URL(claimRecordPath!, baseURL).searchParams.get("selectedId")!;
    await admin.goto(`/admin?collection=submitted-data&selectedId=${encodeURIComponent(cleanup.claimSubmissionId)}`);
    await admin.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(admin.getByRole("row").filter({ hasText: claimTitle })).toContainText("REJECTED");
    await anonymous.goto(`/contributions?q=${encodeURIComponent(claimTitle)}`);
    await expect(anonymous.getByRole("row").filter({ hasText: claimTitle })).toHaveCount(0);
  } finally {
    // The runner owns cleanup so failures preserve exact evidence rather than deleting broadly.
    await testInfo.attach("casebook-e2e-cleanup", { body: JSON.stringify(cleanup, null, 2), contentType: "application/json" });
    await anonymousContext.close();
    await adminContext.close();
  }
});
