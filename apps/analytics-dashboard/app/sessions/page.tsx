import Link from 'next/link';
import { initEntityTables, getRecentSessions } from '@/lib/entities';

export const revalidate = 60;

function formatCurrency(amount: number | null) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatTime(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
}

const statusColor: Record<string, string> = {
  completed: 'bg-neo-lime',
  settlement: 'bg-neo-lime',
  capture: 'bg-neo-lime',
  pending: 'bg-neo-yellow',
};

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: { booth?: string };
}) {
  const boothId = searchParams.booth;
  let sessions: Awaited<ReturnType<typeof getRecentSessions>> = [];
  try {
    await initEntityTables();
    sessions = await getRecentSessions({ boothId, limit: 200 });
  } catch (error) {
    console.error('Failed to load sessions:', error);
  }

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">Sessions</h1>
          <p className="text-gray-600 mt-1">
            {boothId ? `Booth: ${boothId}` : 'All booths'} · {sessions.length} shown
          </p>
        </div>
        <Link href="/" className="px-4 py-2 bg-white border-2 border-black font-bold shadow-neo">
          ← Dashboard
        </Link>
      </header>

      {sessions.length === 0 ? (
        <div className="neo-card text-center py-12 bg-white border-4 border-black shadow-neo">
          <p className="text-xl text-gray-500">No synced sessions yet</p>
          <p className="text-sm text-gray-400 mt-2">
            Booths push completed sessions to the central server.
          </p>
        </div>
      ) : (
        <div className="bg-white border-4 border-black shadow-neo overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-neo-cyan border-b-4 border-black">
              <tr className="text-sm uppercase tracking-wide">
                <th className="p-3">Completed</th>
                <th className="p-3">Booth</th>
                <th className="p-3">Status</th>
                <th className="p-3">Photos</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Payment</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b-2 border-black/10 hover:bg-neo-cream">
                  <td className="p-3 whitespace-nowrap">{formatTime(s.completed_at)}</td>
                  <td className="p-3 font-medium">{s.booth_id}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 text-xs font-bold border-2 border-black ${
                        statusColor[s.status ?? ''] ?? 'bg-gray-200'
                      }`}
                    >
                      {s.status ?? '—'}
                    </span>
                  </td>
                  <td className="p-3">{s.photo_count}</td>
                  <td className="p-3">{formatCurrency(s.amount)}</td>
                  <td className="p-3">{s.txn_status ?? '—'}</td>
                  <td className="p-3">
                    <Link
                      href={`/sessions/${s.id}`}
                      className="px-3 py-1 bg-neo-yellow border-2 border-black font-bold text-sm"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
