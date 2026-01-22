import { useState, useEffect, useCallback } from 'react';
import { adminApi, BoothCode, DashboardData } from '@/api/client';
import { Dashboard } from '@/components/Dashboard';
import { CodeGenerator } from '@/components/CodeGenerator';
import { CodeList } from '@/components/CodeList';
import { StatusFilter } from '@/components/StatusFilter';

function App() {
  const [codes, setCodes] = useState<BoothCode[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [recentlyGenerated, setRecentlyGenerated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [codesRes, dashboardRes] = await Promise.all([
        adminApi.getCodes(),
        adminApi.getDashboard(),
      ]);

      setCodes(codesRes.data || []);
      setDashboard(dashboardRes.data || null);
    } catch (err) {
      console.error('Failed to load admin data:', err);
      setError('Failed to connect to server. Make sure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerateCodes = async (count: number) => {
    try {
      setIsGenerating(true);
      setError(null);

      const response = await adminApi.generateCodes(count);
      const newCodes = response.data || [];

      setCodes([...newCodes, ...codes]);

      // Highlight the first generated code
      if (newCodes.length > 0) {
        setRecentlyGenerated(newCodes[0].code);
        setFilter('generated'); // Auto-switch to available filter

        // Clear highlight after 5 seconds
        setTimeout(() => {
          setRecentlyGenerated(null);
        }, 5000);
      }
    } catch (err) {
      console.error('Failed to generate codes:', err);
      setError('Failed to generate codes');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteCode = async (code: string) => {
    if (!confirm(`Delete code ${code}?`)) return;

    try {
      setError(null);
      await adminApi.deleteCode(code);
      setCodes(codes.filter((c) => c.code !== code));
    } catch (err) {
      console.error('Failed to delete code:', err);
      setError('Failed to delete code. It may have already been used.');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neo-cyan flex items-center justify-center">
        <div className="text-center">
          <div className="flex justify-center gap-2 mb-4">
            <div
              className="w-4 h-4 bg-black rounded-full animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <div
              className="w-4 h-4 bg-black rounded-full animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <div
              className="w-4 h-4 bg-black rounded-full animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </div>
          <p className="text-xl font-bold">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neo-cyan font-neo">
      {/* Sticky Header */}
      <header className="sticky top-0 z-20 bg-neo-cyan border-b-[3px] border-black p-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold">PHOTONIC Admin</h1>
          <button
            onClick={loadData}
            className="px-4 py-2 min-h-[48px] bg-white border-[3px] border-black shadow-neo-sm font-bold active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            Refresh
          </button>
        </div>

        <CodeGenerator onGenerate={handleGenerateCodes} isGenerating={isGenerating} />
      </header>

      {/* Main Content */}
      <main className="p-4 pb-24">
        {/* Error Banner */}
        {error && (
          <div className="bg-neo-magenta text-white border-[3px] border-black p-4 mb-4 font-bold">
            {error}
            <button
              onClick={() => setError(null)}
              className="float-right font-bold"
            >
              &times;
            </button>
          </div>
        )}

        {/* Dashboard Stats */}
        <Dashboard data={dashboard} />

        {/* Code List */}
        <CodeList
          codes={codes}
          filter={filter}
          recentlyGenerated={recentlyGenerated}
          onDelete={handleDeleteCode}
        />
      </main>

      {/* Fixed Bottom Filter Nav */}
      <StatusFilter codes={codes} filter={filter} onFilterChange={setFilter} />
    </div>
  );
}

export default App;
