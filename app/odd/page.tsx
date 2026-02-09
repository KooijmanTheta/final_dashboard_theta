'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { ComingSoonCard } from '@/components/dashboard/coming-soon-card';

function capitalizeName(name: string): string {
  return name
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export default function ODDPage() {
  const [username, setUsername] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/check')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) setUsername(data.username);
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
  };

  const displayName = username ? capitalizeName(username) : '';
  const initials = displayName
    ? displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'TC';

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <header className="bg-white border-b border-[#E5E7EB]">
        <div className="flex items-center justify-between px-6 h-14">
          <div className="flex items-center gap-8">
            <div className="font-semibold text-[#1E4B7A] text-lg">
              Theta Capital
            </div>
            <nav className="flex items-center gap-1">
              <a
                href="/homepage"
                className="px-4 py-2 text-sm font-medium rounded-md text-[#374151] hover:bg-[#F9FAFB]"
              >
                Homepage
              </a>
              <a
                href="/fund-monitoring"
                className="px-4 py-2 text-sm font-medium rounded-md text-[#374151] hover:bg-[#F9FAFB]"
              >
                Fund Monitoring
              </a>
              <a
                href="/idd"
                className="px-4 py-2 text-sm font-medium rounded-md text-[#374151] hover:bg-[#F9FAFB]"
              >
                IDD
              </a>
              <a
                href="/odd"
                className="px-4 py-2 text-sm font-medium rounded-md bg-[#1E4B7A] text-white"
              >
                ODD
              </a>
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
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6">
        <ComingSoonCard
          title="Operational Due Diligence (ODD)"
          description="Operational due diligence scoring, service provider tracking, and compliance monitoring will be available here."
        />
      </main>
    </div>
  );
}
