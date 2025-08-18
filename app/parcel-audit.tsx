"use client";

import Papa from "papaparse";
import { useState } from "react";
import { jsPDF } from "jspdf";
import { addBusinessDays, isAfter, parse } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";

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

function toNumber(v: string | number): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export default function ParcelAudit() {
  const [data, setData] = useState<any[]>([]);

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setData(result.data as any[]);
      },
    });
  }

  function exportPDF() {
    const doc = new jsPDF();
    doc.text("Parcel Audit Report", 10, 10);

    let y = 20;
    data.forEach((row, i) => {
      doc.text(`${i + 1}. Tracking: ${coalesce(row, ["TrackingNumber"], "")}`, 10, y);
      y += 10;
    });

    doc.save("parcel-audit.pdf");
  }

  return (
    <Card className="m-4 p-4">
      <CardContent>
        <h1 className="text-xl font-bold mb-4">Parcel Audit</h1>
        <input type="file" accept=".csv" onChange={handleFileUpload} />
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded mt-4"
          onClick={exportPDF}
        >
          Export PDF
        </button>

        <div className="mt-6">
          <h2 className="font-semibold">Preview</h2>
          <table className="table-auto border-collapse border border-gray-300 w-full text-sm mt-2">
            <thead>
              <tr>
                <th className="border px-2 py-1">Tracking #</th>
                <th className="border px-2 py-1">From Zip</th>
                <th className="border px-2 py-1">To Zip</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 10).map((row, idx) => (
                <tr key={idx}>
                  <td className="border px-2 py-1">{coalesce(row, ["TrackingNumber"], "")}</td>
                  <td className="border px-2 py-1">{coalesce(row, ["From_Zip"], "")}</td>
                  <td className="border px-2 py-1">{coalesce(row, ["To_Zip"], "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
