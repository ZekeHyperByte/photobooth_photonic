import { BoothCode } from '@/api/client';

interface StatusFilterProps {
  codes: BoothCode[];
  filter: string;
  onFilterChange: (filter: string) => void;
}

const FILTERS = ['all', 'generated', 'used', 'expired'] as const;

const filterLabels: Record<string, string> = {
  all: 'All',
  generated: 'Available',
  used: 'Used',
  expired: 'Expired',
};

export function StatusFilter({ codes, filter, onFilterChange }: StatusFilterProps) {
  const getFilterCount = (filterType: string) => {
    if (filterType === 'all') return codes.length;
    return codes.filter((c) => c.status === filterType).length;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-neo-cream border-t-[3px] border-black z-20">
      <div className="flex">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={`flex-1 py-4 min-h-[56px] font-bold text-sm border-r-[2px] border-black last:border-r-0 transition-colors ${
              filter === f ? 'bg-neo-yellow' : 'bg-white active:bg-gray-100'
            }`}
          >
            {filterLabels[f]}
            <span className="block text-xs text-gray-600">({getFilterCount(f)})</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
