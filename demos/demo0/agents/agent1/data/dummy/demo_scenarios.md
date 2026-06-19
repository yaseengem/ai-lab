# Claims Processing Demo Scenarios

## Policy Reference
| Policy | Holder | Type | Status | Coverage | Deductible |
|--------|--------|------|--------|----------|------------|
| POL-1001 | John Doe (USR-001) | health | active | $50,000 | $500 |
| POL-1002 | Jane Smith (USR-002) | auto | active | $25,000 | $1,000 |
| POL-1003 | Bob Kumar (USR-003) | health | **expired** | $30,000 | $750 |
| POL-1004 | Alice Tan (USR-004) | health | active | $40,000 | $500 |
| POL-1005 | Mike Chen (USR-005) | health | active | $35,000 | $600 |

---

## Scenario 1 — Clean Health Claim (Full Pipeline, All 8 Agents)
**Policy:** POL-1001 / USR-001  
**Documents:** `physician_report_case1.pdf`, `medical_bills_case1.pdf`  
**Submit:** "I am John Doe, policy POL-1001. I need to file a health claim. I was diagnosed with acute appendicitis and had surgery. Files: physician_report_case1.pdf and medical_bills_case1.pdf."  
**Expected:** All 8 agents run → QA PASS → pending_approval → support exec approves → email .md written

---

## Scenario 2 — Health Claim with Medical Discrepancy
**Policy:** POL-1001 / USR-001  
**Documents:** `physician_report_case2.pdf`, `medical_bills_case2.pdf`  
**Submit:** Same as Scenario 1 but with case2 documents.  
**Expected:** Medical review flags mismatch (bills include items not in physician report) → partial adjudication or escalation → human reviews discrepancy

---

## Scenario 3 — Fraud — Repeat Large Claims
**Policy:** POL-1004 / USR-004  
**Submit:** "I am Alice Tan, policy POL-1004. I need to file a health claim for $39,000 for orthopedic surgery."  
**Expected:** Fraud agent matches FP-001 (two prior claims >$35k in 90 days) → high fraud score → auto-escalate → escalated_to_human

---

## Scenario 4 — Lapsed Policy Early Exit
**Policy:** POL-1003 / USR-003  
**Submit:** "I am Bob Kumar, policy POL-1003. I need to file a health claim."  
**Expected:** Validation detects expired policy → early exit → denied immediately, medical review and fraud skipped

---

## Scenario 5 — Clean Auto Claim with .txt File
**Policy:** POL-1002 / USR-002  
**Documents:** `police_report_auto.pdf`, `repair_estimate_auto.txt`  
**Submit:** "I am Jane Smith, policy POL-1002. My car was in an accident on I-95. Files: police_report_auto.pdf and repair_estimate_auto.txt"  
**Expected:** extract_text_file used for .txt — no medical review — fraud: medium risk (FP-002) but proceeds — approved — settlement = estimate - $1,000 deductible

---

## Scenario 6 — QA Self-Correction
**Policy:** POL-1005 / USR-005  
**Submit:** "I am Mike Chen, policy POL-1005. Filing health claim for $34,000."  
**Expected:** QA detects contradiction (fraud score inconsistent with adjudication) → FIX_REQUIRED → re-run adjudication → second attempt passes → pending_approval

---

## Scenario 7 — QA Escalation (Two Failed Attempts)
**Policy:** POL-1005 / USR-005  
**Documents:** `physician_report_case3.pdf`, `medical_bills_case3.pdf`  
**Submit:** "I am Mike Chen, policy POL-1005. Health claim with inflated amounts."  
**Expected:** QA flags contradiction twice → ESCALATE → escalated_to_human with detailed QA comments

---

## Scenario 8 — Admin / Support Exec: List Pending Reviews
**Role:** support_exec or admin  
**Ask:** "Show me all cases pending review."  
**Expected:** Calvin queries claims_metadata for status=pending_approval and escalated_to_human → formatted table

---

## Scenario 9 — Support Exec Approves a Case
**Role:** support_exec  
**Ask:** "Approve case CLM-20260414-0001."  
**Expected:** Calvin calls approve_case → communication_agent runs → email .md written → status=communicated

---

## Scenario 10 — Support Exec Overrides Settlement
**Role:** support_exec  
**Ask:** "Override case CLM-20260414-0001 — change settlement to $6,000 and approve."  
**Expected:** Calvin calls approve_case with override_amount=6000 → new amount stored → email reflects $6,000

---

## Scenario 11 — Support Exec Rejects a Decision
**Role:** support_exec  
**Ask:** "Reject case CLM-20260414-0003 — duplicate claim."  
**Expected:** approve_case called with decision=rejected → no email → status=rejected

---

## Scenario 12 — Human Reviewer Chats Before Deciding
**Role:** support_exec  
**Ask sequence:**
1. "Tell me about case CLM-20260414-0003"
2. "Why was this escalated?"
3. "Show me the audit trail"
4. "Override to $5,500 and approve."  
**Expected:** Calvin answers from query_claims_metadata + read_audit_log → then calls approve_case on instruction

---

## Scenario 13 — End User Checks Own Claim Status
**Role:** end_user / USR-001  
**Ask:** "What is the status of my claim?"  
**Expected:** Calvin queries claims_metadata filtered to USR-001 → returns only their cases

---

## Scenario 14 — End User Tries Another User's Case
**Role:** end_user / USR-001  
**Ask:** "Show me case details for USR-002."  
**Expected:** query_claims_metadata role-gate blocks access → Calvin explains they can only view their own cases

---

## Scenario 15 — Admin Reads Full Audit Trail
**Role:** admin  
**Ask:** "Show me the complete audit log for case CLM-20260414-0001."  
**Expected:** read_audit_log returns every agent decision + reasoning in full

---

## Scenario 16 — No Documents Submitted
**Policy:** POL-1002 / USR-002  
**Submit:** "I am Jane Smith, policy POL-1002. I had a minor fender bender. No documents yet."  
**Expected:** intake → validation → fraud → adjudication → QA (extraction skipped, medical review skipped)
