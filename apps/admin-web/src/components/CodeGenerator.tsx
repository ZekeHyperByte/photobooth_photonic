import { useState } from 'react';

interface CodeGeneratorProps {
  onGenerate: (count: number) => Promise<void>;
  isGenerating: boolean;
}

export function CodeGenerator({ onGenerate, isGenerating }: CodeGeneratorProps) {
  const [batchCount, setBatchCount] = useState(5);

  return (
    <>
      {/* One-tap generate */}
      <button
        onClick={() => onGenerate(1)}
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
            value={batchCount}
            onChange={(e) => setBatchCount(parseInt(e.target.value) || 1)}
            className="flex-1 px-4 py-3 min-h-[48px] border-[3px] border-black font-bold text-lg bg-white"
          />
          <button
            onClick={() => onGenerate(batchCount)}
            disabled={isGenerating}
            className="px-6 min-h-[48px] bg-neo-yellow border-[3px] border-black shadow-neo-sm font-bold active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
          >
            Generate {batchCount}
          </button>
        </div>
      </details>
    </>
  );
}
