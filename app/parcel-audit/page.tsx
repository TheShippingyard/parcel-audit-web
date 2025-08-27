// app/parcel-audit/page.tsx
"use client";

import { useMemo, useState } from "react";
import * as Papa from "papaparse";
import { jsPDF } from "jspdf";

type Row = Record<string, any>;

type Discrepancy = {
  tracking: string;
  invoice: string;
  carrierAmount: number;
  posAmount: number;
  difference: number;
  note: "Overbilled" | "Underbilled – Review" | "Match – OK";
};

function cleanMoney(x: any): number {
  if (x == null) return 0;
  let s = String(x).trim();
  const parenNeg = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, "").replace(/[^0-9.\-]/g, "");
  if (!s || s === "-" || s === ".") return 0;
  const n = Number(s);
  if (isNaN(n)) return 0;
  return parenNeg ? -Math.abs(n) : n;
}

function getByHeader(r: Row, header: string) {
  if (r[header] != null) return r[header];
  const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const map: Record<string, string> = {};
  Object.keys(r || {}).forEach((k) => (map[norm(k)] = k));
  const key = map[norm(header)];
  return key ? r[key] : undefined;
}

function parseCSV(file: File): Promise<Row[]> {
  return new Promise((resolve) => {
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve((res.data as Row[]).filter(Boolean)),
    });
  });
}

// PostalMate: skip first 9 rows so row 10 is the header
function parsePostalMate(file: File): Promise<Row[]> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || "");
      const lines = raw.split(/\r?\n/);
      const cleaned = lines.slice(9).join("\n");
      const parsed = Papa.parse<Row>(cleaned, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });
      const data = (parsed.data as Row[]).filter(
        (r) => r && Object.values(r).some((v) => String(v ?? "").trim() !== "")
      );
      resolve(data);
    };
    reader.readAsText(file);
  });
}

// UPS: Tracking Number + Billed Charge + Invoice Number
async function buildUPSMap(files: FileList | null) {
  const out: Record<string, { amt: number; invoice: string }> = {};
  if (!files || !files.length) return { map: out, rows: 0 };

  const TRACKING_H = "Tracking Number"; // col E
  const AMOUNT_H = "Billed Charge";     // col AB
  const INVOICE_H = "Invoice Number";

  const parts = await Promise.all(Array.from(files).map(parseCSV));
  const rows = parts.flat();

  rows.forEach((r) => {
    const tracking = String(getByHeader(r, TRACKING_H) ?? "").trim();
    if (!tracking) return;
    const amt = cleanMoney(getByHeader(r, AMOUNT_H) ?? 0);
    const invoice = String(getByHeader(r, INVOICE_H) ?? "").trim();
    if (!out[tracking]) out[tracking] = { amt: 0, invoice };
    out[tracking].amt += amt;
    if (!out[tracking].invoice && invoice) out[tracking].invoice = invoice;
  });

  return { map: out, rows: rows.length };
}

// PostalMate: Tracking # + PostalMate amount
async function buildPostalMateMap(files: FileList | null) {
  const out: Record<string, number> = {};
  if (!files || !files.length) return { map: out, rows: 0 };

  const TRACKING_H = "Tracking #"; // col D
  const AMOUNT_H = "PostalMate";   // col E

  const parts = await Promise.all(Array.from(files).map(parsePostalMate));
  const rows = parts.flat();

  rows.forEach((r) => {
    const tracking = String(getByHeader(r, TRACKING_H) ?? "").trim();
    if (!tracking) return;
    const amt = cleanMoney(getByHeader(r, AMOUNT_H) ?? 0);
    out[tracking] = (out[tracking] || 0) + amt;
  });

  return { map: out, rows: rows.length };
}

// Export table to CSV
function exportDiscrepanciesCSV(rows: Discrepancy[]) {
  if (!rows.length) return;
  const headers = [
    "Tracking #",
    "Invoice #",
    "UPS Billed Charge",
    "PostalMate Amount",
    "Difference",
    "Note",
  ];

  const lines = rows.map((r) => [
    r.tracking,
    r.invoice || "",
    r.carrierAmount.toFixed(2),
    r.posAmount.toFixed(2),
    r.difference.toFixed(2),
    r.note,
  ]);

  const csv = [headers, ...lines]
    .map((a) =>
      a
        .map((cell) => {
          const s = String(cell ?? "");
          if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `parcel_audit_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Shared steps (for Copy + PDF)
const DISPUTE_STEPS = [
  "Log in to ups.com.",
  "Open the Billing Center from the side dashboard.",
  "Go to My Invoices.",
  "Click the blue Invoice Number link for the invoice you want to dispute.",
  "Find your shipment by the Tracking Number.",
  "Under ACTION, click the three dots (⋯) and choose Dispute.",
  "Select your dispute reason and add any comments.",
  "Click Submit. Dispute Submitted!",
];

const HISTORY_STEPS = [
  "In Billing Center, look at the left dashboard.",
  "Click Dispute & Refund History (just below My Invoices).",
  "View the status of submitted disputes, decisions, and refunds.",
  "Use filters (date, invoice) to narrow results.",
];

function stepsToClipboardText() {
  const lines = [
    "How to Create a UPS Dispute",
    ...DISPUTE_STEPS.map((s, i) => `${i + 1}. ${s}`),
    "",
    "Where to Find Dispute & Refund History",
    ...HISTORY_STEPS.map((s, i) => `${i + 1}. ${s}`),
  ];
  return lines.join("\n");
}

async function copyStepsToClipboard() {
  const text = stepsToClipboardText();
  try {
    await navigator.clipboard.writeText(text);
    alert("Steps copied to clipboard ✅");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    alert("Steps copied to clipboard ✅");
  }
}

function downloadStepsPDF() {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const left = 54;
  let y = 64;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("How to Create a UPS Dispute", left, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  DISPUTE_STEPS.forEach((s, i) => {
    const line = `${i + 1}. ${s}`;
    const split = doc.splitTextToSize(line, 500);
    split.forEach((ln: string) => {
      if (y > 740) { doc.addPage(); y = 64; }
      doc.text(ln, left, y);
      y += 16;
    });
  });

  y += 16;
  if (y > 740) { doc.addPage(); y = 64; }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Where to Find Dispute & Refund History", left, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  HISTORY_STEPS.forEach((s, i) => {
    const line = `${i + 1}. ${s}`;
    const split = doc.splitTextToSize(line, 500);
    split.forEach((ln: string) => {
      if (y > 740) { doc.addPage(); y = 64; }
      doc.text(ln, left, y);
      y += 16;
    });
  });

  const fname = `UPS_Dispute_and_History_${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(fname);
}

export default function ParcelAuditPage() {
  const [upsFiles, setUPSFiles] = useState<FileList | null>(null);
  const [posFiles, setPosFiles] = useState<FileList | null>(null);

  const [carrierRows, setCarrierRows] = useState(0);
  const [posRows, setPosRows] = useState(0);

  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const [showDisputeHelp, setShowDisputeHelp] = useState(false);
  const [showHistoryHelp, setShowHistoryHelp] = useState(false);

  async function handleAudit() {
    if (!upsFiles || !upsFiles.length) {
      alert("Upload UPS invoice CSVs first.");
      return;
    }
    if (!posFiles || !posFiles.length) {
      alert("Upload PostalMate CSV(s) next.");
      return;
    }

    setIsRunning(true);
    try {
      const ups = await buildUPSMap(upsFiles);
      const pos = await buildPostalMateMap(posFiles);

      setCarrierRows(ups.rows);
      setPosRows(pos.rows);

      const all = new Set<string>([...Object.keys(ups.map), ...Object.keys(pos.map)]);
      const out: Discrepancy[] = [];

      for (const t of all) {
        const cObj = ups.map[t];
        const c = cObj?.amt ?? 0;
        const invoice = cObj?.invoice ?? "";
        const p = pos.map[t] ?? 0;
        const diff = c - p;

        let note: Discrepancy["note"] = "Match – OK";
        if (Math.abs(diff) > 0.01) note = diff > 0 ? "Overbilled" : "Underbilled – Review";

        out.push({ tracking: t, invoice, carrierAmount: c, posAmount: p, difference: diff, note });
      }

      out.sort((a, b) => {
        const aScore = a.note === "Match – OK" ? 1 : 0;
        const bScore = b.note === "Match – OK" ? 1 : 0;
        if (aScore !== bScore) return aScore - bScore;
        return Math.abs(b.difference) - Math.abs(a.difference);
      });

      setDiscrepancies(out);
    } finally {
      setIsRunning(false);
    }
  }

  const summary = useMemo(() => {
    let overAmt = 0, underAmt = 0, overCount = 0, underCount = 0, okCount = 0;
    discrepancies.forEach((d) => {
      if (d.note === "Overbilled") { overAmt += d.difference; overCount++; }
      else if (d.note === "Underbilled – Review") { underAmt += -d.difference; underCount++; }
      else { okCount++; }
    });
    return { overAmt, underAmt, overCount, underCount, okCount, total: discrepancies.length };
  }, [discrepancies]);

  return (
    <div className="space-y-6">
      {/* Header card */}
      <section className="card p-6">
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--brand-primary)" }}>
          Parcel Audit — UPS vs PostalMate
        </h1>
        <p className="mt-2 text-slate-600">
          Match by <b>Tracking #</b>. Compare <b>UPS “Billed Charge”</b> vs <b>PostalMate</b>. Includes <b>Invoice #</b> for disputes.
        </p>
      </section>

      {/* Uploads */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <div className="font-semibold mb-2">UPS Invoice CSV(s)</div>
          <input type="file" accept=".csv" multiple onChange={(e) => setUPSFiles(e.target.files)} className="w-full" />
          <p className="mt-2 text-xs text-slate-500">
            Uses <b>Tracking Number</b>, <b>Billed Charge</b>, and <b>Invoice Number</b>.
          </p>
        </div>
        <div className="card p-6">
          <div className="font-semibold mb-2">PostalMate CSV(s)</div>
          <input type="file" accept=".csv" multiple onChange={(e) => setPosFiles(e.target.files)} className="w-full" />
          <p className="mt-2 text-xs text-slate-500">
            Skips the first 9 lines. Uses <b>Tracking #</b> and <b>PostalMate</b>.
          </p>
        </div>
      </section>

      {/* Actions */}
      <section className="flex flex-wrap gap-3">
        <button
          onClick={handleAudit}
          disabled={isRunning}
          className="btn btn-brand disabled:opacity-60"
        >
          {isRunning ? "Analyzing…" : "Start Audit"}
        </button>
        <button
          onClick={() => exportDiscrepanciesCSV(discrepancies)}
          disabled={!discrepancies.length}
          className="btn btn-outline disabled:opacity-60"
        >
          Export Results (CSV)
        </button>
        <button onClick={() => setShowDisputeHelp((s) => !s)} className="btn btn-outline">
          {showDisputeHelp ? "Hide UPS Dispute Steps" : "Show UPS Dispute Steps"}
        </button>
        <button onClick={() => setShowHistoryHelp((s) => !s)} className="btn btn-outline">
          {showHistoryHelp ? "Hide Dispute/Refund History" : "Where to Find Dispute/Refund History"}
        </button>
        <button onClick={copyStepsToClipboard} className="btn btn-accent">Copy Steps</button>
        <button onClick={downloadStepsPDF} className="btn btn-outline">Download PDF</button>
      </section>

      {(carrierRows || posRows) && (
        <section className="text-sm text-slate-600">
          <span className="mr-4">UPS rows: <b>{carrierRows}</b></span>
          <span>PostalMate rows: <b>{posRows}</b></span>
        </section>
      )}

      {/* Dispute + History panels */}
      {showDisputeHelp && (
        <section className="card p-6">
          <h2 className="text-lg font-bold mb-2">How to Create a UPS Dispute</h2>
          <ol className="list-decimal pl-5 space-y-1 text-slate-700">
            {DISPUTE_STEPS.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <p className="mt-3 text-xs text-slate-500">
            Tip: Use the <b>Invoice #</b> column in the table below to jump straight to the right invoice.
          </p>
        </section>
      )}

      {showHistoryHelp && (
        <section className="card p-6">
          <h2 className="text-lg font-bold mb-2">Where to Find Dispute & Refund History in UPS</h2>
          <ol className="list-decimal pl-5 space-y-1 text-slate-700">
            {HISTORY_STEPS.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </section>
      )}

      {/* Summary */}
      {discrepancies.length > 0 && (
        <section className="card p-6">
          <div className="grid gap-3 md:grid-cols-5 text-sm">
            <div className="rounded-lg border p-3 bg-slate-50">
              <div className="text-slate-500">Overbilled (count)</div>
              <div className="font-bold">{summary.overCount}</div>
            </div>
            <div className="rounded-lg border p-3 bg-slate-50">
              <div className="text-slate-500">Overbilled (total $)</div>
              <div className="font-bold">${summary.overAmt.toFixed(2)}</div>
            </div>
            <div className="rounded-lg border p-3 bg-slate-50">
              <div className="text-slate-500">Underbilled (count)</div>
              <div className="font-bold">{summary.underCount}</div>
            </div>
            <div className="rounded-lg border p-3 bg-slate-50">
              <div className="text-slate-500">Underbilled (total $)</div>
              <div className="font-bold">${summary.underAmt.toFixed(2)}</div>
            </div>
            <div className="rounded-lg border p-3 bg-slate-50">
              <div className="text-slate-500">Match (count)</div>
              <div className="font-bold">{summary.okCount}</div>
            </div>
          </div>
        </section>
      )}

      {/* Results Table */}
      {discrepancies.length > 0 && (
        <section className="card p-0 overflow-hidden">
          <div className="max-h-[70vh] overflow-auto">
            <table className="table text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th>Tracking #</th>
                  <th>Invoice #</th>
                  <th className="text-right">UPS Billed</th>
                  <th className="text-right">PostalMate</th>
                  <th className="text-right">Difference</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {discrepancies.map((d, i) => {
                  const diffColor =
                    Math.abs(d.difference) < 0.01
                      ? "text-slate-600"
                      : d.difference > 0
                      ? "text-red-600"
                      : "text-amber-600";
                  const badge =
                    d.note === "Match – OK"
                      ? "bg-green-50 text-green-700 border-green-200"
                      : d.note === "Overbilled"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-amber-50 text-amber-700 border-amber-200";
                  return (
                    <tr key={i} className={i % 2 ? "bg-slate-50/40" : ""}>
                      <td className="font-mono">{d.tracking}</td>
                      <td>{d.invoice}</td>
                      <td className="text-right">${d.carrierAmount.toFixed(2)}</td>
                      <td className="text-right">${d.posAmount.toFixed(2)}</td>
                      <td className={`text-right font-semibold ${diffColor}`}>
                        ${d.difference.toFixed(2)}
                      </td>
                      <td>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${badge}`}>
                          {d.note}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-3 text-xs text-slate-500 border-t">
            If a tracking appears multiple times across files, amounts are <b>summed per tracking</b> on each side before comparison.
          </div>
        </section>
      )}
    </div>
  );
}
