// app/page.tsx

export default function HomePage() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="card p-10">
        <div className="flex flex-col gap-10 md:flex-row md:items-center md:justify-between">
          {/* Left */}
          <div className="max-w-2xl">
            <h1
              className="text-5xl font-extrabold tracking-tight leading-tight"
              style={{ color: "var(--brand-primary)" }}
            >
              Parcel Audit
            </h1>
            <p className="mt-5 text-slate-600 text-lg leading-relaxed">
              Upload your <b>UPS invoice CSVs</b> and <b>PostalMate exports</b>.
              We match by <b>Tracking #</b>, compare <b>Billed Charge</b> vs{" "}
              <b>PostalMate</b>, and flag <b>Overbilled</b> shipments with the{" "}
              <b>Invoice #</b> you’ll use to dispute.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <a href="/parcel-audit" className="btn btn-brand">
                Start Audit
              </a>
              <a href="/faq" className="btn btn-outline">
                Read the FAQ
              </a>
            </div>
          </div>

          {/* Right info cards */}
          <div className="grid gap-4 w-full md:max-w-sm text-sm">
            <div className="card p-6">
              <h3 className="font-semibold text-slate-700">What you’ll get</h3>
              <ul className="mt-3 space-y-1 text-slate-600">
                <li>• Line-by-line results with Invoice #</li>
                <li>• “Overbilled / Underbilled / Match” notes</li>
                <li>• Export results to CSV</li>
                <li>• UPS dispute steps + FAQ</li>
              </ul>
            </div>
            <div className="card p-6">
              <h3 className="font-semibold text-slate-700">Supported today</h3>
              <p className="mt-3 text-slate-600">
                UPS invoices &amp; PostalMate reconciliation. FedEx/DHL POS support planned.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="grid gap-8 md:grid-cols-3">
        <div className="card p-8">
          <h3 className="font-semibold text-lg text-slate-700">
            Multi-file UPS upload
          </h3>
          <p className="mt-3 text-slate-600">
            Drop in multiple weekly invoice CSVs. We consolidate by tracking number and sum charges.
          </p>
        </div>
        <div className="card p-8">
          <h3 className="font-semibold text-lg text-slate-700">
            PostalMate parsing
          </h3>
          <p className="mt-3 text-slate-600">
            Automatically skips the first 9 lines; reads <b>Tracking #</b> and <b>PostalMate</b> amount.
          </p>
        </div>
        <div className="card p-8">
          <h3 className="font-semibold text-lg text-slate-700">
            Dispute-ready output
          </h3>
          <p className="mt-3 text-slate-600">
            Shows <b>Invoice #(s)</b> for each tracking so you can jump straight to the right UPS invoice.
          </p>
        </div>
      </section>

      {/* Secondary CTA */}
      <section className="card p-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-semibold text-slate-700 text-lg">Ready to reconcile?</h3>
          <p className="text-slate-600">Run an audit in seconds—no signup required.</p>
        </div>
        <div className="flex gap-3">
          <a href="/parcel-audit" className="btn btn-brand">Start Audit</a>
          <a href="/faq" className="btn btn-outline">FAQ</a>
        </div>
      </section>
    </div>
  );
}
