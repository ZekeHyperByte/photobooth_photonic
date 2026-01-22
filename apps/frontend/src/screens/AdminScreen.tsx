import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';

interface BoothCode {
  id: string;
  code: string;
  status: 'generated' | 'used' | 'expired';
  generatedBy: string;
  generatedAt: string;
  usedAt: string | null;
  usedBySessionId: string | null;
}

interface DashboardData {
  totalSessions: number;
  completedSessions: number;
  totalRevenue: number;
  totalPhotos: number;
}

const AdminScreen: React.FC = () => {
  const [codes, setCodes] = useState<BoothCode[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [generateCount, setGenerateCount] = useState(5);
  const [filter, setFilter] = useState<string>('all');
  const [recentlyGenerated, setRecentlyGenerated] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [codesRes, dashboardRes] = await Promise.all([
        apiClient.get('/api/admin/codes'),
        apiClient.get('/api/admin/dashboard'),
      ]);

      setCodes(codesRes.data.data || []);
      setDashboard(dashboardRes.data.data || null);
    } catch (error) {
      console.error('Failed to load admin data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateCodes = async (count: number = 1) => {
    try {
      setIsGenerating(true);
      const response = await apiClient.post('/api/admin/codes/generate', {
        count,
      });

      const newCodes = response.data.data || [];
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
    } catch (error) {
      console.error('Failed to generate codes:', error);
      alert('Failed to generate codes');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteCode = async (code: string) => {
    if (!confirm(`Delete code ${code}?`)) return;

    try {
      await apiClient.delete(`/api/admin/codes/${code}`);
      setCodes(codes.filter((c) => c.code !== code));
    } catch (error) {
      console.error('Failed to delete code:', error);
      alert('Failed to delete code. It may have already been used.');
    }
  };

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

  // Sort: Available codes first, then by date (newest first)
  const getSortedFilteredCodes = () => {
    let filtered = filter === 'all' ? codes : codes.filter((c) => c.status === filter);

    return filtered.sort((a, b) => {
      // Available (generated) codes first
      if (a.status === 'generated' && b.status !== 'generated') return -1;
      if (a.status !== 'generated' && b.status === 'generated') return 1;
      // Then by date (newest first)
      return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime();
    });
  };

  const filteredCodes = getSortedFilteredCodes();

  const filterLabels: Record<string, string> = {
    all: 'All',
    generated: 'Available',
    used: 'Used',
    expired: 'Expired',
  };

  const getFilterCount = (filterType: string) => {
    if (filterType === 'all') return codes.length;
    return codes.filter((c) => c.status === filterType).length;
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
    <div className="min-h-screen bg-neo-cyan">
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

        {/* One-tap generate */}
        <button
          onClick={() => handleGenerateCodes(1)}
          disabled={isGenerating}
          className="w-full min-h-[56px] bg-neo-yellow border-[3px] border-black shadow-neo font-bold text-lg active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <>
              <div className="w-5 h-5 border-[3px] border-black border-t-transparent rounded-full animate-spin" />
              Generating...
            </>
          ) : (
            <>[+] Generate 1 Code</>
          )}
        </button>

        {/* Batch generate (expandable) */}
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-bold py-2 select-none">
            &gt; Generate multiple...
          </summary>
          <div className="flex gap-2 mt-2">
            <input
              type="number"
              min="1"
              max="100"
              value={generateCount}
              onChange={(e) => setGenerateCount(parseInt(e.target.value) || 1)}
              className="flex-1 px-4 py-3 min-h-[48px] border-[3px] border-black font-bold text-lg"
            />
            <button
              onClick={() => handleGenerateCodes(generateCount)}
              disabled={isGenerating}
              className="px-6 min-h-[48px] bg-neo-yellow border-[3px] border-black shadow-neo-sm font-bold active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
            >
              Generate {generateCount}
            </button>
          </div>
        </details>
      </header>

      {/* Main Content */}
      <main className="p-4 pb-24">
        {/* Collapsible Stats */}
        {dashboard && (
          <details className="bg-neo-cream border-[3px] border-black shadow-neo-sm mb-4">
            <summary className="p-3 font-bold flex justify-between items-center cursor-pointer select-none">
              <span>Dashboard Stats</span>
              <span className="text-sm bg-white px-2 py-1 border-[2px] border-black">
                {dashboard.completedSessions} | Rp {(dashboard.totalRevenue / 1000).toFixed(0)}k
              </span>
            </summary>
            <div className="grid grid-cols-2 gap-3 p-4 border-t-[3px] border-black">
              <div className="bg-white border-[3px] border-black p-3">
                <p className="text-xs font-bold text-gray-600 mb-1">Total Sessions</p>
                <p className="text-2xl font-bold">{dashboard.totalSessions}</p>
              </div>
              <div className="bg-white border-[3px] border-black p-3">
                <p className="text-xs font-bold text-gray-600 mb-1">Completed</p>
                <p className="text-2xl font-bold">{dashboard.completedSessions}</p>
              </div>
              <div className="bg-white border-[3px] border-black p-3">
                <p className="text-xs font-bold text-gray-600 mb-1">Total Photos</p>
                <p className="text-2xl font-bold">{dashboard.totalPhotos}</p>
              </div>
              <div className="bg-white border-[3px] border-black p-3">
                <p className="text-xs font-bold text-gray-600 mb-1">Revenue</p>
                <p className="text-2xl font-bold">Rp {dashboard.totalRevenue.toLocaleString()}</p>
              </div>
            </div>
          </details>
        )}

        {/* Codes Section Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Codes [{getFilterCount(filter)}]</h2>
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
                        onClick={() => handleDeleteCode(code.code)}
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
      </main>

      {/* Fixed Bottom Filter Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-neo-cream border-t-[3px] border-black z-20">
        <div className="flex">
          {(['all', 'generated', 'used', 'expired'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
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
    </div>
  );
};

export default AdminScreen;
