# Verification — 18 October 2026

Verified locally on Windows with Node.js 24.19.0 and Next.js 15.5.20.

| Check | Result |
| --- | --- |
| `pnpm test` | 21 passed, none skipped |
| `pnpm typecheck` | Passed |
| `pnpm check:no-mock-data` | Passed, original gate unchanged |
| `pnpm test:casebook` with installed Chrome | 4 passed, none skipped |
| `pnpm build` | Passed; all routes compiled and static output generated |

The browser tests used a fresh isolated local PGlite database with the committed
schema migrations and two summaries of linked institutional reports. They did not
use or modify the existing cloud database. The build used an explicit localhost
placeholder connection to verify compilation independently of a cloud service.

## Browser coverage

1. Browse source-backed cases, filter by situation/evidence, show an honest empty
   result, open details/source/registry links, and show unavailable cases without
   disclosing private content. Next's streamed not-found responses are checked by
   the unavailable UI and noindex metadata, rather than assuming HTTP 404 headers.
2. Legacy role cookies and a forged signed cookie cannot enter administrator pages.
3. A 390-pixel mobile viewport has no horizontal page overflow. The print button
   invokes browser printing, and print media hides navigation while retaining the
   evidence and limitations.
4. Register a real USER account, submit a case, confirm it stays private, log in as
   a reviewer, publish, approve twice without duplication, edit a public outcome,
   confirm withdrawal pending review, approve the changed version, reject and hide
   it again. Submit an ordinary contribution, publish it only in Contributions,
   follow the correct account link, then withdraw it.

Unit tests also cover expiry and signature tampering, password verification,
transaction rollback, missing robots, duplicate source conflicts, validation,
public graph privacy, and withdrawal after edits.

## Scope

This verifies the Casebook and its integration with the existing review/publication
flow. External ingestion, Gemini responses and a hosted deployment were not exercised.
No GitHub push was performed in this work session.
