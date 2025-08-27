// app/layout.tsx
import "./globals.css";

export const metadata = {
  title: "Parcel Audit",
  description: "DIY parcel billing reconciliation tool",
  icons: { icon: "/favicon.svg" },
};

// IMPORTANT: default export must be a React Component returning <html><body>...
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/* Inter font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* App font stack */}
        <style>{`
          body {
            font-family: Inter, ui-sans-serif, system-ui, -apple-system,
              "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji",
              "Segoe UI Emoji";
          }
        `}</style>
      </head>

      <body className="min-h-screen">
        {/* Top Nav */}
        <header
          aria-label="Top navigation"
          className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur"
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <a href="/" className="flex items-center gap-3" aria-label="Parcel Audit Home">
              <img
                src="/logo-parcel-audit.svg"
                alt="Parcel Audit"
                className="h-9 w-auto"
              />
            </a>
            <nav className="flex items-center gap-1" aria-label="Primary">
              <a
                href="/"
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-slate-100"
              >
                Home
              </a>
              <a
                href="/parcel-audit"
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-slate-100"
              >
                Audit Tool
              </a>
              <a
                href="/faq"
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-slate-100"
              >
                FAQ
              </a>
            </nav>
          </div>
        </header>

        {/* Page content */}
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

        {/* Footer */}
        <footer className="mt-16 border-t bg-white">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-slate-500">
            © {new Date().getFullYear()} Parcel Audit — DIY reconciliation for
            independent stores
          </div>
        </footer>
      </body>
    </html>
  );
}
