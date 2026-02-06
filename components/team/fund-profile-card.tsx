'use client';

import { useState, useEffect, useCallback } from 'react';
import { Building2, Globe, Linkedin, MapPin, Users, Calendar, RefreshCw, Loader2, ChevronDown, ChevronUp, ExternalLink, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

type FundProfile = {
  linkedinUrl: string | null;
  companyName: string | null;
  description: string | null;
  industry: string | null;
  companySize: string | null;
  employeeCount: number | null;
  headquarters: string | null;
  website: string | null;
  foundedYear: number | null;
  specialties: string[] | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  followerCount: number | null;
  lastScraped: string | null;
};

interface FundProfileCardProps {
  fundId: string;
}

export function FundProfileCard({ fundId }: FundProfileCardProps) {
  const [profile, setProfile] = useState<FundProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isScraping, setIsScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

  // Fetch existing profile
  const fetchProfile = useCallback(async () => {
    if (!fundId) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/fund-linkedin?fundId=${encodeURIComponent(fundId)}`);
      if (!res.ok) {
        // Table may not exist yet or other server error — treat as no profile
        console.warn('Fund profile fetch returned', res.status, '— showing empty state');
        setProfile(null);
        return;
      }
      const data = await res.json();
      setProfile(data.profile || null);
      if (data.profile?.linkedinUrl) {
        setUrlInput(data.profile.linkedinUrl);
      }
    } catch (err) {
      // Network error or JSON parse error — treat as no profile, don't show error
      console.warn('Error fetching fund profile:', err);
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, [fundId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Scrape fund LinkedIn profile
  const scrapeFundProfile = useCallback(async (url?: string, force?: boolean) => {
    const linkedinUrl = url || profile?.linkedinUrl || urlInput;
    if (!linkedinUrl || !fundId) return;

    setIsScraping(true);
    setError(null);

    try {
      // If URL is new/different, save it first
      if (url && url !== profile?.linkedinUrl) {
        await fetch('/api/fund-linkedin', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fundId, linkedinUrl: url }),
        });
      }

      const res = await fetch('/api/fund-linkedin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundId, linkedinUrl, force: force || false }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Scrape failed');

      if (data.profile) {
        setProfile(data.profile);
        setShowUrlInput(false);
      } else if (data.message) {
        // Already scraped recently - just refetch
        await fetchProfile();
      }
    } catch (err) {
      console.error('Error scraping fund profile:', err);
      setError(err instanceof Error ? err.message : 'Scrape failed');
    } finally {
      setIsScraping(false);
    }
  }, [fundId, profile?.linkedinUrl, urlInput, fetchProfile]);

  const handleUrlSubmit = () => {
    if (!urlInput.trim()) return;
    scrapeFundProfile(urlInput.trim());
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-[#6B7280]" />
          <span className="text-sm text-[#6B7280]">Loading fund profile...</span>
        </div>
      </div>
    );
  }

  // Empty state — no profile yet
  if (!profile || !profile.companyName) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB]">
        <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#6B7280]" />
            <h3 className="text-lg font-semibold text-[#111827]">Fund Company Profile</h3>
          </div>
        </div>
        <div className="p-6">
          {showUrlInput || profile?.linkedinUrl ? (
            <div className="space-y-3">
              <p className="text-sm text-[#6B7280]">
                Enter the fund&apos;s LinkedIn company page URL to scrape company information.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="https://www.linkedin.com/company/..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                  className="flex-1 px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]/20 focus:border-[#1E4B7A]"
                />
                <button
                  onClick={handleUrlSubmit}
                  disabled={!urlInput.trim() || isScraping}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#0A66C2] text-white rounded-lg hover:bg-[#094d92] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isScraping ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Scraping...
                    </>
                  ) : (
                    <>
                      <Linkedin className="h-4 w-4" />
                      Scrape Company
                    </>
                  )}
                </button>
                {!profile?.linkedinUrl && (
                  <button
                    onClick={() => { setShowUrlInput(false); setUrlInput(''); }}
                    className="px-3 py-2 text-sm text-[#6B7280] hover:text-[#111827] border border-[#E5E7EB] rounded-lg hover:bg-[#F3F4F6] transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <Building2 className="h-10 w-10 text-[#D1D5DB] mx-auto mb-3" />
              <p className="text-sm text-[#6B7280] mb-3">No fund company profile found</p>
              <button
                onClick={() => setShowUrlInput(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#0A66C2] text-white rounded-lg hover:bg-[#094d92] transition-colors"
              >
                <Linkedin className="h-4 w-4" />
                Add LinkedIn Company URL
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Profile exists — render full card
  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] overflow-hidden">
      {/* Cover Image */}
      {profile.coverImageUrl && isExpanded && (
        <div className="h-24 sm:h-32 bg-gradient-to-r from-[#1E4B7A]/20 to-[#1E4B7A]/5 overflow-hidden">
          <img
            src={profile.coverImageUrl}
            alt=""
            className="w-full h-full object-cover opacity-50"
          />
        </div>
      )}

      {/* Header — always visible */}
      <div
        className={cn(
          'px-6 py-4 flex items-center gap-4 cursor-pointer hover:bg-[#FAFAFA] transition-colors',
          isExpanded && profile.coverImageUrl && '-mt-8 relative z-10'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Logo */}
        <div className={cn(
          'rounded-lg bg-white border border-[#E5E7EB] p-2 shrink-0 shadow-sm',
          isExpanded ? 'w-16 h-16' : 'w-10 h-10'
        )}>
          {profile.logoUrl ? (
            <img
              src={profile.logoUrl}
              alt={profile.companyName || ''}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Building2 className={cn('text-[#6B7280]', isExpanded ? 'h-8 w-8' : 'h-5 w-5')} />
            </div>
          )}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <h3 className={cn('font-bold text-[#111827]', isExpanded ? 'text-lg' : 'text-base')}>
            {profile.companyName || fundId}
          </h3>
          {profile.industry && (
            <p className="text-sm text-[#6B7280]">{profile.industry}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => scrapeFundProfile(undefined, true)}
            disabled={isScraping}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#E5E7EB] text-[#374151] rounded-lg hover:bg-[#F3F4F6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isScraping ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {isScraping ? 'Scraping...' : 'Refresh'}
          </button>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-[#6B7280]" />
          ) : (
            <ChevronDown className="h-5 w-5 text-[#6B7280]" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-[#E5E7EB]">
            {(profile.employeeCount || profile.companySize) && (
              <div>
                <p className="text-xs uppercase tracking-wider text-[#9CA3AF] font-medium">
                  <Users className="h-3 w-3 inline mr-1" />
                  Employees
                </p>
                <p className="text-lg font-semibold text-[#111827] mt-0.5">
                  {profile.employeeCount
                    ? profile.employeeCount.toLocaleString()
                    : profile.companySize}
                </p>
              </div>
            )}
            {profile.followerCount && (
              <div>
                <p className="text-xs uppercase tracking-wider text-[#9CA3AF] font-medium">Followers</p>
                <p className="text-lg font-semibold text-[#111827] mt-0.5">
                  {profile.followerCount.toLocaleString()}
                </p>
              </div>
            )}
            {profile.headquarters && (
              <div>
                <p className="text-xs uppercase tracking-wider text-[#9CA3AF] font-medium">
                  <MapPin className="h-3 w-3 inline mr-1" />
                  Headquarters
                </p>
                <p className="text-sm font-medium text-[#111827] mt-0.5">{profile.headquarters}</p>
              </div>
            )}
            {profile.foundedYear && (
              <div>
                <p className="text-xs uppercase tracking-wider text-[#9CA3AF] font-medium">
                  <Calendar className="h-3 w-3 inline mr-1" />
                  Founded
                </p>
                <p className="text-lg font-semibold text-[#111827] mt-0.5">{profile.foundedYear}</p>
              </div>
            )}
          </div>

          {/* Description */}
          {profile.description && (
            <p className="text-sm text-[#6B7280] leading-relaxed line-clamp-3">
              {profile.description}
            </p>
          )}

          {/* Specialties */}
          {profile.specialties && profile.specialties.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {profile.specialties.map((s, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 text-xs bg-[#F3F4F6] text-[#374151] rounded-full"
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* Links & Metadata */}
          <div className="flex items-center gap-4 pt-2 border-t border-[#F3F4F6]">
            {profile.linkedinUrl && (
              <a
                href={profile.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-[#0A66C2] hover:underline"
              >
                <Linkedin className="h-4 w-4" />
                LinkedIn
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {profile.website && (
              <a
                href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-[#1E4B7A] hover:underline"
              >
                <Globe className="h-4 w-4" />
                Website
                <ExternalLink className="h-3 w-3" />
              </a>
            )}

            {/* Edit URL */}
            <button
              onClick={() => setShowUrlInput(!showUrlInput)}
              className="inline-flex items-center gap-1 text-xs text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Edit URL
            </button>

            {profile.lastScraped && (
              <span className="text-xs text-[#9CA3AF] ml-auto">
                Updated: {new Date(profile.lastScraped).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* URL Input (toggled) */}
          {showUrlInput && (
            <div className="flex items-center gap-3 pt-2">
              <input
                type="text"
                placeholder="https://www.linkedin.com/company/..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                className="flex-1 px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]/20 focus:border-[#1E4B7A]"
              />
              <button
                onClick={handleUrlSubmit}
                disabled={!urlInput.trim() || isScraping}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-[#0A66C2] text-white rounded-lg hover:bg-[#094d92] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isScraping ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Linkedin className="h-4 w-4" />
                )}
                {isScraping ? 'Scraping...' : 'Scrape'}
              </button>
              <button
                onClick={() => {
                  setShowUrlInput(false);
                  setUrlInput(profile.linkedinUrl || '');
                }}
                className="px-3 py-2 text-sm text-[#6B7280] hover:text-[#111827] border border-[#E5E7EB] rounded-lg hover:bg-[#F3F4F6] transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
