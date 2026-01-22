import { BoothCode } from '@/api/client';

interface CodeListProps {
  codes: BoothCode[];
  filter: string;
  recentlyGenerated: string | null;
  onDelete: (code: string) => void;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'generated':
      return { bg: 'bg-neo-lime', label: 'AVAILABLE' };
    case 'used':
      return { bg: 'bg-gray-300', label: 'USED' };
    case 'expired':
      return { bg: 'bg-neo-magenta', label: 'EXPIRED' };
    default:
      return { bg: 'bg-gray-300', label: status.toUpperCase() };
  }
};

const formatTimestamp = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    month: 'short',
    day: 'numeric',
  });
};

export function CodeList({ codes, filter, recentlyGenerated, onDelete }: CodeListProps) {
  // Filter and sort codes
  const filteredCodes = codes
    .filter((c) => filter === 'all' || c.status === filter)
    .sort((a, b) => {
      // Available (generated) codes first
      if (a.status === 'generated' && b.status !== 'generated') return -1;
      if (a.status !== 'generated' && b.status === 'generated') return 1;
      // Then by date (newest first)
      return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime();
    });

  const getFilterCount = () => {
    if (filter === 'all') return codes.length;
    return codes.filter((c) => c.status === filter).length;
  };

  return (
    <>
      {/* Codes Section Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Codes [{getFilterCount()}]</h2>
      </div>

      {/* Code Cards */}
      <div className="space-y-3 pb-20">
        {filteredCodes.length === 0 ? (
          <div className="bg-white border-[3px] border-black p-8 text-center">
            <p className="text-gray-600 font-bold">
              {codes.length === 0 ? 'No codes generated yet' : 'No codes match this filter'}
            </p>
          </div>
        ) : (
          filteredCodes.map((code) => {
            const { bg, label } = getStatusBadge(code.status);
            const isRecent = recentlyGenerated === code.code;

            return (
              <div
                key={code.id}
                className={`bg-white border-[3px] border-black shadow-neo-sm transition-all ${
                  isRecent ? 'ring-4 ring-neo-yellow animate-pulse' : ''
                }`}
              >
                <div className="flex items-center justify-between p-4">
                  <p className="font-mono text-4xl font-bold tracking-wider">{code.code}</p>
                  <span
                    className={`px-3 py-1 border-[3px] border-black font-bold text-sm ${bg}`}
                  >
                    {label}
                  </span>
                </div>
                <div className="px-4 pb-3 flex justify-between items-center text-sm border-t-[2px] border-gray-200 pt-2">
                  <span className="text-gray-600">{formatTimestamp(code.generatedAt)}</span>
                  {code.status === 'generated' && (
                    <button
                      onClick={() => onDelete(code.code)}
                      className="px-3 py-1 min-h-[36px] text-red-600 font-bold border-[2px] border-red-600 active:bg-red-100"
                    >
                      Delete
                    </button>
                  )}
                  {code.status === 'used' && code.usedAt && (
                    <span className="text-gray-500">Used: {formatTimestamp(code.usedAt)}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
