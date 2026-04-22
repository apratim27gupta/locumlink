'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'Inter, sans-serif',
        background: '#fff',
        color: '#0f1523',
      }}
    >
      <div style={{ maxWidth: 520 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
          Page not found
        </h1>
        <p style={{ marginTop: 10, fontSize: 14, color: '#6b7280' }}>
          The page you’re looking for doesn’t exist (or you may need to sign in).
        </p>
        <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link
            href="/"
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Go home
          </Link>
          <Link
            href="/auth"
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #d0d4e4',
              background: '#fff',
              color: '#374151',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

