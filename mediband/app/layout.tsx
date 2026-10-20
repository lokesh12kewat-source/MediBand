import type { Metadata } from 'next';
import './globals.css';
import NavShell from '@/components/layout/NavShell';
import DemoDrawer from '@/components/layout/DemoDrawer';

export const metadata: Metadata = {
  title: 'MediBand — Evidence-Backed Medication Intelligence',
  description:
    'MediBand identifies medicines and shows you the evidence. Real-time code-print verification & adherence intelligence.',
  keywords:
    'medication management, medicine identification, evidence-based, medication adherence, GS1 DataMatrix',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="app-shell">
          <NavShell />
          <main className="app-main" id="main-content">
            {children}
          </main>
          <footer className="app-footer">
            <span style={{ fontWeight: 800, color: '#0d9488' }}>MediBand</span> · Evidence-Backed
            Medication Intelligence · Prototype mode. Data stored locally (localStorage),
            unencrypted. Do not enter real clinical health records.
          </footer>
        </div>
        <DemoDrawer />
      </body>
    </html>
  );
}
