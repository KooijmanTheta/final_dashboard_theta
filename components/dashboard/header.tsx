'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useFilterState } from '@/hooks/use-url-state';
import type { Tab } from '@/lib/types';
import { LogOut } from 'lucide-react';

const baseTabs: { id: Tab; label: string; visibleTo?: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'overview', label: 'Overview' },
  { id: 'historical', label: 'Historical Changes' },
  { id: 'portfolio', label: 'Portfolio Monitoring' },
  { id: 'soi', label: 'Schedule of Investments' },
  { id: 'team', label: 'Team' },
  { id: 'fm-monitoring', label: 'FM Monitoring' },
  { id: 'data-quality', label: 'Data Quality' },
  { id: 'bas', label: 'Bas', visibleTo: 'bas' },
];

const navLinks = [
  { href: '/homepage', label: 'Homepage' },
  { href: '/fund-monitoring', label: 'Fund Monitoring', active: true },
  { href: '/idd', label: 'IDD' },
  { href: '/odd', label: 'ODD' },
];

export function Header() {
  const [{ tab }, setFilters] = useFilterState();
  const [username, setUsername] = useState('');
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    fetch('/api/auth/check')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          setUsername(data.username);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    queryClient.clear();
    router.push('/login');
  };

  const displayName = username
    ? username
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
    : '';
  const initials = displayName
    ? displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'TC';

  const tabs = baseTabs.filter(
    (t) => !t.visibleTo || t.visibleTo === username.toLowerCase()
  );

  const handleTabChange = (newTab: Tab) => {
    setFilters({ tab: newTab });
  };

  return (
    <header className="bg-white border-b border-[#E5E7EB]">
      {/* Main Navigation */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-8">
          <Image
            src="/theta-blockchain-ventures-logo.png"
            alt="Theta Blockchain Ventures"
            width={140}
            height={36}
            className="h-8 w-auto"
            priority
          />
          <nav className="flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                  link.active
                    ? 'bg-[#1E4B7A] text-white'
                    : 'text-[#374151] hover:bg-[#F9FAFB]'
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#1E4B7A] text-white flex items-center justify-center text-sm font-medium">
            {initials}
          </div>
          {displayName && (
            <span className="text-sm text-[#374151] font-medium">{displayName}</span>
          )}
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-md text-[#6B7280] hover:text-[#374151] hover:bg-[#F9FAFB] transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Sub Navigation - Tabs */}
      <div className="flex items-center px-6 h-12">
        <nav className="flex items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                tab === t.id
                  ? 'bg-[#F9FAFB] text-[#1E4B7A] border border-[#E5E7EB]'
                  : 'text-[#6B7280] hover:text-[#374151] hover:bg-[#F9FAFB]'
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
