"use client";

import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold mb-6 text-gray-800">
          Welcome to Parcel Audit
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Upload your carrier invoices and POS exports to compare, reconcile, and
          save on shipping costs.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/"
            className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
          >
            Start Auditing
          </Link>
          <a
            href="https://theshippingyard.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition"
          >
            Learn More
          </a>
        </div>
      </div>
    </main>
  );
}
