import { getBooths, getTodayStats, getTodayTotals, initializeTables } from '@/lib/db';
import StatCard from '@/components/StatCard';
import BoothCard from '@/components/BoothCard';

// Revalidate every 60 seconds
export const revalidate = 60;

// Format currency
function formatCurrency(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

// Check if booth is online (last sync within 2 hours)
function isBoothOnline(lastSync: string | null): boolean {
  if (!lastSync) return false;
  const syncTime = new Date(lastSync).getTime();
  const now = Date.now();
  const twoHoursMs = 2 * 60 * 60 * 1000;
  return now - syncTime < twoHoursMs;
}

export default async function Dashboard() {
  // Initialize tables on first load
  try {
    await initializeTables();
  } catch (error) {
    console.error('Failed to initialize tables:', error);
  }

  // Fetch data
  let booths: any[] = [];
  let todayStats: any[] = [];
  let totals: any = {
    revenue_total: 0,
    transaction_count: 0,
    transaction_success: 0,
    transaction_failed: 0,
    session_total: 0,
    session_completed: 0,
    photos_captured: 0,
    photos_printed: 0,
  };

  try {
    booths = await getBooths();
    todayStats = await getTodayStats();
    totals = await getTodayTotals();
  } catch (error) {
    console.error('Failed to fetch data:', error);
  }

  // Calculate success rate
  const successRate = totals.transaction_count > 0
    ? Math.round((totals.transaction_success / totals.transaction_count) * 100)
    : 0;

  // Get online booth count
  const onlineCount = booths.filter((b) => isBoothOnline(b.last_sync)).length;

  // Merge booth data with today's stats
  const boothsWithStats = booths.map((booth) => {
    const stats = todayStats.find((s) => s.booth_id === booth.id) || {
      revenue_total: 0,
      session_completed: 0,
    };
    return {
      ...booth,
      revenue: Number(stats.revenue_total) || 0,
      sessions: Number(stats.session_completed) || 0,
    };
  });

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">Photonic Analytics</h1>
            <p className="text-gray-600 mt-1">Central Dashboard</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="px-4 py-2 bg-neo-lime border-2 border-black font-bold">
              {onlineCount}/{booths.length} Booths Online
            </span>
            <span className="text-sm text-gray-500">
              Updated: {new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>
      </header>

      {/* Stats Overview */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Today&apos;s Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Revenue"
            value={formatCurrency(Number(totals.revenue_total) || 0)}
            subtitle="Total today"
            color="yellow"
          />
          <StatCard
            title="Transactions"
            value={totals.transaction_count || 0}
            subtitle={`${successRate}% success rate`}
            color="cyan"
          />
          <StatCard
            title="Sessions"
            value={totals.session_completed || 0}
            subtitle={`${totals.session_total || 0} started`}
            color="lime"
          />
          <StatCard
            title="Photos"
            value={totals.photos_captured || 0}
            subtitle={`${totals.photos_printed || 0} printed`}
            color="magenta"
          />
        </div>
      </section>

      {/* Booths */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Booths</h2>
        {boothsWithStats.length === 0 ? (
          <div className="neo-card text-center py-12">
            <p className="text-xl text-gray-500">No booths connected yet</p>
            <p className="text-sm text-gray-400 mt-2">
              Configure CENTRAL_SERVER_URL on your booth to start syncing
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {boothsWithStats.map((booth) => (
              <BoothCard
                key={booth.id}
                boothId={booth.id}
                name={booth.name}
                isOnline={isBoothOnline(booth.last_sync)}
                lastSync={booth.last_sync}
                revenue={booth.revenue}
                sessions={booth.sessions}
              />
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="mt-12 pt-8 border-t-4 border-black text-center text-sm text-gray-500">
        <p>Photonic Analytics Dashboard v0.1.0</p>
      </footer>
    </div>
  );
}
