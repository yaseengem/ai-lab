"""
Generate sample PDF and .txt documents for claims processing demo scenarios.
Run once from the repo root: python agents/agent1/create_dummy_data.py
Requires: fpdf2  (pip install fpdf2)
"""
from __future__ import annotations
from pathlib import Path

OUT = Path(__file__).parent / "data" / "dummy" / "sample_documents"
OUT.mkdir(parents=True, exist_ok=True)

try:
    from fpdf import FPDF
except ImportError:
    raise SystemExit("fpdf2 is required: pip install fpdf2")


def _pdf(filename: str, title: str, lines: list[str]) -> None:
    pdf = FPDF(format="A4")
    pdf.set_margins(20, 20, 20)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 12)
    pdf.write(8, title)
    pdf.ln(10)
    pdf.set_font("Helvetica", size=10)
    for line in lines:
        if line == "":
            pdf.ln(5)
        else:
            # Truncate very long lines to avoid horizontal overflow
            pdf.write(6, line[:120])
            pdf.ln(6)
    pdf.output(str(OUT / filename))
    print(f"  created: {filename}")


# ── Scenario 1: Physician Report (consistent) ─────────────────────────────────
_pdf("physician_report_case1.pdf", "PHYSICIAN REPORT - ABC Medical Center", [
    "Date: 2026-04-01",
    "Patient: John Doe    DOB: 1985-06-15    Policy: POL-1001",
    "Attending Physician: Dr. Sarah Patel, MD (Gastroenterology)",
    "",
    "DIAGNOSIS",
    "ICD-10: K35.89 - Acute appendicitis",
    "The patient presented on 2026-03-28 with acute abdominal pain (RLQ).",
    "Emergency appendectomy was performed successfully on 2026-03-29.",
    "",
    "TREATMENT & PROCEDURES",
    "- Emergency appendectomy (CPT 44950): $12,000",
    "- General anaesthesia (CPT 00840): $3,500",
    "- 3-day inpatient stay (room & board): $4,500",
    "- Post-operative medication & dressings: $800",
    "- Pathology analysis: $600",
    "",
    "RECOMMENDED COVERAGE",
    "All procedures listed above are medically necessary and directly related",
    "to the acute appendicitis diagnosis. Total: $21,400.",
    "",
    "Physician Signature: Dr. Sarah Patel    License: MED-44821",
])

# ── Scenario 1: Medical Bills (matching - all items in physician report) ───────
_pdf("medical_bills_case1.pdf", "MEDICAL BILL - ABC Medical Center", [
    "Invoice Date: 2026-04-03    Invoice No: INV-2026-0391",
    "Patient: John Doe    Policy: POL-1001",
    "",
    "ITEMISED CHARGES",
    "Emergency appendectomy (CPT 44950) ........... $12,000.00",
    "General anaesthesia (CPT 00840) .............. $3,500.00",
    "Inpatient stay - 3 nights .................... $4,500.00",
    "Post-operative medication & dressings ......... $800.00",
    "Pathology analysis ........................... $600.00",
    "",
    "TOTAL AMOUNT DUE: $21,400.00",
    "",
    "Payment due within 30 days of statement date.",
    "Billing Provider: ABC Medical Center, 100 Health Ave, Boston MA 02115",
])

# ── Scenario 2: Physician Report (partial diagnosis) ──────────────────────────
_pdf("physician_report_case2.pdf", "PHYSICIAN REPORT - City General Hospital", [
    "Date: 2026-04-02",
    "Patient: John Doe    DOB: 1985-06-15    Policy: POL-1001",
    "Attending Physician: Dr. Mark Evans, MD (Internal Medicine)",
    "",
    "DIAGNOSIS",
    "ICD-10: J06.9 - Acute upper respiratory infection",
    "The patient presented with fever (39.2C), sore throat, and productive cough.",
    "Treated with antibiotics and rest.",
    "",
    "TREATMENT & PROCEDURES",
    "- GP consultation (CPT 99213): $250",
    "- Chest X-ray (CPT 71046): $450",
    "- Antibiotic prescription (10-day course): $120",
    "",
    "RECOMMENDED COVERAGE: $820 (all items directly related to diagnosis)",
    "",
    "Physician Signature: Dr. Mark Evans    License: MED-55209",
])

# ── Scenario 2: Medical Bills (discrepant - has items NOT in physician report) ─
_pdf("medical_bills_case2.pdf", "MEDICAL BILL - City General Hospital", [
    "Invoice Date: 2026-04-04    Invoice No: INV-2026-0402",
    "Patient: John Doe    Policy: POL-1001",
    "",
    "ITEMISED CHARGES",
    "GP consultation (CPT 99213) .................. $250.00",
    "Chest X-ray (CPT 71046) ...................... $450.00",
    "Antibiotic prescription ....................... $120.00",
    "Specialist referral - Pulmonology (CPT 99244)  $600.00   <-- NOT in physician report",
    "MRI scan - thoracic (CPT 71552) .............. $2,400.00  <-- NOT in physician report",
    "Physical therapy session x3 (CPT 97110) ....... $750.00   <-- NOT in physician report",
    "",
    "TOTAL AMOUNT DUE: $4,570.00",
    "",
    "Billing Provider: City General Hospital, 200 Main St, Boston MA 02101",
])

# ── Scenario 5: Police Report (auto accident) ─────────────────────────────────
_pdf("police_report_auto.pdf", "POLICE INCIDENT REPORT", [
    "Report No: RPT-2026-MA-8821",
    "Date of Incident: 2026-04-10    Time: 14:35",
    "Location: Interstate 95 North, Mile Marker 42, Boston MA",
    "",
    "REPORTING OFFICER",
    "Officer: Sgt. David Reyes    Badge: 4471    Dept: MA State Police",
    "",
    "INCIDENT SUMMARY",
    "Single-vehicle collision. Driver Jane Smith (USR-002) lost control on wet",
    "pavement and struck the central barrier. No other vehicles involved.",
    "No injuries reported. Vehicle sustained significant front-end damage.",
    "",
    "VEHICLE DETAILS",
    "Make/Model: 2022 Toyota Camry    Plate: MA-7XK-391",
    "Registered Owner: Jane Smith    Policy: POL-1002",
    "",
    "DAMAGE ASSESSMENT",
    "Front bumper, hood, radiator, and airbag deployment.",
    "Vehicle was not drivable and was towed from scene.",
    "",
    "Officer Signature: Sgt. D. Reyes    Date Signed: 2026-04-10",
])

# ── Scenario 5: Repair Estimate (.txt - tests extract_text_file) ──────────────
(OUT / "repair_estimate_auto.txt").write_text(
    "REPAIR ESTIMATE\n"
    "==============\n"
    "Workshop: FastFix Auto Body, 55 Commerce Rd, Boston MA 02130\n"
    "Estimate Date: 2026-04-11    Estimate No: EST-4821\n"
    "Customer: Jane Smith    Vehicle: 2022 Toyota Camry    Plate: MA-7XK-391\n"
    "Policy: POL-1002\n"
    "\n"
    "PARTS\n"
    "Front bumper assembly ......................... $1,800.00\n"
    "Hood panel .................................... $1,200.00\n"
    "Radiator + coolant ........................... $950.00\n"
    "Airbag module (driver) ....................... $1,400.00\n"
    "Airbag module (passenger) .................... $1,200.00\n"
    "\n"
    "LABOUR\n"
    "Body panel removal/replacement (12 hrs @ $95) . $1,140.00\n"
    "Painting & finishing (8 hrs @ $95) ............ $760.00\n"
    "Mechanical alignment ......................... $350.00\n"
    "\n"
    "TOTAL ESTIMATE: $8,800.00\n"
    "\n"
    "Estimate valid for 30 days.\n"
    "Authorised by: Tom Walsh, Senior Estimator\n",
    encoding="utf-8",
)
print("  created: repair_estimate_auto.txt")

# ── Scenarios 6/7: Physician Report (QA contradiction trigger) ────────────────
_pdf("physician_report_case3.pdf", "PHYSICIAN REPORT - Metro Health Clinic", [
    "Date: 2026-04-05",
    "Patient: Mike Chen    DOB: 1978-09-22    Policy: POL-1005",
    "Attending Physician: Dr. Lisa Nguyen, MD (Orthopaedics)",
    "",
    "DIAGNOSIS",
    "ICD-10: M54.5 - Low back pain (mild, non-specific)",
    "Patient reports intermittent lower back discomfort for 2 weeks.",
    "No nerve impingement detected. No surgical intervention required.",
    "",
    "TREATMENT & PROCEDURES",
    "- GP consultation (CPT 99213): $250",
    "- Lumbar X-ray (CPT 72100): $300",
    "- 3 physiotherapy sessions (CPT 97110): $450",
    "- Pain relief medication (OTC): $60",
    "",
    "RECOMMENDED COVERAGE: $1,060",
    "Note: Mild, non-specific back pain. Conservative management only.",
    "",
    "Physician Signature: Dr. Lisa Nguyen    License: MED-61003",
])

# ── Scenarios 6/7: Medical Bills (inflated - inconsistent with diagnosis) ──────
_pdf("medical_bills_case3.pdf", "MEDICAL BILL - Metro Health Clinic", [
    "Invoice Date: 2026-04-07    Invoice No: INV-2026-0441",
    "Patient: Mike Chen    Policy: POL-1005",
    "",
    "ITEMISED CHARGES",
    "GP consultation (CPT 99213) .................. $250.00",
    "Lumbar X-ray (CPT 72100) ..................... $300.00",
    "Physiotherapy sessions x3 (CPT 97110) ......... $450.00",
    "Spinal fusion surgery (CPT 22612) ............ $28,000.00  <-- NOT in physician report",
    "Anaesthesiology for spinal surgery ........... $4,500.00  <-- NOT in physician report",
    "6-day inpatient post-surgical stay ........... $9,000.00  <-- NOT in physician report",
    "",
    "TOTAL AMOUNT DUE: $42,500.00",
    "",
    "Note: Amounts are dramatically inconsistent with mild back pain diagnosis.",
    "Billing Provider: Metro Health Clinic, 300 Park Ave, Boston MA 02116",
])

print("\nAll sample documents created in:", OUT)
