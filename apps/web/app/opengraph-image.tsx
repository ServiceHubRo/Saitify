import { ImageResponse } from 'next/og';

export const alt = 'Saitify: Your idea. Your website.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 90,
          background: 'linear-gradient(135deg, #432589 0%, #D453D2 55%, #4F8CF6 100%)',
          color: '#ffffff',
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, opacity: 0.9 }}>Saitify</div>
        <div style={{ fontSize: 96, fontWeight: 700, lineHeight: 1.05, marginTop: 24 }}>
          Your idea. Your website.
        </div>
      </div>
    ),
    size,
  );
}
