// ======= PAGE.tsx — Late Delivery + Duplicate Charges + Surcharge Checks (UPS/FedEx/DHL) =======
"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { jsPDF } from "jspdf";
import { addBusinessDays, isAfter, parse } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

// ---------------- Brand ----------------
const BRAND = {
  name: "The Shipping Yard",
  accent: "#16a34a",
  accentSoft: "#dcfce7",
  textMuted: "#475569",
};

// ---------------- Types ----------------
type Row = Record<string, any>;

type Item = { tracking: string; side: "CarrierOnly" | "POSOnly"; note: string };

type LateRow = {
  tracking: string;
  carrier: "UPS" | "FedEx" | "DHL";
  service: string;
  shipDate: string;
  delivered: string;
  billed?: string;
};

type ChargeIssue = {
  tracking: string;
  carrier: string;
  description: string;
  amount: number;
  note: string;
};

// ---------------- Header keys (shared) ----------------
const CARRIER_KEYS = [
  "TrackingNumber",
  "Tracking Number",
  "Tracking #",
  "Tracking ID",
  "Waybill",
  "Air Waybill",
  "AWB",
  "Shipment Number",
  "Tracking",
  "Express or Ground Tracking ID", // FedEx
  "Tracking Number 1",
  "Package Tracking Number", // UPS variants
];
const POS_KEYS = ["TrackingNumber", "Tracking Number", "Tracking #", "Tracking"] as const;

// POS residential/business hints
const POS_ADDR_KEYS = [
  "Address Type",
  "Residential",
  "Is Residential",
  "Residential Indicator",
  "Dest Type",
  "Recipient Type",
] as const;

// FedEx-specific columns
const FEDEX_COLS = {
  tracking: ["Express or Ground Tracking ID", "Tracking ID", "TrackingNumber", "Tracking Number", "Tracking #"],
  service: ["Service Type"],
  shipDate: ["Shipment Date", "Ship Date"],
  podDate: ["POD Delivery Date", "Delivery Date"],
  podTime: ["POD Delivery Time", "Delivery Time"],
  netCharge: ["Net Charge Amount", "Transportation Charge Amount"],
} as const;

// UPS-specific columns
const UPS_COLS = {
  tracking: ["Tracking Number", "Tracking Number 1", "Package Tracking Number", "Tracking #"],
  service: ["Service", "Service Level", "Service Code", "Shipment Service"],
  shipDate: ["Ship Date", "Shipment Date"],
  podDate: ["Delivery Date", "Actual Delivery Date", "Billed Delivery Date"],
  podTime: ["Delivery Time", "Actual Delivery Time"],
  netCharge: ["Net Charges", "Transportation Charges", "Total Charges", "Net Amount"],
} as const;

// DHL-specific columns
const DHL_COLS = {
  tracking: ["Air Waybill", "AWB", "Waybill Number", "Shipment Number", "Tracking Number"],
  service: ["Product", "Service", "Service Type"],
  shipDate: ["Shipment Date", "Ship Date", "Pickup Date"],
  podDate: ["Delivery Date", "POD Date"],
  podTime: ["Delivery Time", "POD Time"],
  netCharge: ["Total Net Amount", "Charges", "Net Charge Amount", "Shipment Amount"],
} as const;

// Service rules (prototype/simplified)
const FEDEX_RULES: Record<string, { days: number; cutoff: string }> = {
  "FEDEX PRIORITY OVERNIGHT": { days: 1, cutoff: "10:30" },
  "FEDEX STANDARD OVERNIGHT": { days: 1, cutoff: "15:00" },
  "FEDEX 2DAY": { days: 2, cutoff: "20:00" },
  "FEDEX EXPRESS SAVER": { days: 3, cutoff: "20:00" },
};
const UPS_RULES: Record<string, { days: number; cutoff: string }> = {
  "UPS NEXT DAY AIR": { days: 1, cutoff: "10:30" },
  "UPS NEXT DAY AIR SAVER": { days: 1, cutoff: "15:00" },
  "UPS 2ND DAY AIR": { days: 2, cutoff: "20:00" },
  "UPS 3 DAY SELECT": { days: 3, cutoff: "20:00" },
};
const DHL_RULES: Record<string, { days: number; cutoff: string }> = {
  "DHL EXPRESS WORLDWIDE": { days: 1, cutoff: "20:00" },
  "DHL EXPRESS 12:00": { days: 1, cutoff: "12:00" },
  "DHL EXPRESS 9:00": { days: 1, cutoff: "09:00" },
  "DHL EXPRESS 10:30": { days: 1, cutoff: "10:30" },
  "DHL ECONOMY SELECT": { days: 2, cutoff: "20:00" },
};

// ---------------- Utils ----------------
// getVal now supports flexible, normalized header matches
function getVal(r: Row, keys: readonly string[]) {
  // exact match first
  for (const k of keys) if (r[k] != null && r[k] !== "") return String(r[k]).trim();

  // normalized fallback
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const rowIndex: Record<string, string> = {};
  for (const key of Object.keys(r)) rowIndex[norm(key)] = key;

  for (const k of keys) {
    const hit = rowIndex[norm(k)];
    if (hit && r[hit] != null && r[hit] !== "") return String(r[hit]).trim();
  }
  return "";
}

function parseFile(e: React.ChangeEvent<HTMLInputElement>, setData: (rows: Row[]) => void) {
  const file = e.target.files?.[0];
  if (!file) return;
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (res) => setData((res.data as Row[]).filter(Boolean)),
  });
}

// --- Robust auto-parser for PostalMate / ShipRite: auto-detects where the real table starts ---
function autoParsePOSCSV(
  e: React.ChangeEvent<HTMLInputElement>,
  setData: (rows: Row[]) => void
) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const raw = String(reader.result || "");

    // Quick sniff (no headers) to locate the first header-like row
    const preview = Papa.parse<string[]>(raw, { header: false, skipEmptyLines: true }).data as string[][];
    const headerCandidates = [
      /tracking\s*#|tracking\s*number|tracking\b/i,
      /service\b|service\s*type/i,
      /ship\s*date|shipment\s*date/i,
      /delivered|delivery\s*date|delivery\s*time/i,
      /charges?|amount|net\s*charge/i,
      /recipient|customer|consignee/i,
    ];

    let headerIndex = -1;
    for (let i = 0; i < preview.length; i++) {
      const row = (preview[i] || []).map((c) => String(c || ""));
      const hits = headerCandidates.reduce((acc, rx) => acc + (row.some((c) => rx.test(c)) ? 1 : 0), 0);
      if (hits >= 2) { // treat this as the table header
        headerIndex = i;
        break;
      }
    }

    // If found, reparse from that row onward with header=true; else fall back to header=true from start
    let csvForTable = raw;
    if (headerIndex >= 0) {
      const lines = raw.split(/\r?\n/);
      csvForTable = lines.slice(headerIndex).join("\n");
    }

    const parsed = Papa.parse<Row>(csvForTable, { header: true, skipEmptyLines: true });
    const rows = (parsed.data as Row[]).filter((r) => r && Object.keys(r).length > 0);
    setData(rows);
  };
  reader.readAsText(file);
}

function exportCSV(rows: any[], filename: string) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPDF_Discrepancies(results: Item[], counts: { carrierRows: number; posRows: number; total: number }) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const m = 48;
  let y = m;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`${BRAND.name} – Discrepancy Report`, m, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(`Carrier rows: ${counts.carrierRows}    POS rows: ${counts.posRows}    Total issues: ${counts.total}`, m, y);
  y += 16;
  doc.text("Details:", m, y);
  y += 14;
  const perPage = 30;
  let line = 0;
  results.forEach((r) => {
    doc.text(`${r.tracking} — ${r.side} — ${r.note}`, m, y);
    y += 14;
    line++;
    if (line >= perPage) {
      doc.addPage();
      y = m;
      line = 0;
    }
  });
  doc.save("discrepancy_report.pdf");
}

function downloadBlankClaimTemplate() {
  const rows = [
    {
      Carrier: "",
      AccountNumber: "",
      TrackingNumber: "",
      ServiceLevel: "",
      ShipDate: "",
      PromisedDeliveryDate: "",
      DeliveredTimestamp: "",
      IssueType: "",
      NotesForClaim: "",
      ReferenceID: "",
    },
  ];
  exportCSV(rows, "claim_template_blank.csv");
}

function downloadPrefilledClaimTemplate(results: Item[]) {
  const rows = results.map((r) => ({
    Carrier: "",
    AccountNumber: "",
    TrackingNumber: r.tracking,
    ServiceLevel: "",
    ShipDate: "",
    PromisedDeliveryDate: "",
    DeliveredTimestamp: "",
    IssueType: r.side === "POSOnly" ? "Void/Refund Request" : "Reconcile POS Record",
    NotesForClaim:
      r.side === "POSOnly"
        ? "POS shows shipment; carrier missing. If label printed/billed by mistake, request VOID/REFUND."
        : "Carrier shows shipment; POS missing. Reconcile records.",
    ReferenceID: r.tracking,
  }));
  exportCSV(rows, "claim_template_prefilled.csv");
}

// Date helpers
function tryParseDate(s: string) {
  const tryPatterns = ["M/d/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "yyyy/MM/dd"];
  for (const pat of tryPatterns) {
    try {
      return parse(s, pat, new Date());
    } catch {}
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function combineDateTime(dateStr: string, timeStr?: string) {
  const d = dateStr?.trim() || "";
  const t = (timeStr?.trim() || "").replace(/[^0-9:]/g, "");
  const base = tryParseDate(d);
  if (!base) return null;
  if (t) {
    const [hh, mm = "00"] = t.split(":");
    base.setHours(Number(hh) || 0, Number(mm) || 0, 0, 0);
  } else {
    base.setHours(23, 59, 59, 999);
  }
  return base;
}

// ---------- Late Delivery Audits ----------
function auditCarrierRows(
  rows: Row[],
  COLS: typeof FEDEX_COLS | typeof UPS_COLS | typeof DHL_COLS,
  RULES: Record<string, { days: number; cutoff: string }>,
  carrierLabel: "UPS" | "FedEx" | "DHL"
): LateRow[] {
  const out: LateRow[] = [];
  rows.forEach((row) => {
    const tracking = getVal(row, COLS.tracking as readonly string[]);
    const serviceRaw = getVal(row, COLS.service as readonly string[]);
    const serviceKey = serviceRaw.toUpperCase();
    if (!tracking || !serviceKey) return;

    // fuzzy normalize service names to known keys
    const matchedKey = Object.keys(RULES).find((k) => serviceKey.includes(k));
    if (!matchedKey) return;

    const shipDateStr = getVal(row, COLS.shipDate as readonly string[]);
    const podDateStr = getVal(row, COLS.podDate as readonly string[]);
    const podTimeStr = getVal(row, COLS.podTime as readonly string[]);
    if (!shipDateStr || !podDateStr) return;

    const shipped = tryParseDate(shipDateStr);
    const delivered = combineDateTime(podDateStr, podTimeStr);
    if (!shipped || !delivered) return;

    const promised = addBusinessDays(new Date(shipped), RULES[matchedKey].days);
    const [hh, mm] = RULES[matchedKey].cutoff.split(":").map(Number);
    promised.setHours(hh || 0, mm || 0, 0, 0);

    if (isAfter(delivered, promised)) {
      out.push({
        tracking,
        carrier: carrierLabel,
        service: serviceRaw,
        shipDate: shipDateStr,
        delivered: `${podDateStr}${podTimeStr ? " " + podTimeStr : ""}`,
        billed: getVal(row, COLS.netCharge as readonly string[]) || "",
      });
    }
  });
  return out;
}

// ---------- EXTRA BILLING CHECKS ----------
const SURCHARGE_KEYWORDS = [
  { kw: /address\s*correction/i, label: "Address Correction Fee" },
  { kw: /residential/i, label: "Residential Surcharge" },
  { kw: /saturday/i, label: "Saturday Delivery Surcharge" },
  { kw: /delivery\s*area/i, label: "Delivery Area Surcharge" },
  { kw: /additional\s*handling/i, label: "Additional Handling" },
  { kw: /oversize|large\s*package/i, label: "Oversize/Large Package" },
  { kw: /fuel\s*surcharge/i, label: "Fuel Surcharge" },
];

function toNumber(x: any): number {
  if (x == null || x === "") return 0;
  const s = String(x).replace(/[$,]/g, "");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

// Find columns like Description/Amount pairs across carrier CSVs
function findChargePairs(headers: string[]) {
  const descCols: { key: string; idx: string }[] = [];
  const amtCols: { key: string; idx: string }[] = [];
  headers.forEach((h) => {
    const m = h.match(/(Charge\s*Description|Description)\.?([0-9]+)?/i);
    if (m) descCols.push({ key: h, idx: m[2] || "" });
    const m2 = h.match(/(Charge\s*Amount|Amount)\.?([0-9]+)?/i);
    if (m2) amtCols.push({ key: h, idx: m2[2] || "" });
  });
  const pairs: { desc: string; amt: string }[] = [];
  const usedAmt = new Set<string>();
  descCols.forEach((d, i) => {
    let match = amtCols.find((a) => a.idx && a.idx === d.idx && !usedAmt.has(a.key));
    if (!match) match = amtCols.find((a, j) => j === i && !usedAmt.has(a.key));
    if (match) {
      pairs.push({ desc: d.key, amt: match.key });
      usedAmt.add(match.key);
    }
  });
  return pairs;
}

function buildPosIndex(rows: Row[]) {
  // tracking -> { isResidential: boolean | null }
  const idx: Record<string, { isResidential: boolean | null }> = {};
  rows.forEach((r) => {
    const t = getVal(r, POS_KEYS as unknown as string[]);
    if (!t) return;
    let isRes: boolean | null = null;
    for (const k of POS_ADDR_KEYS) {
      if (r[k] == null) continue;
      const v = String(r[k]).toLowerCase();
      if (["res", "residential", "r"].includes(v)) isRes = true;
      else if (["bus", "business", "commercial", "b"].includes(v)) isRes = false;
      else if (v === "true" || v === "yes" || v === "1") isRes = true;
      else if (v === "false" || v === "no" || v === "0") isRes = false;
    }
    idx[t] = { isResidential: isRes };
  });
  return idx;
}

function auditBillingIssues(rows: Row[], carrierLabel: string, trackingKeys: readonly string[], posIndex?: Record<string, { isResidential: boolean | null }>): ChargeIssue[] {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0] || {});
  const pairs = findChargePairs(headers);
  const issues: ChargeIssue[] = [];

  // map tracking -> description -> totals
  const perTrack: Record<string, { items: { desc: string; amt: number }[]; transAmt: number; fuelAmt: number }> = {};

  rows.forEach((r) => {
    const tracking = getVal(r, trackingKeys as unknown as string[]);
    if (!tracking) return;
    if (!perTrack[tracking]) perTrack[tracking] = { items: [], transAmt: 0, fuelAmt: 0 };

    const transCand = r["Transportation Charge Amount"] || r["Transportation Charges"] || r["Net Charges"] || r["Net Charge Amount"];
    perTrack[tracking].transAmt = perTrack[tracking].transAmt || toNumber(transCand);

    pairs.forEach(({ desc, amt }) => {
      const d = String(r[desc] ?? "").trim();
      const a = toNumber(r[amt]);
      if (!d || a === 0) return;

      perTrack[tracking].items.push({ desc: d, amt: a });
      if (/fuel\s*surcharge/i.test(d)) perTrack[tracking].fuelAmt += a;

      // Keyword-based flags
      const hit = SURCHARGE_KEYWORDS.find((s) => s.kw.test(d));
      if (hit) {
        // Residential mismatch check against POS (if index provided)
        let note = hit.label;
        if (/residential/i.test(d) && posIndex && tracking in posIndex) {
          const p = posIndex[tracking];
          if (p.isResidential === false) note += " — POS indicates BUSINESS, verify surcharge";
        }
        issues.push({ tracking, carrier: carrierLabel, description: d, amount: a, note });
      }
    });
  });

  // duplicate detection & fuel anomalies
  Object.entries(perTrack).forEach(([tracking, data]) => {
    const keyCount: Record<string, number> = {};
    data.items.forEach((it) => {
      const key = `${it.desc}|${it.amt.toFixed(2)}`;
      keyCount[key] = (keyCount[key] || 0) + 1;
    });
    Object.entries(keyCount).forEach(([k, count]) => {
      if (count >= 2) {
        const [desc, amtStr] = k.split("|");
        issues.push({
          tracking,
          carrier: carrierLabel,
          description: desc,
          amount: Number(amtStr),
          note: "Possible duplicate charge",
        });
      }
    });

    if (data.transAmt > 0 && data.fuelAmt > 0) {
      const pct = data.fuelAmt / data.transAmt;
      if (pct > 0.35 || pct < 0) {
        issues.push({
          tracking,
          carrier: carrierLabel,
          description: "Fuel Surcharge",
          amount: Number(data.fuelAmt.toFixed(2)),
          note: `Fuel surcharge anomaly (${(pct * 100).toFixed(1)}% of transportation)`,
        });
      }
    }
  });

  return issues;
}

function exportLateCSV(rows: LateRow[], filename: string) {
  const data = rows.map((r) => ({
    Tracking: r.tracking,
    Carrier: r.carrier,
    Service: r.service,
    ShipDate: r.shipDate,
    Delivered: r.delivered,
    BilledNet: r.billed || "",
  }));
  exportCSV(data, filename);
}

function exportChargeIssuesCSV(rows: ChargeIssue[]) {
  const data = rows.map((r) => ({
    Tracking: r.tracking,
    Carrier: r.carrier,
    Description: r.description,
    Amount: r.amount.toFixed(2),
    Note: r.note,
  }));
  exportCSV(data, "billing_issues.csv");
}

// ---------------- Page ----------------
export default function Page() {
  const [step, setStep] = useState(1);

  // Carrier rows
  const [ups, setUPS] = useState<Row[]>([]);
  const [fedex, setFedEx] = useState<Row[]>([]);
  const [dhl, setDHL] = useState<Row[]>([]);
  // POS rows
  const [postal, setPostal] = useState<Row[]>([]);
  const [shiprite, setShipRite] = useState<Row[]>([]);

  // SLG late lists
  const [upsLate, setUpsLate] = useState<LateRow[]>([]);
  const [fedexLate, setFedexLate] = useState<LateRow[]>([]);
  const [dhlLate, setDhlLate] = useState<LateRow[]>([]);

  // Billing issues (duplicates + surcharges)
  const [issues, setIssues] = useState<ChargeIssue[]>([]);

  // Upload handlers (also run audits)
  function onFedexUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const rows = (res.data as Row[]).filter(Boolean);
          setFedEx(rows);
          try {
            setFedexLate(auditCarrierRows(rows, FEDEX_COLS, FEDEX_RULES, "FedEx"));
            const posIdx = buildPosIndex([...postal, ...shiprite]);
            const extra = auditBillingIssues(rows, "FedEx", FEDEX_COLS.tracking, posIdx);
            setIssues((prev) => [...prev, ...extra]);
          } catch {
            setFedexLate([]);
          }
        },
      });
    };
    reader.readAsText(file);
  }

  function onUPSUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const rows = (res.data as Row[]).filter(Boolean);
          setUPS(rows);
          try {
            setUpsLate(auditCarrierRows(rows, UPS_COLS, UPS_RULES, "UPS"));
            const posIdx = buildPosIndex([...postal, ...shiprite]);
            const extra = auditBillingIssues(rows, "UPS", UPS_COLS.tracking, posIdx);
            setIssues((prev) => [...prev, ...extra]);
          } catch {
            setUpsLate([]);
          }
        },
      });
    };
    reader.readAsText(file);
  }

  function onDHLUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const rows = (res.data as Row[]).filter(Boolean);
          setDHL(rows);
          try {
            setDhlLate(auditCarrierRows(rows, DHL_COLS, DHL_RULES, "DHL"));
            const posIdx = buildPosIndex([...postal, ...shiprite]);
            const extra = auditBillingIssues(rows, "DHL", DHL_COLS.tracking, posIdx);
            setIssues((prev) => [...prev, ...extra]);
          } catch {
            setDhlLate([]);
          }
        },
      });
    };
    reader.readAsText(file);
  }

  // Discrepancy compare: Carrier union vs POS union (tracking only)
  const carrierSet = useMemo(
    () =>
      new Set(
        [...ups, ...fedex, ...dhl]
          .map((r) => {
            const vFedEx = getVal(r, FEDEX_COLS.tracking);
            const vUPS = getVal(r, UPS_COLS.tracking);
            const vDHL = getVal(r, DHL_COLS.tracking);
            return vFedEx || vUPS || vDHL || getVal(r, CARRIER_KEYS);
          })
          .filter(Boolean)
      ),
    [ups, fedex, dhl]
  );

  const posSet = useMemo(
    () => new Set([...postal, ...shiprite].map((r) => getVal(r, POS_KEYS as unknown as string[])).filter(Boolean)),
    [postal, shiprite]
  );

  const results = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const all = new Set<string>([...carrierSet, ...posSet]);
    for (const t of all) {
      const inCarrier = carrierSet.has(t);
      const inPOS = posSet.has(t);
      if (inCarrier && !inPOS)
        out.push({ tracking: t, side: "CarrierOnly", note: "In UPS/FedEx/DHL only → reconcile in POS." });
      if (!inCarrier && inPOS)
        out.push({ tracking: t, side: "POSOnly", note: "In POS only → consider VOID/REFUND claim." });
    }
    return out.sort((a, b) => a.tracking.localeCompare(b.tracking));
  }, [carrierSet, posSet]);

  const carrierRows = ups.length + fedex.length + dhl.length;
  const posRows = postal.length + shiprite.length;
  const counts = { carrierRows, posRows, total: results.length };

  const progress = Math.round(((step - 1) / 2) * 100);
  const canNext1 = ups.length || fedex.length || dhl.length;
  const canNext2 = postal.length || shiprite.length;

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Branded top bar */}
      <div className="border-b bg-white/90">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl" style={{ background: BRAND.accent }} />
            <div className="font-semibold">{BRAND.name}</div>
          </div>
          <div className="text-sm" style={{ color: BRAND.textMuted }}>
            Parcel Audit Wizard · UPS • FedEx • DHL ↔ PostalMate / ShipRite
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <Card>
          <CardContent className="space-y-6">
            {/* step header */}
            <div>
              <div className="text-sm" style={{ color: BRAND.textMuted }}>
                Step {step} of 3
              </div>
              <Progress value={progress} className="h-2 mt-2" />
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded-full px-2 py-0.5 ${step >= 1 ? "text-white" : "text-neutral-700"}`}
                  style={{ background: step >= 1 ? BRAND.accent : BRAND.accentSoft }}
                >
                  Carrier CSV
                </span>
                <span className="text-neutral-400">›</span>
                <span
                  className={`rounded-full px-2 py-0.5 ${step >= 2 ? "text-white" : "text-neutral-700"}`}
                  style={{ background: step >= 2 ? BRAND.accent : BRAND.accentSoft }}
                >
                  POS CSV
                </span>
                <span className="text-neutral-400">›</span>
                <span
                  className={`rounded-full px-2 py-0.5 ${step >= 3 ? "text-white" : "text-neutral-700"}`}
                  style={{ background: step >= 3 ? BRAND.accent : BRAND.accentSoft }}
                >
                  Results
                </span>
              </div>
            </div>

            {/* STEP 1 */}
            {step === 1 && (
              <div className="space-y-4">
                <p className="text-neutral-800">
                  Welcome! First, upload your <b>carrier CSV(s)</b> — you can upload one or more of <b>UPS</b>, <b>FedEx</b>, or <b>DHL</b>.
                </p>

                <div className="grid md:grid-cols-3 gap-4">
                  <div className="border rounded-lg p-3 bg-white">
                    <Label className="block mb-1">UPS CSV</Label>
                    <Input type="file" accept=".csv" onChange={onUPSUpload} />
                    <div className="text-xs mt-1" style={{ color: BRAND.textMuted }}>
                      {ups.length} rows
                    </div>
                  </div>
                  <div className="border rounded-lg p-3 bg-white">
                    <Label className="block mb-1">FedEx CSV</Label>
                    <Input type="file" accept=".csv" onChange={onFedexUpload} />
                    <div className="text-xs mt-1" style={{ color: BRAND.textMuted }}>
                      {fedex.length} rows
                    </div>
                  </div>
                  <div className="border rounded-lg p-3 bg-white">
                    <Label className="block mb-1">DHL CSV</Label>
                    <Input type="file" accept=".csv" onChange={onDHLUpload} />
                    <div className="text-xs mt-1" style={{ color: BRAND.textMuted }}>
                      {dhl.length} rows
                    </div>
                  </div>
                </div>

                <Button onClick={() => setStep(2)} disabled={!canNext1} style={{ background: BRAND.accent, color: "white" }}>
                  Next
                </Button>
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <div className="space-y-4">
                <p className="text-neutral-800">
                  Great! Now upload your <b>POS export</b> — <b>PostalMate</b> or <b>ShipRite</b> (one or both).
                </p>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-3 bg-white">
                    <Label className="block mb-1">PostalMate CSV</Label>
                    <Input
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        setIssues([]);
                        autoParsePOSCSV(e, setPostal);
                      }}
                    />
                    <div className="text-xs mt-1" style={{ color: BRAND.textMuted }}>
                      {postal.length} rows
                    </div>
                  </div>
                  <div className="border rounded-lg p-3 bg-white">
                    <Label className="block mb-1">ShipRite CSV</Label>
                    <Input
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        setIssues([]);
                        autoParsePOSCSV(e, setShipRite);
                      }}
                    />
                    <div className="text-xs mt-1" style={{ color: BRAND.textMuted }}>
                      {shiprite.length} rows
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button onClick={() => setStep(3)} disabled={!canNext2} style={{ background: BRAND.accent, color: "white" }}>
                    Next
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <div className="space-y-8">
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
                  <div className="border rounded-md p-3">
                    <div style={{ color: BRAND.textMuted }}>Carrier rows</div>
                    <div className="text-lg font-semibold">{carrierRows}</div>
                  </div>
                  <div className="border rounded-md p-3">
                    <div style={{ color: BRAND.textMuted }}>POS rows</div>
                    <div className="text-lg font-semibold">{posRows}</div>
                  </div>
                  <div className="border rounded-md p-3">
                    <div style={{ color: BRAND.textMuted }}>Discrepancies</div>
                    <div className="text-lg font-semibold">{counts.total}</div>
                  </div>
                  <div className="border rounded-md p-3">
                    <div style={{ color: BRAND.textMuted }}>UPS Late</div>
                    <div className="text-lg font-semibold">{upsLate.length}</div>
                  </div>
                  <div className="border rounded-md p-3">
                    <div style={{ color: BRAND.textMuted }}>FedEx Late</div>
                    <div className="text-lg font-semibold">{fedexLate.length}</div>
                  </div>
                  <div className="border rounded-md p-3">
                    <div style={{ color: BRAND.textMuted }}>DHL Late</div>
                    <div className="text-lg font-semibold">{dhlLate.length}</div>
                  </div>
                </div>

                {/* Late Delivery Tables */}
                {[{label:"UPS Late Deliveries (Service Guarantee)", data: upsLate, file:"ups_late_deliveries.csv"},
                  {label:"FedEx Late Deliveries (Service Level Guarantee)", data: fedexLate, file:"fedex_late_deliveries.csv"},
                  {label:"DHL Late Deliveries (Time Definite / Worldwide)", data: dhlLate, file:"dhl_late_deliveries.csv"}].map((grp, idx) => (
                  <div className="space-y-2" key={idx}>
                    <div className="text-md font-semibold">{grp.label}</div>
                    <div className="overflow-auto max-h-[45vh] border rounded-md bg-white">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0" style={{ background: BRAND.accentSoft }}>
                          <tr>
                            <th className="text-left p-2">Tracking</th>
                            <th className="text-left p-2">Carrier</th>
                            <th className="text-left p-2">Service</th>
                            <th className="text-left p-2">Ship Date</th>
                            <th className="text-left p-2">Delivered</th>
                            <th className="text-left p-2">Billed (Net)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grp.data.length === 0 ? (
                            <tr>
                              <td className="p-3" style={{ color: BRAND.textMuted }} colSpan={6}>
                                No late deliveries found.
                              </td>
                            </tr>
                          ) : (
                            grp.data.map((r, i) => (
                              <tr key={i} className="border-t">
                                <td className="p-2 font-mono">{r.tracking}</td>
                                <td className="p-2">{r.carrier}</td>
                                <td className="p-2">{r.service}</td>
                                <td className="p-2">{r.shipDate}</td>
                                <td className="p-2">{r.delivered}</td>
                                <td className="p-2">{r.billed ?? ""}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => exportLateCSV(grp.data, grp.file)}
                        disabled={!grp.data.length}
                      >
                        Export CSV
                      </Button>
                    </div>
                  </div>
                ))}

                {/* Billing issues: duplicates & surcharges */}
                <div className="space-y-2">
                  <div className="text-md font-semibold">Billing Issues (Duplicates & Surcharges)</div>
                  <div className="text-sm" style={{ color: BRAND.textMuted }}>
                    Includes duplicate charges, address correction, residential, Saturday delivery, delivery area, additional handling, oversize, and fuel surcharge anomalies.
                  </div>

                  <div className="overflow-auto max-h-[55vh] border rounded-md bg-white">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0" style={{ background: BRAND.accentSoft }}>
                        <tr>
                          <th className="text-left p-2">Tracking</th>
                          <th className="text-left p-2">Carrier</th>
                          <th className="text-left p-2">Description</th>
                          <th className="text-left p-2">Amount</th>
                          <th className="text-left p-2">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {issues.length === 0 ? (
                          <tr>
                            <td className="p-3" style={{ color: BRAND.textMuted }} colSpan={5}>
                              No billing issues detected.
                            </td>
                          </tr>
                        ) : (
                          issues.map((r, i) => (
                            <tr key={i} className="border-t">
                              <td className="p-2 font-mono">{r.tracking}</td>
                              <td className="p-2">{r.carrier}</td>
                              <td className="p-2">{r.description}</td>
                              <td className="p-2">${r.amount.toFixed(2)}</td>
                              <td className="p-2">{r.note}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => exportChargeIssuesCSV(issues)} disabled={!issues.length}>
                      Export Billing Issues CSV
                    </Button>
                  </div>
                </div>

                {/* Discrepancies union compare */}
                <div className="space-y-2">
                  <div className="text-md font-semibold">Carrier vs POS – Discrepancies</div>
                  <div className="text-sm" style={{ color: BRAND.textMuted }}>
                    Items below appear on only one side.
                    <br />
                    <b>CarrierOnly</b>: in UPS/FedEx/DHL but not in POS → reconcile POS record.
                    <br />
                    <b>POSOnly</b>: in POS but not in carrier → consider VOID/REFUND claim.
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => exportCSV(results, "discrepancies.csv")} disabled={!results.length}>
                      Export Discrepancies CSV
                    </Button>
                    <Button variant="secondary" onClick={() => exportPDF_Discrepancies(results, counts)} disabled={!results.length}>
                      Export Discrepancies PDF
                    </Button>
                    <Button variant="outline" onClick={downloadBlankClaimTemplate}>Download Claim Template (blank)</Button>
                    <Button variant="outline" onClick={() => downloadPrefilledClaimTemplate(results)} disabled={!results.length}>
                      Download Prefilled Claim CSV
                    </Button>
                  </div>

                  <div className="overflow-auto max-h-[65vh] border rounded-md bg-white">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0" style={{ background: BRAND.accentSoft }}>
                        <tr>
                          <th className="text-left p-2">Tracking</th>
                          <th className="text-left p-2">Side</th>
                          <th className="text-left p-2">Recommendation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.length === 0 ? (
                          <tr>
                            <td className="p-3" style={{ color: BRAND.textMuted }} colSpan={3}>
                              No discrepancies found.
                            </td>
                          </tr>
                        ) : (
                          results.map((r, i) => (
                            <tr key={i} className="border-t">
                              <td className="p-2 font-mono">{r.tracking}</td>
                              <td className="p-2">{r.side}</td>
                              <td className="p-2">{r.note}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setStep(2)}>
                      Back
                    </Button>
                    <Button
                      onClick={() => {
                        window.scrollTo({ top: 0, behavior: "smooth" });
                        setStep(1);
                      }}
                      style={{ background: BRAND.accent, color: "white" }}
                    >
                      Start Over
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Branded footer */}
        <div className="text-xs text-center mt-6" style={{ color: BRAND.textMuted }}>
          © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
        </div>
      </div>
    </main>
  );
}
// ======= END =======
