interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: 'yellow' | 'cyan' | 'lime' | 'magenta';
}

const colorClasses = {
  yellow: 'bg-neo-yellow',
  cyan: 'bg-neo-cyan',
  lime: 'bg-neo-lime',
  magenta: 'bg-neo-magenta',
};

export default function StatCard({ title, value, subtitle, color = 'yellow' }: StatCardProps) {
  return (
    <div className={`${colorClasses[color]} border-4 border-black shadow-neo p-6`}>
      <p className="text-sm font-medium uppercase tracking-wide">{title}</p>
      <p className="text-4xl font-bold mt-2">{value}</p>
      {subtitle && <p className="text-sm mt-1 opacity-80">{subtitle}</p>}
    </div>
  );
}
