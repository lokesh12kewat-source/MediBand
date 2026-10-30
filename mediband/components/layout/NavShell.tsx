'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ScanLine,
  Archive,
  History,
  Activity,
  ShieldCheck,
  User,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/scan', label: 'Scan', icon: ScanLine },
  { href: '/cabinet', label: 'Cabinet', icon: Archive },
  { href: '/history', label: 'History', icon: History },
  { href: '/mediband', label: 'MediBand', icon: Activity },
];

export default function NavShell() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="navbar" aria-label="Main navigation">
      <div className="navbar-inner">
        {/* Brand / Logo */}
        <Link href="/" className="navbar-brand">
          <div className="navbar-logo-icon">
            <ShieldCheck size={22} color="#ffffff" />
          </div>
          <div>
            <div className="navbar-title">
              Medi<span className="navbar-title-orange">Band</span>
            </div>
            <div className="navbar-subtitle">
              EVIDENCE-BACKED MEDICATION INTELLIGENCE
            </div>
          </div>
        </Link>

        {/* Center Nav Links */}
        <nav className="navbar-menu" aria-label="Sections">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`navbar-link${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={15} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Status Badges & Profile */}
        <div className="navbar-status">
          <div className="navbar-badge">
            <span
              className="pulse-dot"
              style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#FF6115',
              }}
            />
            <span>Live Engine</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} color="#64748B" />
            <div className="navbar-subtext">
              <div className="navbar-subtext-main">Local Mode</div>
              <div className="navbar-subtext-sub">Simulated Providers</div>
            </div>
          </div>

          <div
            className="navbar-avatar"
            title="User Profile"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#F1F5F9',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              marginLeft: '4px',
            }}
          >
            <User size={18} color="#64748B" />
          </div>
        </div>
      </div>
    </header>
  );
}
