import { Suspense } from 'react';
import { HomepageContent } from '@/components/homepage/homepage-content';

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="bg-white border-b border-[#E5E7EB] h-14" />
      <main className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="flex flex-col items-center text-center mb-12">
          <div className="h-[60px] w-[180px] bg-gray-200 rounded animate-pulse mb-4" />
          <div className="h-4 w-48 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="h-7 w-64 bg-gray-200 rounded animate-pulse mb-1" />
          <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-lg border border-[#E5E7EB] p-6"
            >
              <div className="w-10 h-10 bg-gray-200 rounded-lg animate-pulse mb-4" />
              <div className="h-5 w-32 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-4 w-full bg-gray-200 rounded animate-pulse mb-4" />
              <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <HomepageContent />
    </Suspense>
  );
}
