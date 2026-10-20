import type { Metadata } from 'next';
import './globals.css';
import NavShell from '@/components/layout/NavShell';
import DemoDrawer from '@/components/layout/DemoDrawer';

export const metadata: Metadata = {
  title: 'MediBand — Evidence-Backed Medication Management',
  description: 'MediBand identifies medicines and shows you the evidence. Not just an answer — the reasoning behind it.',
  keywords: 'medication management, medicine identification, evidence-based, medication adherence',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="app-shell">
          <NavShell />
          <main className="app-main" id="main-content">
            {children}
          </main>
          <footer style={{ textAlign: 'center', padding: '0.875rem 1rem', fontSize: '0.72rem', color: 'var(--ink-faint)', borderTop: '1px solid var(--border)', marginLeft: 'var(--nav-width, 0)' }}>
            Prototype. Data stays in this browser (localStorage), unencrypted. Do not enter real health information.
          </footer>
        </div>
        <DemoDrawer />
      </body>
    </html>
  );
}
