interface BoothCardProps {
  boothId: string;
  name?: string;
  isOnline: boolean;
  lastSync: string | null;
  revenue: number;
  sessions: number;
}

export default function BoothCard({
  boothId,
  name,
  isOnline,
  lastSync,
  revenue,
  sessions,
}: BoothCardProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-white border-4 border-black shadow-neo p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold">{name || boothId}</h3>
        <span
          className={`px-3 py-1 text-sm font-bold border-2 border-black ${
            isOnline ? 'bg-neo-lime' : 'bg-gray-300'
          }`}
        >
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-600">Today Revenue</p>
          <p className="text-lg font-bold">{formatCurrency(revenue)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-600">Sessions</p>
          <p className="text-lg font-bold">{sessions}</p>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Last sync: {formatLastSync(lastSync)}
      </div>
    </div>
  );
}
