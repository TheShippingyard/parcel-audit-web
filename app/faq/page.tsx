// app/faq/page.tsx
"use client";

import { jsPDF } from "jspdf";
import { useState } from "react";

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

async function copyStepsToClipboard(setCopied: (b: boolean) => void) {
  const text = stepsToClipboardText();
  try {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
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

export default function FAQPage() {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-8">
      {/* Header */}
      <section className="card p-8">
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: "var(--brand-primary)" }}>
          FAQ — Parcel Audit
        </h1>
        <p className="mt-2 text-slate-600">
          Quick answers for store owners who want fast DIY audits.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => copyStepsToClipboard(setCopied)}
            className="btn btn-accent"
          >
            {copied ? "Copied!" : "Copy UPS Steps"}
          </button>
          <button onClick={downloadStepsPDF} className="btn btn-outline">
            Download UPS Steps (PDF)
          </button>
          <a href="/parcel-audit" className="btn btn-brand">Go to Audit Tool</a>
        </div>
      </section>

      {/* Sections */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-lg font-bold">Uploading Files</h2>
          <details className="mt-3 rounded-lg border p-4 bg-slate-50">
            <summary className="cursor-pointer font-semibold">What carrier files are supported?</summary>
            <div className="mt-2 text-slate-700">
              UPS invoice CSVs. Use the report with <b>Tracking Number</b>, <b>Billed Charge</b>, and <b>Invoice Number</b>.
            </div>
          </details>
          <details className="mt-3 rounded-lg border p-4 bg-slate-50">
            <summary className="cursor-pointer font-semibold">Can I upload multiple files at once?</summary>
            <div className="mt-2 text-slate-700">
              Yes. Select multiple weekly UPS invoices and multiple PostalMate exports. We merge them and sum by tracking.
            </div>
          </details>
          <details className="mt-3 rounded-lg border p-4 bg-slate-50">
            <summary className="cursor-pointer font-semibold">PostalMate export looks weird—how do I format it?</summary>
            <div className="mt-2 text-slate-700">
              No need. We automatically skip the first 9 title rows so row 10 becomes the header.
            </div>
          </details>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-bold">Matching & Amounts</h2>
          <details className="mt-3 rounded-lg border p-4 bg-slate-50">
            <summary className="cursor-pointer font-semibold">How do you match shipments?</summary>
            <div className="mt-2 text-slate-700">
              By <b>Tracking Number</b>: UPS <i>Tracking Number</i> ↔ PostalMate <i>Tracking #</i>. If a tracking appears more than once, we sum amounts per side before comparing.
            </div>
          </details>
          <details className="mt-3 rounded-lg border p-4 bg-slate-50">
            <summary className="cursor-pointer font-semibold">Which columns do you compare?</summary>
            <div className="mt-2 text-slate-700">
              <ul className="list-disc pl-5 space-y-1">
                <li><b>UPS:</b> Billed Charge (with Invoice Number for reference)</li>
                <li><b>PostalMate:</b> PostalMate</li>
              </ul>
            </div>
          </details>
          <details className="mt-3 rounded-lg border p-4 bg-slate-50">
            <summary className="cursor-pointer font-semibold">What do the notes mean?</summary>
            <div className="mt-2 text-slate-700">
              <ul className="list-disc pl-5 space-y-1">
                <li><b>Overbilled:</b> UPS is higher than PostalMate.</li>
                <li><b>Underbilled – Review:</b> UPS is lower than PostalMate.</li>
                <li><b>Match – OK:</b> Amounts match within 1¢.</li>
              </ul>
            </div>
          </details>
        </div>

        <div className="card p-6 md:col-span-2">
          <h2 className="text-lg font-bold">Disputes & History</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4 bg-slate-50">
              <div className="font-semibold">How do I file a UPS dispute?</div>
              <ol className="mt-2 list-decimal pl-5 space-y-1 text-slate-700">
                {DISPUTE_STEPS.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
            <div className="rounded-lg border p-4 bg-slate-50">
              <div className="font-semibold">Where can I see dispute/refund history?</div>
              <ol className="mt-2 list-decimal pl-5 space-y-1 text-slate-700">
                {HISTORY_STEPS.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          </div>
        </div>
      </section>

      <div>
        <a href="/" className="btn btn-outline">← Back to Home</a>
      </div>
    </div>
  );
}
