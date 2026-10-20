'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="1" width="6" height="6" rx="1.5"/>
        <rect x="9" y="1" width="6" height="6" rx="1.5"/>
        <rect x="1" y="9" width="6" height="6" rx="1.5"/>
        <rect x="9" y="9" width="6" height="6" rx="1.5"/>
      </svg>
    ),
  },
  {
    href: '/scan',
    label: 'Scan',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 4V2.5A1.5 1.5 0 012.5 1H4"/>
        <path d="M12 1h1.5A1.5 1.5 0 0115 2.5V4"/>
        <path d="M15 12v1.5A1.5 1.5 0 0113.5 15H12"/>
        <path d="M4 15H2.5A1.5 1.5 0 011 13.5V12"/>
        <line x1="1" y1="8" x2="15" y2="8"/>
      </svg>
    ),
  },
  {
    href: '/cabinet',
    label: 'Cabinet',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="2" width="14" height="12" rx="2"/>
        <line x1="8" y1="2" x2="8" y2="14"/>
        <line x1="3.5" y1="7.5" x2="5.5" y2="7.5"/>
        <line x1="10.5" y1="7.5" x2="12.5" y2="7.5"/>
      </svg>
    ),
  },
  {
    href: '/history',
    label: 'History',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="7"/>
        <polyline points="8,4.5 8,8 10.5,10"/>
      </svg>
    ),
  },
  {
    href: '/mediband',
    label: 'MediBand',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="12" height="8" rx="3"/>
        <line x1="5.5" y1="4" x2="4" y2="1.5"/>
        <line x1="10.5" y1="4" x2="12" y2="1.5"/>
        <line x1="5.5" y1="12" x2="4" y2="14.5"/>
        <line x1="10.5" y1="12" x2="12" y2="14.5"/>
        <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
];

export default function NavShell() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="app-nav" aria-label="Main navigation">
      <div className="nav-brand">
        <div className="nav-brand-name">
          Medi<span className="nav-brand-accent">Band</span>
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--ink-faint)', marginTop: '2px' }}>
          Evidence-backed medication management
        </div>
      </div>

      <div className="nav-links">
        {NAV_ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link${isActive(item.href) ? ' active' : ''}`}
            aria-current={isActive(item.href) ? 'page' : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </div>

      <div className="nav-footer">
        MVP · Demo Environment
      </div>
    </nav>
  );
}
