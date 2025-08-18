// app/page.tsx — landing page
"use client";
import Link from "next/link";

export default function Landing() {
  return (
    <main style={{padding: 24}}>
      <h1 style={{fontSize: 28, fontWeight: 700}}>Welcome to Parcel Audit</h1>
      <p style={{marginTop: 8}}>
        Upload your carrier and PostalMate CSVs to find refunds and discrepancies.
      </p>
      <p style={{marginTop: 16}}>
        <Link href="/parcel-audit" style={{color:"#2563eb", textDecoration:"underline"}}>
          Start Your Audit →
        </Link>
      </p>
    </main>
  );
}
