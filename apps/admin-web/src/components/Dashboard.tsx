import { DashboardData } from '@/api/client';

interface DashboardProps {
  data: DashboardData | null;
}

export function Dashboard({ data }: DashboardProps) {
  if (!data) return null;

  return (
    <details className="bg-neo-cream border-[3px] border-black shadow-neo-sm mb-4">
      <summary className="p-3 font-bold flex justify-between items-center cursor-pointer select-none">
        <span>Dashboard Stats</span>
        <span className="text-sm bg-white px-2 py-1 border-[2px] border-black">
          {data.completedSessions} | Rp {(data.totalRevenue / 1000).toFixed(0)}k
        </span>
      </summary>
      <div className="grid grid-cols-2 gap-3 p-4 border-t-[3px] border-black">
        <div className="bg-white border-[3px] border-black p-3">
          <p className="text-xs font-bold text-gray-600 mb-1">Total Sessions</p>
          <p className="text-2xl font-bold">{data.totalSessions}</p>
        </div>
        <div className="bg-white border-[3px] border-black p-3">
          <p className="text-xs font-bold text-gray-600 mb-1">Completed</p>
          <p className="text-2xl font-bold">{data.completedSessions}</p>
        </div>
        <div className="bg-white border-[3px] border-black p-3">
          <p className="text-xs font-bold text-gray-600 mb-1">Total Photos</p>
          <p className="text-2xl font-bold">{data.totalPhotos}</p>
        </div>
        <div className="bg-white border-[3px] border-black p-3">
          <p className="text-xs font-bold text-gray-600 mb-1">Revenue</p>
          <p className="text-2xl font-bold">Rp {data.totalRevenue.toLocaleString()}</p>
        </div>
      </div>
    </details>
  );
}
