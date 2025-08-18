// app/layout.tsx
import "./globals.css";

export const metadata = {
  title: "The Shipping Yard – Parcel Audit",
  description: "Upload carrier and PostalMate CSVs to find refunds and discrepancies.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
