'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  BarChart3,
  FileSearch,
  ShieldCheck,
  ArrowRight,
  Building2,
  ExternalLink,
  Newspaper,
  LogOut,
} from 'lucide-react';
import { getHomepageData, getMyFunds } from '@/actions/homepage';
import type { MyFundCard, MyFundsData } from '@/actions/homepage';

// ---------- Types ----------

interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  author: string | null;
  image: string | null;
  source: string;
}

// ---------- Constants ----------

const SOURCE_STYLES: Record<string, { badge: string; gradient: string }> = {
  'Multicoin Capital': {
    badge: 'bg-blue-50 text-blue-700',
    gradient: 'from-blue-400 to-indigo-500',
  },
  'The Defiant': {
    badge: 'bg-purple-50 text-purple-700',
    gradient: 'from-purple-400 to-fuchsia-500',
  },
  Bankless: {
    badge: 'bg-amber-50 text-amber-700',
    gradient: 'from-amber-400 to-orange-500',
  },
  Decrypt: {
    badge: 'bg-emerald-50 text-emerald-700',
    gradient: 'from-emerald-400 to-teal-500',
  },
};

// ---------- Helpers ----------

function capitalizeName(name: string): string {
  return name
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatAuM(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------- Skeletons ----------

function StatSkeleton() {
  return <div className="h-5 w-16 bg-gray-200 rounded animate-pulse" />;
}

function daysSinceColor(days: number | null): string {
  if (days === null) return 'text-[#9CA3AF]';
  if (days <= 30) return 'text-emerald-600';
  if (days <= 90) return 'text-amber-500';
  return 'text-red-500';
}

function FundCardAvatar({ fundId, logoUrl }: { fundId: string; logoUrl: string | null }) {
  const [imgError, setImgError] = useState(false);
  const initial = fundId.charAt(0).toUpperCase();

  if (logoUrl && !imgError) {
    return (
      <div className="w-9 h-9 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center overflow-hidden flex-shrink-0">
        <img
          src={logoUrl}
          alt={fundId}
          className="w-6 h-6 object-contain"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div className="w-9 h-9 rounded-full bg-[#1E4B7A]/10 flex items-center justify-center text-sm font-semibold text-[#1E4B7A] flex-shrink-0">
      {initial}
    </div>
  );
}

function MyFundCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse" />
        <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
        <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
        <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
      </div>
    </div>
  );
}

function NewsCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] overflow-hidden">
      <div className="h-32 bg-gray-200 animate-pulse" />
      <div className="p-4">
        <div className="h-3 w-24 bg-gray-200 rounded animate-pulse mb-2" />
        <div className="h-4 w-full bg-gray-200 rounded animate-pulse mb-1" />
        <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse" />
      </div>
    </div>
  );
}

// ---------- Main Component ----------

export function HomepageContent() {
  const router = useRouter();

  const { data: homeData, isLoading: homeLoading } = useQuery({
    queryKey: ['homepageData'],
    queryFn: getHomepageData,
  });

  const { data: myFundsData, isLoading: myFundsLoading } = useQuery<MyFundsData>({
    queryKey: ['myFunds'],
    queryFn: getMyFunds,
  });

  const { data: newsData = [], isLoading: newsLoading } = useQuery<NewsItem[]>({
    queryKey: ['cryptoNews'],
    queryFn: async () => {
      const res = await fetch('/api/crypto-news');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 300_000,
  });

  const rawUsername = homeData?.username || 'User';
  const username = capitalizeName(rawUsername);
  const initials = username
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E7EB]">
        <div className="flex items-center justify-between px-6 h-14">
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
              <a
                href="/homepage"
                className="px-4 py-2 text-sm font-medium rounded-md bg-[#1E4B7A] text-white"
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
                className="px-4 py-2 text-sm font-medium rounded-md text-[#374151] hover:bg-[#F9FAFB]"
              >
                ODD
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#1E4B7A] text-white flex items-center justify-center text-sm font-medium">
              {initials}
            </div>
            <span className="text-sm text-[#374151] font-medium">{username}</span>
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

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Welcome Section */}
        <div className="flex flex-col items-center text-center mb-8">
          <Image
            src="/theta-blockchain-ventures-logo.png"
            alt="Theta Blockchain Ventures"
            width={180}
            height={46}
            className="mb-3"
            priority
          />
          <h1 className="text-2xl font-semibold text-[#111827]">
            {getGreeting()}, {username}
          </h1>
          <p className="text-sm text-[#6B7280] mt-0.5">{formatDate()}</p>
        </div>

        {/* My Funds */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#6B7280]" />
              <h2 className="text-sm font-semibold text-[#111827] uppercase tracking-wide">
                My Funds
              </h2>
              {myFundsData && (
                <span className="text-[10px] font-medium bg-[#1E4B7A]/10 text-[#1E4B7A] px-1.5 py-0.5 rounded-full">
                  {(myFundsData.primary.length + myFundsData.secondary.length)}
                </span>
              )}
            </div>
          </div>

          {myFundsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <MyFundCardSkeleton key={i} />
              ))}
            </div>
          ) : myFundsData && (myFundsData.primary.length + myFundsData.secondary.length) > 0 ? (
            <div className="space-y-4">
              {[
                { label: 'Primary', cards: myFundsData.primary, isPrimary: true },
                { label: 'Secondary', cards: myFundsData.secondary, isPrimary: false },
              ]
                .filter((group) => group.cards.length > 0)
                .map((group, gi, filteredGroups) => (
                  <div key={group.label}>
                    {filteredGroups.length > 1 && (
                      <p className="text-[11px] font-medium uppercase tracking-wider text-[#9CA3AF] mb-2">
                        {group.label}
                      </p>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {group.cards.map((fund) => (
                        <button
                          key={fund.fund_id}
                          onClick={() =>
                            router.push(
                              `/fund-monitoring?fundManager=${encodeURIComponent(fund.fund_id)}&tab=general`
                            )
                          }
                          className={`group text-left bg-white rounded-lg border border-[#E5E7EB] p-4 transition-all cursor-pointer ${
                            group.isPrimary
                              ? 'hover:border-[#3D7AB8] hover:shadow-md'
                              : 'hover:border-[#D1D5DB] hover:shadow-sm'
                          }`}
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <FundCardAvatar fundId={fund.fund_id} logoUrl={fund.logo_url} />
                            <p className="text-sm font-semibold text-[#111827] truncate">
                              {fund.fund_id}
                            </p>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-[#9CA3AF]">AuM</span>
                              <span className="text-xs font-medium font-mono text-[#111827]">
                                {fund.aum != null ? formatAuM(fund.aum) : '—'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-[#9CA3AF]">Committed</span>
                              <span className="text-xs font-medium font-mono text-[#111827]">
                                {formatAuM(fund.capital_committed)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-[#9CA3AF]">Last Meeting</span>
                              <span className={`text-xs font-medium ${daysSinceColor(fund.days_since_meeting)}`}>
                                {fund.days_since_meeting != null ? `${fund.days_since_meeting}d ago` : '—'}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-[#E5E7EB] p-8 text-center">
              <Building2 className="w-8 h-8 text-[#D1D5DB] mx-auto mb-2" />
              <p className="text-sm text-[#6B7280] mb-2">
                No funds are currently assigned to you.
              </p>
              <a
                href="/fund-monitoring"
                className="text-sm font-medium text-[#1E4B7A] hover:underline"
              >
                View all funds in Fund Monitoring
              </a>
            </div>
          )}
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Fund Monitoring */}
          <button
            onClick={() => router.push('/fund-monitoring')}
            className="group text-left bg-white rounded-lg border border-[#E5E7EB] p-6 transition-all hover:border-[#3D7AB8] hover:shadow-md cursor-pointer"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#1E4B7A]/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-[#1E4B7A]" />
              </div>
            </div>
            <h2 className="text-base font-semibold text-[#111827] mb-1">
              Fund Monitoring
            </h2>
            <p className="text-sm text-[#6B7280] mb-4">
              Portfolio overview, performance tracking, and vehicle analytics.
            </p>
            <div className="flex items-center gap-4 mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#6B7280]">
                  Vehicles
                </p>
                {homeLoading ? (
                  <StatSkeleton />
                ) : (
                  <p className="text-lg font-semibold font-mono text-[#111827]">
                    {homeData?.vehicleCount ?? 0}
                  </p>
                )}
              </div>
              <div className="w-px h-8 bg-[#E5E7EB]" />
              <div>
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#6B7280]">
                  Total AuM
                </p>
                {homeLoading ? (
                  <StatSkeleton />
                ) : (
                  <p className="text-lg font-semibold font-mono text-[#111827]">
                    {formatAuM(homeData?.totalAuM ?? 0)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 text-sm font-medium text-[#1E4B7A] group-hover:gap-2 transition-all">
              Open Dashboard <ArrowRight className="w-4 h-4" />
            </div>
          </button>

          {/* IDD */}
          <button
            onClick={() => router.push('/idd')}
            className="group text-left bg-white rounded-lg border border-[#E5E7EB] p-6 transition-all hover:border-[#D1D5DB] hover:shadow-sm cursor-pointer opacity-75"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#F9FAFB] flex items-center justify-center">
                <FileSearch className="w-5 h-5 text-[#6B7280]" />
              </div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-[#6B7280] bg-[#F3F4F6] px-2 py-0.5 rounded-full">
                Coming Soon
              </span>
            </div>
            <h2 className="text-base font-semibold text-[#111827] mb-1">
              Investment Due Diligence
            </h2>
            <p className="text-sm text-[#6B7280] mb-4">
              IDD workflows, checklists, and documentation management.
            </p>
            <div className="flex items-center gap-4 mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#6B7280]">
                  Fund Managers
                </p>
                {homeLoading ? (
                  <StatSkeleton />
                ) : (
                  <p className="text-lg font-semibold font-mono text-[#111827]">
                    {homeData?.fundManagerCount ?? 0}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 text-sm font-medium text-[#6B7280] group-hover:gap-2 transition-all">
              View IDD <ArrowRight className="w-4 h-4" />
            </div>
          </button>

          {/* ODD */}
          <button
            onClick={() => router.push('/odd')}
            className="group text-left bg-white rounded-lg border border-[#E5E7EB] p-6 transition-all hover:border-[#D1D5DB] hover:shadow-sm cursor-pointer opacity-75"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#F9FAFB] flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-[#6B7280]" />
              </div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-[#6B7280] bg-[#F3F4F6] px-2 py-0.5 rounded-full">
                Coming Soon
              </span>
            </div>
            <h2 className="text-base font-semibold text-[#111827] mb-1">
              Operational Due Diligence
            </h2>
            <p className="text-sm text-[#6B7280] mb-4">
              ODD assessments, risk monitoring, and compliance tracking.
            </p>
            <div className="flex items-center gap-1 text-sm font-medium text-[#6B7280] group-hover:gap-2 transition-all">
              View ODD <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        </div>

        {/* Latest Crypto News */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-[#6B7280]" />
              <h2 className="text-sm font-semibold text-[#111827] uppercase tracking-wide">
                Latest Crypto News
              </h2>
            </div>
            <span className="text-[11px] text-[#9CA3AF]">
              Multicoin &middot; Defiant &middot; Bankless &middot; Decrypt
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {newsLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <NewsCardSkeleton key={i} />
                ))
              : newsData.map((item, i) => {
                  const styles = SOURCE_STYLES[item.source] || {
                    badge: 'bg-gray-50 text-gray-600',
                    gradient: 'from-gray-400 to-gray-500',
                  };
                  return (
                    <a
                      key={`${item.source}-${i}`}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group bg-white rounded-lg border border-[#E5E7EB] overflow-hidden hover:border-[#D1D5DB] hover:shadow-md transition-all"
                    >
                      {/* Image or gradient header */}
                      <div
                        className={`h-32 w-full bg-gradient-to-br ${styles.gradient} relative overflow-hidden`}
                      >
                        {item.image ? (
                          <img
                            src={item.image}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center opacity-20">
                            <span className="text-white text-4xl font-bold">
                              {item.source.charAt(0)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${styles.badge}`}
                          >
                            {item.source}
                          </span>
                          {item.pubDate && (
                            <span className="text-[11px] text-[#9CA3AF]">
                              {timeAgo(item.pubDate)}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-[#111827] line-clamp-2 group-hover:text-[#1E4B7A] transition-colors mb-1">
                          {item.title}
                        </h3>
                        {item.description && (
                          <p className="text-xs text-[#6B7280] line-clamp-2">
                            {item.description}
                          </p>
                        )}
                        <div className="flex items-center gap-1 mt-2 text-[11px] text-[#9CA3AF] group-hover:text-[#1E4B7A] transition-colors">
                          Read more
                          <ExternalLink className="w-3 h-3" />
                        </div>
                      </div>
                    </a>
                  );
                })}
          </div>
        </div>
      </main>
    </div>
  );
}
