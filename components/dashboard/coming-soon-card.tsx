import { Clock } from 'lucide-react';

interface ComingSoonCardProps {
  title: string;
  description: string;
}

export function ComingSoonCard({ title, description }: ComingSoonCardProps) {
  return (
    <div className="min-h-[400px] flex flex-col items-center justify-center bg-white border border-[#E5E7EB] rounded-lg">
      <div className="text-[#6B7280] mb-4">
        <Clock className="h-12 w-12" />
      </div>
      <h2 className="text-xl font-semibold text-[#111827]">{title}</h2>
      <p className="text-[#6B7280] mt-2 text-center max-w-md">{description}</p>
      <div className="mt-6 px-4 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-md text-sm text-[#6B7280]">
        Coming Soon
      </div>
    </div>
  );
}
