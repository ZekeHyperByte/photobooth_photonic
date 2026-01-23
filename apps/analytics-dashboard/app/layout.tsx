import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Photonic Analytics',
  description: 'Central analytics dashboard for Photonic photo booths',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-neo bg-neo-cream min-h-screen">{children}</body>
    </html>
  );
}
