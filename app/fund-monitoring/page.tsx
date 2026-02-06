import { Suspense } from 'react';
import { FundMonitoringContent } from './fund-monitoring-content';

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="bg-white border-b border-[#E5E7EB] h-14" />
      <div className="bg-white border-b border-[#E5E7EB] h-12" />
      <div className="bg-white border-b border-[#E5E7EB] px-6 py-4">
        <div className="flex items-end gap-6">
          <div className="h-9 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-9 w-64 bg-gray-200 rounded animate-pulse" />
          <div className="h-9 w-40 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
      <main className="max-w-[1600px] mx-auto px-6 py-6">
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-8">
          <div className="text-center text-[#6B7280]">Loading...</div>
        </div>
      </main>
    </div>
  );
}

export default function FundMonitoringPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <FundMonitoringContent />
    </Suspense>
  );
}
