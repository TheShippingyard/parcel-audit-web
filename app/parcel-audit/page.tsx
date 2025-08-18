// app/parcel-audit/page.tsx — Full Audit Wizard (UPS headers aligned)
"use client";

import { useMemo, useState } from "react";
import * as Papa from "papaparse";
import { jsPDF } from "jspdf";
import { addBusinessDays, isAfter, parse } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

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

const BRAND = { name: "The Shipping Yard", accent: "#16a34a", accentSoft: "#dcfce7", textMuted: "#475569" };

/** -------- Flexible header keys (robust to slight name differences) -------- */
const CARRIER_KEYS = [
  "Tracking Number", "TrackingNumber", "Tracking #", "Tracking ID", "Air Waybill", "AWB",
  "Shipment Number", "Express or Ground Tracking ID", "Tracking Number 1", "Package Tracking Number",
];
const POS_KEYS = ["Tracking Number", "TrackingNumber", "Tracking #", "Tracking"] as const;
const POS_ADDR_KEYS = ["Address Type", "Residential", "Is Residential", "Residential Indicator", "Dest Type", "Recipient Type"] as const;

/** -------- Carrier column maps (updated for your UPS invoice files) -------- */
// FedEx (unchanged)
const FEDEX_COLS = {
  tracking: ["Express or Ground Tracking ID","Tracking ID","Tracking Number","TrackingNumber","Tracking #"],
  service: ["Service Type","Service"],
  shipDate: ["Shipment Date","Ship Date"],
  podDate: ["POD Delivery Date","Delivery Date"],
  podTime: ["POD Delivery Time","Delivery Time"],
  netCharge: ["Net Charge Amount","Transportation Charge Amount","Total Charges"],
} as const;

// UPS (UPDATED to match your uploads: “Service Level”, “Pickup Date”, “Transportation Charges”, etc.)
const UPS_COLS = {
  tracking: ["Tracking Number","TrackingNumber","Tracking #","Package Tracking Number","Tracking Number 1"],
  service: ["Service Level","Service","Shipment Service"],
  shipDate: ["Pickup Date","Ship Date","Shipment Date"],
  // Many UPS invoice exports do NOT include delivery date/time; we’ll try POS for that if missing:
  podDate: ["Delivery Date","Actual Delivery Date","Billed Delivery Date"],
  podTime: ["Delivery Time","Actual Delivery Time"],
  // Amounts commonly present in UPS invoice:
  netCharge: ["Total Charges","Net Charges","Net Amount","Transportation Charges"],
} as const;

// DHL (unchanged)
const DHL_COLS = {
  tracking: ["Air Waybill","AWB","Waybill Number","Shipment Number","Tracking Number"],
  service: ["Product","Service","Service Type"],
  shipDate: ["Shipment Date","Ship Date","Pickup Date"],
  podDate: ["Delivery Date","POD Date"],
  podTime: ["Delivery Time","POD Time"],
  netCharge: ["Total Net Amount","Charges","Net Charge Amount","Shipment Amount","Total Charges"],
} as const;

/** -------- Prototype promise rules (for late delivery) -------- */
const FEDEX_RULES: Record<string,{days:number;cutoff:string}> = {
  "FEDEX PRIORITY OVERNIGHT": { days: 1, cutoff: "10:30" },
  "FEDEX STANDARD OVERNIGHT": { days: 1, cutoff: "15:00" },
  "FEDEX 2DAY": { days: 2, cutoff: "20:00" },
  "FEDEX EXPRESS SAVER": { days: 3, cutoff: "20:00" },
};
const UPS_RULES: Record<string,{days:number;cutoff:string}> = {
  "UPS NEXT DAY AIR": { days: 1, cutoff: "10:30" },
  "UPS NEXT DAY AIR SAVER": { days: 1, cutoff: "15:00" },
  "UPS 2ND DAY AIR": { days: 2, cutoff: "20:00" },
  "UPS 3 DAY SELECT": { days: 3, cutoff: "20:00" },
  "GROUND": { days: 5, cutoff: "20:00" }, // broad default if you want one
};
const DHL_RULES: Record<string,{days:number;cutoff:string}> = {
  "DHL EXPRESS WORLDWIDE": { days: 1, cutoff: "20:00" },
  "DHL EXPRESS 12:00": { days: 1, cutoff: "12:00" },
  "DHL EXPRESS 9:00": { days: 1, cutoff: "09:00" },
  "DHL EXPRESS 10:30": { days: 1, cutoff: "10:30" },
  "DHL ECONOMY SELECT": { days: 2, cutoff: "20:00" },
};

/** -------- Utilities -------- */
function getVal(r: Row, keys: readonly string[]) {
  // direct match first
  for (const k of keys) if (r[k] != null && r[k] !== "") return String(r[k]).trim();
  // then normalize (case/space/punct tolerant)
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map: Record<string, string> = {};
  for (const key of Object.keys(r)) map[norm(key)] = key;
  for (const k of keys) {
    const hit = map[norm(k)];
    if (hit && r[hit] != null && r[hit] !== "") return String(r[hit]).trim();
  }
  return "";
}
function toNumber(x: any): number {
  if (x == null || x === "") return 0;
  const n = Number(String(x).replace(/[$,]/g, ""));
  return isNaN(n) ? 0 : n;
}
function tryParseDate(s: string) {
  const pats = ["M/d/yyyy","MM/dd/yyyy","yyyy-MM-dd","yyyy/MM/dd"];
  for (const p of pats) {
    try { return parse(s, p, new Date()); } catch {}
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function combineDateTime(dateStr: string, timeStr?: string) {
  const base = tryParseDate((dateStr || "").trim()); if (!base) return null;
  const t = (timeStr || "").trim().replace(/[^0-9:]/g, "");
  if (t) {
    const [hh, mm = "00"] = t.split(":");
    base.setHours(Number(hh) || 0, Number(mm) || 0, 0, 0);
  } else {
    base.setHours(23, 59, 59, 999);
  }
  return base;
}

/** -------- CSV parsers -------- */
function parseCSVFile(file: File): Promise<Row[]> {
  return new Promise((resolve) => {
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: (res) => resolve((res.data as Row[]).filter(Boolean)) });
  });
}
async function parseManyCSVFiles(files: FileList | File[]): Promise<Row[]> {
  const list = Array.from(files || []);
  const parts = await Promise.all(list.map(parseCSVFile));
  return parts.flat();
}

// PostalMate/ShipRite: detect header row, then parse
function autoParsePOSFile(file: File): Promise<Row[]> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || "");
      const preview = Papa.parse<string[]>(raw, { header: false, skipEmptyLines: true }).data as string[][];
      const hdrs = [
        /tracking\s*#|tracking\s*number|tracking\b/i,
        /service\b|service\s*type/i,
        /ship\s*date|shipment\s*date/i,
        /delivered|delivery\s*date|delivery\s*time|POD/i,
        /charges?|amount|net\s*charge/i,
        /recipient|customer|consignee/i,
      ];
      let idx = -1;
      for (let i = 0; i < preview.length; i++) {
        const row = (preview[i] || []).map((c) => String(c || ""));
        const hits = hdrs.reduce((a, rx) => a + (row.some((c) => rx.test(c)) ? 1 : 0), 0);
        if (hits >= 2) { idx = i; break; }
      }
      const lines = raw.split(/\r?\n/);
      const body = idx >= 0 ? lines.slice(idx).join("\n") : raw;
      const parsed = Papa.parse<Row>(body, { header: true, skipEmptyLines: true });
      resolve((parsed.data as Row[]).filter((r) => r && Object.keys(r).length > 0));
    };
    reader.readAsText(file);
  });
}
async function parseManyPOSFiles(files: FileList | File[]): Promise<Row[]> {
  const list = Array.from(files || []);
  const parts = await Promise.all(list.map(autoParsePOSFile));
  return parts.flat();
}

// Build POS index (for extra checks, including Delivered Date)
function buildPosIndex(rows: Row[]) {
  const idx: Record<string, { isResidential: boolean | null; deliveredDate?: string; deliveredTime?: string }> = {};
  rows.forEach((r) => {
    const t = getVal(r, POS_KEYS as unknown as string[]);
    if (!t) return;
    let isRes: boolean | null = null;
    for (const k of POS_ADDR_KEYS) {
      if (r[k] == null) continue;
      const v = String(r[k]).toLowerCase();
      if (["res","residential","r"].includes(v)) isRes = true;
      else if (["bus","business","commercial","b"].includes(v)) isRes = false;
      else if (v === "true" || v === "yes" || v === "1") isRes = true;
      else if (v === "false" || v === "no" || v === "0") isRes = false;
    }
    // Common POS delivered fields
    const deliveredDate = getVal(r, ["Delivered Date","Delivery Date","POD Date","DeliveredDate","DeliveryDate"]);
    const deliveredTime = getVal(r, ["Delivered Time","Delivery Time","POD Time","DeliveredTime","DeliveryTime"]);
    idx[t] = { isResidential: isRes, deliveredDate: deliveredDate || undefined, deliveredTime: deliveredTime || undefined };
  });
  return idx;
}

/** -------- Late delivery audit -------- */
function auditCarrierRowsWithPOS(
  rows: Row[],
  COLS: typeof FEDEX_COLS | typeof UPS_COLS | typeof DHL_COLS,
  RULES: Record<string, { days: number; cutoff: string }>,
  carrierLabel: "UPS" | "FedEx" | "DHL",
  posIndex?: Record<string, { isResidential: boolean | null; deliveredDate?: string; deliveredTime?: string }>
): LateRow[] {
  const out: LateRow[] = [];
  rows.forEach((row) => {
    const tracking = getVal(row, COLS.tracking as readonly string[]);
    const serviceRaw = getVal(row, COLS.service as readonly string[]);
    const key = serviceRaw.toUpperCase();
    if (!tracking || !key) return;

    const matched = Object.keys(RULES).find((k) => key.includes(k));
    if (!matched) return;

    const shipDateStr = getVal(row, COLS.shipDate as readonly string[]);
    if (!shipDateStr) return;

    // Prefer carrier POD; if missing (UPS invoices often), try POS POD
    let podDateStr = getVal(row, COLS.podDate as readonly string[]);
    let podTimeStr = getVal(row, COLS.podTime as readonly string[]);
    if ((!podDateStr || podDateStr === "") && posIndex && tracking in posIndex) {
      podDateStr = posIndex[tracking].deliveredDate || "";
      podTimeStr = posIndex[tracking].deliveredTime || "";
    }
    if (!podDateStr) return; // still nothing: skip late check

    const shipped = tryParseDate(shipDateStr);
    const delivered = combineDateTime(podDateStr, podTimeStr);
    if (!shipped || !delivered) return;

    const promised = addBusinessDays(new Date(shipped), RULES[matched].days);
    const [hh, mm] = RULES[matched].cutoff.split(":").map(Number);
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

/** -------- Billing/surcharge audit -------- */
const SURCHARGE_KEYWORDS = [
  { kw: /address\s*correction/i, label: "Address Correction Fee" },
  { kw: /residential/i, label: "Residential Surcharge" },
  { kw: /saturday/i, label: "Saturday Delivery Surcharge" },
  { kw: /delivery\s*area/i, label: "Delivery Area Surcharge" },
  { kw: /additional\s*handling/i, label: "Additional Handling" },
  { kw: /oversize|large\s*package/i, label: "Oversize/Large Package" },
  { kw: /fuel\s*surcharge/i, label: "Fuel Surcharge" },
];

// Try to find pairs like “Charge Description 1” / “Charge Amount 1” (if present)
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
  const used = new Set<string>();
  descCols.forEach((d, i) => {
    let match = amtCols.find((a) => a.idx && a.idx === d.idx && !used.has(a.key));
    if (!match) match = amtCols.find((a, j) => j === i && !used.has(a.key));
    if (match) { pairs.push({ desc: d.key, amt: match.key }); used.add(match.key); }
  });
  return pairs;
}

function auditBillingIssues(
  rows: Row[],
  carrierLabel: string,
  trackingKeys: readonly string[],
  posIndex?: Record<string, { isResidential: boolean | null }>
): ChargeIssue[] {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0] || {});
  const pairs = findChargePairs(headers);
  const issues: ChargeIssue[] = [];
  const perTrack: Record<string, { items: { desc: string; amt: number }[]; transAmt: number; fuelAmt: number }> = {};

  rows.forEach((r) => {
    const tracking = getVal(r, trackingKeys as unknown as string[]);
    if (!tracking) return;

    if (!perTrack[tracking]) perTrack[tracking] = { items: [], transAmt: 0, fuelAmt: 0 };

    // Transportation amount (UPS invoices usually have “Transportation Charges”, but fall back to others)
    const transCand =
      r["Transportation Charges"] ||
      r["Transportation Charge Amount"] ||
      r["Net Charges"] ||
      r["Net Charge Amount"] ||
      r["Total Charges"];
    const fuelCand = r["Fuel Surcharge"] || r["Fuel Surcharge Amount"];

    perTrack[tracking].transAmt = perTrack[tracking].transAmt || toNumber(transCand);
    perTrack[tracking].fuelAmt += toNumber(fuelCand);

    // If there are explicit itemized descriptions/amounts, use them
    if (pairs.length) {
      pairs.forEach(({ desc, amt }) => {
        const d = String(r[desc] ?? "").trim();
        const a = toNumber(r[amt]);
        if (!d || a === 0) return;

        perTrack[tracking].items.push({ desc: d, amt: a });

        const hit = SURCHARGE_KEYWORDS.find((s) => s.kw.test(d));
        if (hit) {
          let note = hit.label;
          if (/residential/i.test(d) && posIndex && tracking in posIndex) {
            const p = posIndex[tracking];
            if (p.isResidential === false) note += " — POS indicates BUSINESS, verify surcharge";
          }
          issues.push({ tracking, carrier: carrierLabel, description: d, amount: a, note });
        }
      });
    } else {
      // No itemized pairs: we can still flag a generic “fuel anomaly” if fuel % looks wrong
      if (perTrack[tracking].fuelAmt > 0 && perTrack[tracking].transAmt > 0) {
        const pct = perTrack[tracking].fuelAmt / perTrack[tracking].transAmt;
        if (pct > 0.35 || pct < 0) {
          issues.push({
            tracking,
            carrier: carrierLabel,
            description: "Fuel Surcharge",
            amount: Number(perTrack[tracking].fuelAmt.toFixed(2)),
            note: `Fuel surcharge anomaly (${(pct * 100).toFixed(1)}% of transportation)`,
          });
        }
      }
    }
  });

  // Duplicate detection (only possible if we saw itemized lines)
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
  });

  return issues;
}

/** -------- Component -------- */
export default function Page() {
  // Step state
  const [step, setStep] = useState(1);

  // Carrier CSVs (multi-file)
  const [ups, setUPS] = useState<Row[]>([]);
  const [fedex, setFedEx] = useState<Row[]>([]);
  const [dhl, setDHL] = useState<Row[]>([]);

  // PostalMate per carrier (multi-file)
  const [posUPS, setPosUPS] = useState<Row[]>([]);
  const [posFedEx, setPosFedEx] = useState<Row[]>([]);
  const [posDHL, setPosDHL] = useState<Row[]>([]);

  // Optional legacy POS (keep if you still export these)
  const [postal, setPostal] = useState<Row[]>([]);
  const [shiprite, setShipRite] = useState<Row[]>([]);

  // Results
  const [upsLate, setUpsLate] = useState<LateRow[]>([]);
  const [fedexLate, setFedexLate] = useState<LateRow[]>([]);
  const [dhlLate, setDhlLate] = useState<LateRow[]>([]);
  const [issues, setIssues] = useState<ChargeIssue[]>([]);

  // Upload handlers (multi-file)
  function onUPSUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files; if (!files?.length) return;
    (async () => {
      const rows = await parseManyCSVFiles(files);
      setUPS(rows);
      try {
        const posIdx = buildPosIndex([...postal, ...shiprite, ...posUPS, ...posFedEx, ...posDHL]);
        setUpsLate(auditCarrierRowsWithPOS(rows, UPS_COLS, UPS_RULES, "UPS", posIdx)); // will use POS POD if carrier lacks
        const extra = auditBillingIssues(rows, "UPS", UPS_COLS.tracking, posIdx);
        setIssues((prev) => [...prev, ...extra]);
      } catch { setUpsLate([]); }
    })();
  }
  function onFedexUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files; if (!files?.length) return;
    (async () => {
      const rows = await parseManyCSVFiles(files);
      setFedEx(rows);
      try {
        const posIdx = buildPosIndex([...postal, ...shiprite, ...posUPS, ...posFedEx, ...posDHL]);
        setFedexLate(auditCarrierRowsWithPOS(rows, FEDEX_COLS, FEDEX_RULES, "FedEx", posIdx));
        const extra = auditBillingIssues(rows, "FedEx", FEDEX_COLS.tracking, posIdx);
        setIssues((prev) => [...prev, ...extra]);
      } catch { setFedexLate([]); }
    })();
  }
  function onDHLUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files; if (!files?.length) return;
    (async () => {
      const rows = await parseManyCSVFiles(files);
      setDHL(rows);
      try {
        const posIdx = buildPosIndex([...postal, ...shiprite, ...posUPS, ...posFedEx, ...posDHL]);
        setDhlLate(auditCarrierRowsWithPOS(rows, DHL_COLS, DHL_RULES, "DHL", posIdx));
        const extra = auditBillingIssues(rows, "DHL", DHL_COLS.tracking, posIdx);
        setIssues((prev) => [...prev, ...extra]);
      } catch { setDhlLate([]); }
    })();
  }

  /** -------- Discrepancy compare (carrier vs POS) -------- */
  const carrierSet = useMemo(
    () =>
      new Set(
        [...ups, ...fedex, ...dhl]
          .map((r) => {
            const vF = getVal(r, FEDEX_COLS.tracking);
            const vU = getVal(r, UPS_COLS.tracking);
            const vD = getVal(r, DHL_COLS.tracking);
            return vF || vU || vD || getVal(r, CARRIER_KEYS);
          })
          .filter(Boolean)
      ),
    [ups, fedex, dhl]
  );

  const posSet = useMemo(
    () =>
      new Set(
        [...postal, ...shiprite, ...posUPS, ...posFedEx, ...posDHL]
          .map((r) => getVal(r, POS_KEYS as unknown as string[]))
          .filter(Boolean)
      ),
    [postal, shiprite, posUPS, posFedEx, posDHL]
  );

  const results = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const all = new Set<string>([...carrierSet, ...posSet]);
    for (const t of all) {
      const inCarrier = carrierSet.has(t);
      const inPOS = posSet.has(t);
      if (inCarrier && !inPOS) out.push({ tracking: t, side: "CarrierOnly", note: "In UPS/FedEx/DHL only → reconcile in POS." });
      if (!inCarrier && inPOS) out.push({ tracking: t, side: "POSOnly", note: "In POS only → consider VOID/REFUND claim." });
    }
    return out.sort((a, b) => a.tracking.localeCompare(b.tracking));
  }, [carrierSet, posSet]);

  /** -------- KPIs & controls -------- */
  const carrierRows = ups.length + fedex.length + dhl.length;
  const posRows = postal.length + shiprite.length + posUPS.length + posFedEx.length + posDHL.length;
  const progress = Math.round(((step - 1) / 2) * 100);
  const canNext1 = !!(ups.length || fedex.length || dhl.length);
  const canNext2 = !!(posUPS.length || posFedEx.length || posDHL.length || postal.length || shiprite.length);

  /** -------- Export helpers -------- */
  function exportCSV(rows: any[], filename: string) {
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
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
  function exportPDF_Discrepancies(rows: Item[]) {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const m = 48; let y = m;
    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text(`${BRAND.name} – Discrepancy Report`, m, y); y += 20;
    doc.setFont("helvetica", "normal"); doc.setFontSize(12);
    doc.text(`Total issues: ${rows.length}`, m, y); y += 16;
    const perPage = 30; let line = 0;
    rows.forEach((r) => {
      doc.text(`${r.tracking} — ${r.side} — ${r.note}`, m, y);
      y += 14; line++;
      if (line >= perPage) { doc.addPage(); y = m; line = 0; }
    });
    doc.save("discrepancy_report.pdf");
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Top bar */}
      <div className="border-b bg-white/90">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl" style={{ background: BRAND.accent }} />
            <div className="font-semibold">The Shipping Yard</div>
          </div>
          <a href="/" className="text-sm hover:underline" style={{ color: BRAND.textMuted }}>← Back to Home</a>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <Card>
          <CardContent className="space-y-6">
            {/* Step header */}
            <div>
              <div className="text-sm" style={{ color: BRAND.textMuted }}>Step {step} of 3</div>
              <Progress value={progress} className="h-2 mt-2" />
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 ${step >= 1 ? "text-white" : "text-neutral-700"}`} style={{ background: step >= 1 ? BRAND.accent : BRAND.accentSoft }}>Carrier CSVs</span>
                <span className="text-neutral-400">›</span>
                <span className={`rounded-full px-2 py-0.5 ${step >= 2 ? "text-white" : "text-neutral-700"}`} style={{ background: step >= 2 ? BRAND.accent : BRAND.accentSoft }}>PostalMate CSVs</span>
                <span className="text-neutral-400">›</span>
                <span className={`rounded-full px-2 py-0.5 ${step >= 3 ? "text-white" : "text-neutral-700"}`} style={{ background: step >= 3 ? BRAND.accent : BRAND.accentSoft }}>Results</span>
              </div>
            </div>

            {/* STEP 1: Carriers */}
            {step === 1 && (
              <div className="space-y-4">
                <p className="text-neutral-800">
                  Upload your <b>carrier CSV(s)</b>. You can select multiple files per carrier.
                </p>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="border rounded-lg p-3 bg-white">
                    <Label className="block mb-1">UPS CSV(s)</Label>
                    <Input type="file" accept=".csv" multiple onChange={onUPSUpload} />
                    <div className="text-xs mt-1" style={{ color: BRAND.textMuted }}>{ups.length} rows</div>
                  </div>
                  <div className="border rounded-lg p-3 bg-white">
                    <Label className="block mb-1">FedEx CSV(s)</Label>
                    <Input type="file" accept=".csv" multiple onChange={onFedexUpload} />
                    <div className="text-xs mt-1" style={{ color: BRAND.textMuted }}>{fedex.length} rows</div>
                  </div>
                  <div className="border rounded-lg p-3 bg-white">
                    <Label className="block mb-1">DHL CSV(s)</Label>
                    <Input type="file" accept=".csv" multiple onChange={onDHLUpload} />
                    <div className="text-xs mt-1" style={{ color: BRAND.textMuted }}>{dhl.length} rows</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setStep(2)} disabled={!canNext1} style={{ background: BRAND.accent, color: "white" }}>Next</Button>
                  <Button variant="outline" onClick={() => { setUPS([]); setFedEx([]); setDHL([]); setUpsLate([]); setFedexLate([]); setDhlLate([]); setIssues([]); }}>Clear Carrier Uploads</Button>
                </div>
              </div>
            )}

            {/* STEP 2: PostalMate */}
            {step === 2 && (
              <div className="space-y-4">
                <p className="text-neutral-800">
                  Upload your <b>PostalMate</b> exports for each carrier. Each slot accepts multiple files.
                </p>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="border rounded-lg p-3 bg-white">
                    <Label className="block mb-1">PostalMate – UPS CSV(s)</Label>
                    <Input type="file" accept=".csv" multiple onChange={async (e) => { setIssues([]); const fs = e.target.files; if (!fs?.length) return; setPosUPS(await parseManyPOSFiles(fs)); }} />
                    <div className="text-xs mt-1" style={{ color: BRAND.textMuted }}>{posUPS.length} rows</div>
                  </div>
                  <div className="border rounded-lg p-3 bg-white">
                    <Label className="block mb-1">PostalMate – FedEx CSV(s)</Label>
                    <Input type="file" accept=".csv" multiple onChange={async (e) => { setIssues([]); const fs = e.target.files; if (!fs?.length) return; setPosFedEx(await parseManyPOSFiles(fs)); }} />
                    <div className="text-xs mt-1" style={{ color: BRAND.textMuted }}>{posFedEx.length} rows</div>
                  </div>
                  <div className="border rounded-lg p-3 bg-white">
                    <Label className="block mb-1">PostalMate – DHL CSV(s)</Label>
                    <Input type="file" accept=".csv" multiple onChange={async (e) => { setIssues([]); const fs = e.target.files; if (!fs?.length) return; setPosDHL(await parseManyPOSFiles(fs)); }} />
                    <div className="text-xs mt-1" style={{ color: BRAND.textMuted }}>{posDHL.length} rows</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
                  <Button onClick={() => setStep(3)} disabled={!canNext2} style={{ background: BRAND.accent, color: "white" }}>Next</Button>
                </div>
              </div>
            )}

            {/* STEP 3: Results */}
            {step === 3 && (
              <div className="space-y-8">
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
                  <div className="border rounded-md p-3"><div style={{ color: BRAND.textMuted }}>Carrier rows</div><div className="text-lg font-semibold">{carrierRows}</div></div>
                  <div className="border rounded-md p-3"><div style={{ color: BRAND.textMuted }}>POS rows</div><div className="text-lg font-semibold">{posRows}</div></div>
                  <div className="border rounded-md p-3"><div style={{ color: BRAND.textMuted }}>Discrepancies</div><div className="text-lg font-semibold">{results.length}</div></div>
                  <div className="border rounded-md p-3"><div style={{ color: BRAND.textMuted }}>UPS Late</div><div className="text-lg font-semibold">{upsLate.length}</div></div>
                  <div className="border rounded-md p-3"><div style={{ color: BRAND.textMuted }}>FedEx Late</div><div className="text-lg font-semibold">{fedexLate.length}</div></div>
                  <div className="border rounded-md p-3"><div style={{ color: BRAND.textMuted }}>DHL Late</div><div className="text-lg font-semibold">{dhlLate.length}</div></div>
                </div>

                {/* Late tables */}
                {[{ label: "UPS Late Deliveries", data: upsLate, file: "ups_late.csv" },
                  { label: "FedEx Late Deliveries", data: fedexLate, file: "fedex_late.csv" },
                  { label: "DHL Late Deliveries", data: dhlLate, file: "dhl_late.csv" }].map((grp, idx) => (
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
                            <tr><td className="p-3" style={{ color: BRAND.textMuted }} colSpan={6}>No late deliveries found.</td></tr>
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
                      <Button variant="secondary" onClick={() => exportLateCSV(grp.data, grp.file)} disabled={!grp.data.length}>Export CSV</Button>
                    </div>
                  </div>
                ))}

                {/* Billing issues */}
                <div className="space-y-2">
                  <div className="text-md font-semibold">Billing Issues (Duplicates & Surcharges)</div>
                  <div className="text-sm" style={{ color: BRAND.textMuted }}>
                    Uses itemized charge columns when available; otherwise checks fuel % vs transportation.
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
                          <tr><td className="p-3" style={{ color: BRAND.textMuted }} colSpan={5}>No billing issues detected.</td></tr>
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

                {/* Discrepancies */}
                <div className="space-y-2">
                  <div className="text-md font-semibold">Carrier vs POS – Discrepancies</div>
                  <div className="text-sm" style={{ color: BRAND.textMuted }}>
                    <b>CarrierOnly</b>: in UPS/FedEx/DHL but not in POS → reconcile POS record.<br />
                    <b>POSOnly</b>: in POS but not in carrier → consider VOID/REFUND claim.
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => exportCSV(results, "discrepancies.csv")} disabled={!results.length}>
                      Export Discrepancies CSV
                    </Button>
                    <Button variant="secondary" onClick={() => exportPDF_Discrepancies(results)} disabled={!results.length}>
                      Export Discrepancies PDF
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
                          <tr><td className="p-3" style={{ color: BRAND.textMuted }} colSpan={3}>No discrepancies found.</td></tr>
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
                    <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
                    <Button onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setStep(1); }} style={{ background: BRAND.accent, color: "white" }}>
                      Start Over
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-xs text-center mt-6" style={{ color: BRAND.textMuted }}>
          © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
        </div>
      </div>
    </main>
  );
}
