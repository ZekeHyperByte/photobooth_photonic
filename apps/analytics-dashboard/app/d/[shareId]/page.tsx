import { initHostedTable, getHostedPhotos } from '@/lib/hosted';

export const dynamic = 'force-dynamic';

// Public customer-facing download page. Reached by scanning the booth QR.
export default async function DownloadPage({
  params,
}: {
  params: { shareId: string };
}) {
  await initHostedTable();
  const photos = await getHostedPhotos(params.shareId);

  if (photos.length === 0) {
    return (
      <main style={{ maxWidth: 640, margin: '4rem auto', textAlign: 'center', fontFamily: 'system-ui' }}>
        <h1>Photos not found</h1>
        <p>This link may have expired or is invalid.</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem', fontFamily: 'system-ui' }}>
      <h1 style={{ textAlign: 'center' }}>Your photos 📸</h1>
      <p style={{ textAlign: 'center', color: '#666' }}>
        Tap a photo to download. {photos.length} {photos.length === 1 ? 'photo' : 'photos'}.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
        {photos.map((p) => (
          <a key={p.sequence_number} href={p.url} download style={{ display: 'block' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt={`Photo ${p.sequence_number}`}
              style={{ width: '100%', borderRadius: 8, display: 'block' }}
            />
          </a>
        ))}
      </div>
    </main>
  );
}
