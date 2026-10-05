import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'STE Audit Management Tool — ISA/IFRS Compliant (Qatar / QAR)',
  description: 'Production audit management platform with 11-stage state machine, dual-key acceptance gatekeeper, split financial statement dashboard, and practice analytics.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 min-h-screen antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
