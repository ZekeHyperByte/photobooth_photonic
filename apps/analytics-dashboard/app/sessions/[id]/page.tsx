import Link from 'next/link';
import { initEntityTables, getSessionDetail } from '@/lib/entities';

export const dynamic = 'force-dynamic';

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
  return new Date(ts).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function SessionDetailPage({ params }: { params: { id: string } }) {
  let data: Awaited<ReturnType<typeof getSessionDetail>> = {
    session: null,
    photos: [],
    transactions: [],
  };
  try {
    await initEntityTables();
    data = await getSessionDetail(params.id);
  } catch (error) {
    console.error('Failed to load session:', error);
  }

  const { session, photos, transactions } = data;

  if (!session) {
    return (
      <div className="min-h-screen p-8">
        <Link href="/sessions" className="px-4 py-2 bg-white border-2 border-black font-bold shadow-neo">
          ← Sessions
        </Link>
        <div className="mt-8 bg-white border-4 border-black shadow-neo text-center py-12">
          <p className="text-xl text-gray-500">Session not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Session</h1>
          <p className="text-gray-600 font-mono text-sm mt-1">{session.id}</p>
        </div>
        <Link href="/sessions" className="px-4 py-2 bg-white border-2 border-black font-bold shadow-neo">
          ← Sessions
        </Link>
      </header>

      {/* Session facts */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          ['Booth', session.booth_id],
          ['Status', session.status ?? '—'],
          ['Package', session.package_id ?? '—'],
          ['Started', formatTime(session.started_at)],
          ['Completed', formatTime(session.completed_at)],
          ['Photos', String(photos.length)],
        ].map(([label, value]) => (
          <div key={label} className="bg-white border-4 border-black shadow-neo p-4">
            <p className="text-xs uppercase tracking-wide text-gray-600">{label}</p>
            <p className="text-lg font-bold break-words">{value}</p>
          </div>
        ))}
      </section>

      {/* Transactions */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-3">Transactions</h2>
        {transactions.length === 0 ? (
          <p className="text-gray-500">No transactions.</p>
        ) : (
          <div className="bg-white border-4 border-black shadow-neo overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-neo-magenta border-b-4 border-black text-sm uppercase">
                <tr>
                  <th className="p-3">Order</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Provider</th>
                  <th className="p-3">Paid</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t: any) => (
                  <tr key={t.id} className="border-b-2 border-black/10">
                    <td className="p-3 font-mono text-sm">{t.order_id}</td>
                    <td className="p-3 font-bold">{formatCurrency(t.gross_amount)}</td>
                    <td className="p-3">{t.payment_type}</td>
                    <td className="p-3">{t.transaction_status}</td>
                    <td className="p-3">{t.provider}</td>
                    <td className="p-3">{formatTime(t.payment_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Photos */}
      <section>
        <h2 className="text-2xl font-bold mb-3">Photos</h2>
        {photos.length === 0 ? (
          <p className="text-gray-500">No photos.</p>
        ) : (
          <div className="bg-white border-4 border-black shadow-neo overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-neo-lime border-b-4 border-black text-sm uppercase">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Version</th>
                  <th className="p-3">Retake</th>
                  <th className="p-3">Processing</th>
                  <th className="p-3">Captured</th>
                </tr>
              </thead>
              <tbody>
                {photos.map((p: any) => (
                  <tr key={p.id} className="border-b-2 border-black/10">
                    <td className="p-3 font-bold">{p.sequence_number}</td>
                    <td className="p-3">{p.version}</td>
                    <td className="p-3">{p.is_retake ? 'yes' : '—'}</td>
                    <td className="p-3">{p.processing_status}</td>
                    <td className="p-3">{formatTime(p.capture_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
