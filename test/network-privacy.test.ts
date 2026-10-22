import test from "node:test";
import assert from "node:assert/strict";
import { publicImportedGraphRecord } from "../lib/network-graph";

test("imported records cannot bypass publication review or inventory privacy", () => {
  assert.equal(publicImportedGraphRecord({ category: "submission_record", title: "Pending submission", notes: "private contact" }, 0), null);
  assert.equal(publicImportedGraphRecord({ category: "owned_inventory", visibility: "private", title: "Private serial asset" }, 1), null);
  assert.equal(publicImportedGraphRecord({ category: "contribution", visibility: "public", verification_status: "NEEDS_REVIEW" }, 2), null);
  assert.equal(publicImportedGraphRecord({ category: "contribution", title: "Missing review state" }, 3), null);
  assert.equal(publicImportedGraphRecord({ category: "source_record", relevance_status: "REJECTED" }, 4), null);
});

test("public imported inventory and contributions omit private notes and submitter identities", () => {
  const inventory = publicImportedGraphRecord({ category: "owned_inventory", visibility: "public", title: "Public unit", notes: "private repair log", description: "private location", evidence_excerpt: "private details", author: "private custodian" }, 0);
  assert.ok(inventory);
  assert.equal(inventory.title, "Public unit");
  assert.equal(inventory.notes, null);
  assert.equal(inventory.description, null);
  assert.equal(inventory.evidence_excerpt, null);
  assert.equal(inventory.author, null);
  const contribution = publicImportedGraphRecord({ category: "contribution", visibility: "public", verification_status: "APPROVED", title: "Reviewed case", author: "private submitter", notes: "review notes", url: "https://example.test/source" }, 1);
  assert.ok(contribution);
  assert.equal(contribution.author, null);
  assert.equal(contribution.notes, null);
  assert.equal(contribution.url, "https://example.test/source");
});
