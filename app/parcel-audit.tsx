// app/parcel-audit.tsx
"use client";

import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle2, Download, FileUp, Loader2, Settings as SettingsIcon, UploadCloud, XCircle, ChevronRight } from "lucide-react";

/**
 * Parcel Audit Web MVP – Branded for The Shipping Yard
 * Steps: UPS → PostalMate → ShipRite → Settings → Results
 * Discrepancies: Late, DIM mismatch, Duplicate, Address correction, Voided
 * Exports: Claim list CSV, Training PDF (auto-generated), All rows CSV
 *
 * Fully client-side (no backend) using PapaParse + jsPDF
 */

// ---- Brand ----
const BRAND = {
  name: "The Shipping Yard",
  accent: "#16a34a", // green-600
  accentSoft: "#dcfce7", // green-100
  textMuted: "#475569",
};

// ---- Normalized schema ----
const SCHEMA = [
  "StoreID","SourceSystem","Carrier","InvoiceDate","AccountNumber","TrackingNumber",
  "ServiceLevel","ShipDate","PromisedDeliveryDate","DeliveredTimestamp",
  "From_Zip","To_Zip","BilledWeight_LB","ActualWeight_LB",
  "Length_in","Width_in","Height_in",
  "BaseRate_Billed","FuelSurcharge_Billed","OtherSurcharges_Billed","ChargeDescription",
  "IsVoidedLabel","ChargeID"
] as const;

type Row = Record<(typeof SCHEMA)[number], string | number | boolean | null>;

type Settings = {
  upsDim: number;
  fedexDim: number;
  uspsDim: number;
  claimWindowDays: number;
  poundRounding: number;
};

const DEFAULT_SETTINGS: Settings = {
  upsDim: 139,
  fedexDim: 139,
  uspsDim: 166,
  claimWindowDays: 15,
  poundRounding: 1,
};

// ---- Header guesses for mapping (adjust to match your exports) ----
const HEADER_GUESS = {
  UPS: {
    StoreID: "StoreID",
    Carrier: "Carrier",
    InvoiceDate: "Invoice Date",
    AccountNumber: "Shipper Number",
    TrackingNumber: "Tracking Number",
    ServiceLevel: "Service",
    ShipDate: "Ship Date",
    PromisedDeliveryDate: "Guaranteed Delivery",
    DeliveredTimestamp: "Delivery Date/Time",
    From_Zip: "Shipper Zip",
    To_Zip: "Recipient Zip",
    BilledWeight_LB: "Billed Weight",
    ActualWeight_LB: "Actual Weight",
    Length_in: "Length",
    Width_in: "Width",
    Height_in: "Height",
    BaseRate_Billed: "Transportation Charges",
    FuelSurcharge_Billed: "Fuel Surcharge",
    OtherSurcharges_Billed: "Other Charges",
    ChargeDescription: "Charge Type",
    IsVoidedLabel: "Voided",
    ChargeID: "Invoice Number",
  },
  PostalMate: {
    StoreID: "StoreID",
    Carrier: "Carrier",
    InvoiceDate: "Invoice Date",
    AccountNumber: "Account #",
    TrackingNumber: "Tracking Number",
    ServiceLevel: "Service",
    ShipDate: "Ship Date",
    PromisedDeliveryDate: "Promised Delivery",
    DeliveredTimestamp: "Delivery Date/Time",
    From_Zip: "From ZIP",
    To_Zip: "To ZIP",
    BilledWeight_LB: "Billed Weight",
    ActualWeight_LB: "Actual Weight",
    Length_in: "Length",
    Width_in: "Width",
    Height_in: "Height",
    BaseRate_Billed: "Base Charge",
    FuelSurcharge_Billed: "Fuel Surcharge",
    OtherSurcharges_Billed: "Other Surcharges",
    ChargeDescription: "Charge Description",
    IsVoidedLabel: "Voided",
    ChargeID: "Invoice Number",
  },
  ShipRite: {
    StoreID: "StoreID",
    Carrier: "Carrier",
    InvoiceDate: "Invoice Date",
    AccountNumber: "Account #",
    TrackingNumber: "Tracking Number",
    ServiceLevel: "Service",
    ShipDate: "Ship Date",
    PromisedDeliveryDate: "Promised Delivery",
    DeliveredTimestamp: "Delivery Date/Time",
    From_Zip: "From ZIP",
    To_Zip: "To ZIP",
    BilledWeight_LB: "Billed Weight",
    ActualWeight_LB: "Actual Weight",
    Length_in: "Length",
    Width_in: "Width",
    Height_in: "Height",
    BaseRate_Billed: "Base Charge",
    FuelSurcharge_Billed: "Fuel Surcharge",
    OtherSurcharges_Billed: "Other Surcharges",
    ChargeDescription: "Charge Description",
    IsVoidedLabel: "Voided",
    ChargeID: "Invoice Number",
  }
} as const;

// ---- CSV helpers ----
function coalesce(
  r: Record<string, any>,
  keys: readonly string[],
  fallback: string | number = ""
): string {
  for (const k of keys) {
    const v = r[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return String(fallback);
}

    });
  });
}

function coalesce(row: Record<string, any>, keys: string[], fallback = "") {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return fallback;
}

function toNumber(val: any): number {
  const n = typeof val === "number" ? val : parseFloat((val ?? "").toString().replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function toBool(val: any): boolean {
  const s = (val ?? "").toString().trim().toLowerCase();
  return s === "true" || s === "yes" || s === "1";
}

function dateFrom(rowVal: any): Date | null {
  if (!rowVal) return null;
  const s = rowVal.toString();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function ceilTo(n: number, step: number) {
  if (step <= 0) return Math.ceil(n);
  return Math.ceil(n / step) * step;
}

// Normalize a row using a header mapping object
function normalize(rows: Record<string, any>[], sourceSystem: keyof typeof HEADER_GUESS): Row[] {
  const map = HEADER_GUESS[sourceSystem];
  return rows.map((r) => {
    const out: Row = {
      StoreID: coalesce(r, [map.StoreID], "Store-TSY"),
      SourceSystem: sourceSystem,
      Carrier: coalesce(r, [map.Carrier], sourceSystem === "UPS" ? "UPS" : coalesce(r, [map.Carrier], "UPS")),
      InvoiceDate: coalesce(r, [map.InvoiceDate], ""),
      AccountNumber: coalesce(r, [map.AccountNumber], ""),
      TrackingNumber: coalesce(r, [map.TrackingNumber], ""),
      ServiceLevel: coalesce(r, [map.ServiceLevel], ""),
      ShipDate: coalesce(r, [map.ShipDate], ""),
      PromisedDeliveryDate: coalesce(r, [map.PromisedDeliveryDate], ""),
      DeliveredTimestamp: coalesce(r, [map.DeliveredTimestamp], ""),
      From_Zip: coalesce(r, [map.From_Zip], ""),
      To_Zip: coalesce(r, [map.To_Zip], ""),
      BilledWeight_LB: toNumber(coalesce(r, [map.BilledWeight_LB], 0)),
      ActualWeight_LB: toNumber(coalesce(r, [map.ActualWeight_LB], 0)),
      Length_in: toNumber(coalesce(r, [map.Length_in], 0)),
      Width_in: toNumber(coalesce(r, [map.Width_in], 0)),
      Height_in: toNumber(coalesce(r, [map.Height_in], 0)),
      BaseRate_Billed: toNumber(coalesce(r, [map.BaseRate_Billed], 0)),
      FuelSurcharge_Billed: toNumber(coalesce(r, [map.FuelSurcharge_Billed], 0)),
      OtherSurcharges_Billed: toNumber(coalesce(r, [map.OtherSurcharges_Billed], 0)),
      ChargeDescription: coalesce(r, [map.ChargeDescription], ""),
      IsVoidedLabel: toBool(coalesce(r, [map.IsVoidedLabel], false)),
      ChargeID: coalesce(r, [map.ChargeID], ""),
    };
    return out;
  });
}

// ---- Audit engine ----
export type AuditRow = Row & {
  DIM_Factor: number;
  DIM_Weight: number;
  Billable_Expected: number;
  Billed_vs_Expected_LB: number;
  LateBy_Minutes: number;
  Flag_LateDelivery: boolean;
  Flag_DIM_Mismatch: boolean;
  Flag_DuplicateCharge: boolean;
  Flag_AddressCorrection: boolean;
  Flag_VoidedLabelCharged: boolean;
  Flag_FuelMissing: boolean;
  Flag_SaturdayDelivery: boolean;
  Flag_Residential: boolean;
  Days_Since_Delivery: number;
  Claim_Eligible: boolean;
};

function computeAudit(all: Row[], settings: Settings): AuditRow[] {
  // Duplicate detection map: key = TrackingNumber + ChargeID
  const dupMap = new Map<string, number>();
  for (const r of all) {
    const key = `${r.TrackingNumber ?? ""}|${r.ChargeID ?? ""}`;
    dupMap.set(key, (dupMap.get(key) || 0) + 1);
  }

  const now = new Date().getTime();

  return all.map((r) => {
    const carrier = (r.Carrier || "").toString();
    const dimFactor = carrier.includes("UPS") ? settings.upsDim : carrier.includes("FedEx") ? settings.fedexDim : settings.uspsDim;

    const L = Number(r.Length_in) || 0;
    const W = Number(r.Width_in) || 0;
    const H = Number(r.Height_in) || 0;
    const dimWeightRaw = (L && W && H && dimFactor) ? (L * W * H) / dimFactor : 0;
    const dimWeight = ceilTo(dimWeightRaw, settings.poundRounding);

    const actual = Number(r.ActualWeight_LB) || 0;
    const billed = Number(r.BilledWeight_LB) || 0;
    const expected = Math.max(actual, dimWeight || 0);
    const billedVs = billed && expected ? billed - expected : 0;

    const promised = dateFrom(r.PromisedDeliveryDate);
    const delivered = dateFrom(r.DeliveredTimestamp);
    const lateMins = promised && delivered ? Math.max(0, (delivered.getTime() - promised.getTime()) / 60000) : 0;
    const flagLate = !!(promised && delivered && delivered > promised);

    const key = `${r.TrackingNumber ?? ""}|${r.ChargeID ?? ""}`;
    const flagDup = (dupMap.get(key) || 0) > 1;

    const desc = (r.ChargeDescription || "").toString().toLowerCase();
    const flagAddr = desc.includes("address");
    const flagVoid = desc.includes("void");
    const flagFuelMissing = (carrier.includes("UPS") || carrier.includes("FedEx")) && (Number(r.FuelSurcharge_Billed) || 0) === 0;
    const flagSat = desc.includes("saturday");
    const flagRes = desc.includes("residential");

    const daysSinceDel = delivered ? Math.floor((now - delivered.getTime()) / (86400 * 1000)) : 9999;

    const flagDim = Math.abs(billedVs) >= 1; // at least 1 lb diff

    const claimEligible = (daysSinceDel <= settings.claimWindowDays) && (flagLate || flagDim || flagDup || flagAddr || flagVoid);

    return {
      ...r,
      DIM_Factor: dimFactor,
      DIM_Weight: dimWeight || 0,
      Billable_Expected: expected || 0,
      Billed_vs_Expected_LB: billedVs || 0,
      LateBy_Minutes: lateMins || 0,
      Flag_LateDelivery: flagLate,
      Flag_DIM_Mismatch: flagDim,
      Flag_DuplicateCharge: flagDup,
      Flag_AddressCorrection: flagAddr,
      Flag_VoidedLabelCharged: flagVoid,
      Flag_FuelMissing: flagFuelMissing,
      Flag_SaturdayDelivery: flagSat,
      Flag_Residential: flagRes,
      Days_Since_Delivery: daysSinceDel,
      Claim_Eligible: claimEligible,
    };
  });
}

function exportCsv(rows: any[], filename: string) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportTrainingPDF() {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 48;
  let y = margin;
  const line = (txt: string, size = 11, gap = 16) => {
    doc.setFontSize(size); doc.text(txt, margin, y); y += gap;
  };
  doc.setTextColor(0,0,0);
  doc.setFont("helvetica","bold");
  doc.setFontSize(18); doc.text(`${BRAND.name} – Parcel Audit Quick Start`, margin, y); y += 24;
  doc.setFont("helvetica","normal");
  line("1) Export CSVs:", 13, 18);
  line("   • UPS Billing Center – include tracking, service, ship/delivered, weights/dims, base/fuel/other.");
  line("   • PostalMate – Shipments report.");
  line("   • ShipRite – Shipping Detail report.");
  y += 8;
  line("2) Upload in the web tool:", 13, 18);
  line("   Step 1: UPS CSV  →  Step 2: PostalMate  →  Step 3: ShipRite.");
  y += 8;
  line("3) Review Settings:", 13, 18);
  line("   DIM factors, claim window (default 15 days), rounding.");
  y += 8;
  line("4) Results:", 13, 18);
  line("   We flag: Late Delivery, DIM mismatch, Duplicate charges, Address correction, Voided label.");
  line("   Click ‘Export Claim List’ to get a CSV you can submit in carrier portals.");
  y += 8;
  line("Tips:", 13, 18);
  line(" • If headers differ, rename your CSV headers to the guesses shown in the app’s Settings tooltip.");
  line(" • For USPS, expected fuel may be $0 – that’s normal.");
  line(" • Keep proofs (tracking, timestamps) for claims.");
  doc.save("Parcel_Audit_Quick_Start.pdf");
}

function prettyCount(rows: AuditRow[], key: keyof AuditRow) {
  return rows.filter((r) => Boolean(r[key])).length;
}

const STEPS = [
  { id: 1, label: "UPS CSV" },
  { id: 2, label: "PostalMate CSV" },
  { id: 3, label: "ShipRite CSV" },
  { id: 4, label: "Settings" },
  { id: 5, label: "Results" },
];

export default function ParcelAuditWebMVPBranded() {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [upsRows, setUpsRows] = useState<Row[]>([]);
  const [pmRows, setPmRows] = useState<Row[]>([]);
  const [srRows, setSrRows] = useState<Row[]>([]);
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);

  const allRows = useMemo(() => [...upsRows, ...pmRows, ...srRows], [upsRows, pmRows, srRows]);
  const audited = useMemo(() => computeAudit(allRows, settings), [allRows, settings]);
  const discrepancies = useMemo(
    () => audited.filter((r) => r.Flag_LateDelivery || r.Flag_DIM_Mismatch || r.Flag_DuplicateCharge || r.Flag_AddressCorrection || r.Flag_VoidedLabelCharged),
    [audited]
  );

  async function handleUpload(file: File, source: keyof typeof HEADER_GUESS) {
    setLoading(true);
    try {
      const raw = await parseCsv(file);
      const norm = normalize(raw, source);
      if (source === "UPS") setUpsRows(norm);
      else if (source === "PostalMate") setPmRows(norm);
      else setSrRows(norm);
    } finally {
      setLoading(false);
    }
  }

  const progress = Math.round(((step - 1) / (STEPS.length - 1)) * 100);

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Top bar branding */}
      <div className="w-full border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl" style={{ background: BRAND.accent }} />
            <div className="font-semibold">{BRAND.name}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => exportTrainingPDF()}>
              Download Training PDF
            </Button>
            <Button variant="secondary" onClick={() => exportCsv(audited, "all_rows.csv")} disabled={!audited.length}>
              Export All CSV
            </Button>
            <Button onClick={() => exportCsv(discrepancies, "claim_list.csv")} disabled={!discrepancies.length}>
              <Download className="mr-2 h-4 w-4" /> Claim List
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Wizard header */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5" /> Step {step} of {STEPS.length}
              <span className="text-sm font-normal text-neutral-500">{STEPS[step-1].label}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progress} className="h-2" />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center">
                  <div className={`rounded-full px-2 py-0.5 ${step>=s.id?"text-white":"text-neutral-600"}`} style={{ background: step>=s.id?BRAND.accent:BRAND.accentSoft }}>{s.label}</div>
                  {i<STEPS.length-1 && <ChevronRight className="mx-1 h-4 w-4 text-neutral-400"/>}
                </div>
              ))}
            </div>

            {step === 1 && (
              <StepUpload label="Upload UPS CSV" loading={loading} rows={upsRows} onBack={undefined} onNext={() => setStep(2)} onUpload={(f)=>handleUpload(f,"UPS")} />
            )}
            {step === 2 && (
              <StepUpload label="Upload PostalMate CSV" loading={loading} rows={pmRows} onBack={()=>setStep(1)} onNext={() => setStep(3)} onUpload={(f)=>handleUpload(f,"PostalMate")} />
            )}
            {step === 3 && (
              <StepUpload label="Upload ShipRite CSV" loading={loading} rows={srRows} onBack={()=>setStep(2)} onNext={() => setStep(4)} onUpload={(f)=>handleUpload(f,"ShipRite")} />
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-neutral-700"><SettingsIcon className="h-4 w-4"/> Settings</div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <SettingInput label="UPS DIM" value={settings.upsDim} onChange={(v)=>setSettings((s)=>({...s, upsDim:v}))} />
                  <SettingInput label="FedEx DIM" value={settings.fedexDim} onChange={(v)=>setSettings((s)=>({...s, fedexDim:v}))} />
                  <SettingInput label="USPS DIM" value={settings.uspsDim} onChange={(v)=>setSettings((s)=>({...s, uspsDim:v}))} />
                  <SettingInput label="Claim Window (days)" value={settings.claimWindowDays} onChange={(v)=>setSettings((s)=>({...s, claimWindowDays:v}))} />
                  <SettingInput label="Pound Rounding" value={settings.poundRounding} onChange={(v)=>setSettings((s)=>({...s, poundRounding:v}))} />
                </div>
                <div className="flex gap-2">
