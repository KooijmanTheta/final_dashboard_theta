import { ComingSoonCard } from '@/components/dashboard/coming-soon-card';

export default function IDDPage() {
  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Simple Header */}
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
                className="px-4 py-2 text-sm font-medium rounded-md bg-[#1E4B7A] text-white"
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
          <div className="w-8 h-8 rounded-full bg-[#1E4B7A] text-white flex items-center justify-center text-sm font-medium">
            TC
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6">
        <ComingSoonCard
          title="Investment Due Diligence (IDD)"
          description="Investment due diligence workflows, checklists, and documentation management will be available here."
        />
      </main>
    </div>
  );
}
