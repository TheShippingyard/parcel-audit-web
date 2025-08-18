"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      {/* HERO */}
      <section className="text-center py-20 bg-gradient-to-b from-blue-600 to-blue-800 text-white">
        <div className="max-w-5xl mx-auto px-6">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Stop Overpaying Carriers. Keep 100% of Your Refunds.
          </h1>
          <p className="text-lg md:text-2xl max-w-3xl mx-auto mb-8 opacity-95">
            Upload your FedEx, UPS, or DHL invoices and your POS data. Our audit tool flags late deliveries,
            billing errors, and guaranteed refunds—without taking a commission.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="bg-yellow-400 text-black hover:bg-yellow-500">
              <a href="#pricing">Start Free Trial</a>
            </Button>
            <Button asChild size="lg" variant="secondary" className="bg-white text-blue-800 hover:bg-gray-100">
              <a href="#how-it-works">See How It Works</a>
            </Button>
          </div>
          <div className="mt-8 text-sm opacity-90">Works with FedEx • UPS • DHL • PostalMate • ShipRite</div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { emoji: "📂", title: "Upload Carrier CSV", text: "Upload your FedEx, UPS, or DHL shipment data." },
              { emoji: "⚖️", title: "Upload POS Data", text: "Add PostalMate or ShipRite export for cross-checking." },
              { emoji: "💰", title: "See Refunds Owed", text: "We flag late deliveries, duplicates & surcharges." },
            ].map((i, idx) => (
              <Card key={idx} className="h-full">
                <CardContent className="text-center py-10">
                  <div className="text-5xl mb-4">{i.emoji}</div>
                  <div className="text-xl font-semibold mb-2">{i.title}</div>
                  <p className="text-slate-600">{i.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARISON */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">Why Choose Us Over Franklin Parcel?</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-200 text-sm md:text-base">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-3 text-left">Feature</th>
                  <th className="border p-3 text-left">Franklin Parcel</th>
                  <th className="border p-3 text-left">Our Tool</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border p-3">Pricing</td>
                  <td className="border p-3">25–50% commission per refund</td>
                  <td className="border p-3">Flat monthly fee</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border p-3">Control</td>
                  <td className="border p-3">They file on your behalf</td>
                  <td className="border p-3">You file, you keep 100%</td>
                </tr>
                <tr>
                  <td className="border p-3">Transparency</td>
                  <td className="border p-3">Refunds behind-the-scenes</td>
                  <td className="border p-3">Every discrepancy is visible</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border p-3">Setup</td>
                  <td className="border p-3">Carrier login required</td>
                  <td className="border p-3">Simple CSV uploads</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">Features That Save You Money</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              "Late delivery refund detection",
              "Duplicate charge alerts",
              "Residential surcharge validation",
              "Fuel surcharge sanity checks",
              "Service-level guarantee tracking",
              "Exportable PDF/CSV reports",
            ].map((f, i) => (
              <Card key={i}><CardContent className="p-6">✅ {f}</CardContent></Card>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">Simple Pricing</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-8 text-center">
                <div className="text-xl font-semibold mb-2">Starter</div>
                <div className="text-4xl font-bold mb-4">$29<span className="text-lg">/mo</span></div>
                <ul className="text-slate-600 mb-6 space-y-1">
                  <li>Up to 500 shipments/month</li>
                  <li>Late delivery checks</li>
                  <li>CSV/PDF reports</li>
                </ul>
                <Button asChild className="w-full">
                  <a href="/signup">Start Free Trial</a>
                </Button>
              </CardContent>
            </Card>

            <Card className="border-blue-600 border-2">
              <CardContent className="p-8 text-center">
                <div className="text-xl font-semibold mb-2">Pro</div>
                <div className="text-4xl font-bold mb-4">$79<span className="text-lg">/mo</span></div>
                <ul className="text-slate-600 mb-6 space-y-1">
                  <li>Up to 5,000 shipments/month</li>
                  <li>All Starter features</li>
                  <li>Duplicates & surcharge detection</li>
                  <li>Priority support</li>
                </ul>
                <Button asChild className="w-full">
                  <a href="/signup">Start Free Trial</a>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-8 text-center">
                <div className="text-xl font-semibold mb-2">Enterprise</div>
                <div className="text-4xl font-bold mb-4">$199<span className="text-lg">/mo</span></div>
                <ul className="text-slate-600 mb-6 space-y-1">
                  <li>Unlimited shipments</li>
                  <li>Multi-location support</li>
                  <li>Dedicated success rep</li>
                </ul>
                <Button asChild className="w-full" variant="secondary">
                  <a href="/contact">Contact Sales</a>
                </Button>
              </CardContent>
            </Card>
          </div>
          <p className="text-center text-sm text-slate-600 mt-4">7-day free trial · Cancel anytime</p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 bg-blue-700 text-white text-center">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-4xl font-bold mb-4">Ready to Stop Leaving Refunds on the Table?</h2>
          <p className="text-lg mb-8 opacity-95">Get started today with a free trial. No commission. No surprises.</p>
          <Button asChild size="lg" className="bg-yellow-400 text-black hover:bg-yellow-500">
            <a href="/signup">Start Free Trial</a>
          </Button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} The Shipping Yard · All rights reserved.
      </footer>
    </main>
  );
}
