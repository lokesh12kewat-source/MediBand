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
    <nav className="app-nav" aria-label="Main navigation">
      <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand / Logo */}
        <Link href="/" className="flex items-center gap-3 text-decoration-none group">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
            style={{ background: 'linear-gradient(135deg, #0d9488, #14b8a6)' }}
          >
            <ShieldCheck size={20} className="text-white" />
          </div>
          <div>
            <div
              className="font-black text-gray-800 text-base tracking-tight leading-none"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Medi<span className="text-teal-600">Band</span>
            </div>
            <p className="text-[9px] text-gray-400 font-semibold tracking-wider uppercase mt-1 leading-none">
              Evidence-Backed Medication Intelligence
            </p>
          </div>
        </Link>

        {/* Center Nav Links (Pill Container) */}
        <div className="hidden md:flex items-center bg-gray-100/90 rounded-2xl p-1 gap-1 border border-gray-200/50">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  active
                    ? 'bg-white text-teal-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={15} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>

        {/* Right Status Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 pulse-dot block" />
            <span className="text-xs font-bold text-emerald-700">Live Engine</span>
          </div>
          <div className="hidden lg:block text-right">
            <p className="text-xs font-bold text-gray-700 leading-none">Local Mode</p>
            <p className="text-[10px] text-gray-400 mt-1 leading-none">Simulated Providers</p>
          </div>
        </div>
      </div>
    </nav>
  );
}
