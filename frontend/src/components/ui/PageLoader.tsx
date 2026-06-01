'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { subscribeTopLoader } from '@/lib/topLoader';

const LOADER_BAR_COLORS = ['#0F2A7A', '#1E3FAF', '#38C6C6'] as const;

function BarWave() {
  const bars = [
    { h: 16, delay: '0s', color: LOADER_BAR_COLORS[0] },
    { h: 28, delay: '0.1s', color: LOADER_BAR_COLORS[1] },
    { h: 40, delay: '0.2s', color: LOADER_BAR_COLORS[2] },
    { h: 28, delay: '0.3s', color: LOADER_BAR_COLORS[1] },
    { h: 16, delay: '0.4s', color: LOADER_BAR_COLORS[0] },
  ];
  return (
    <>
      <style>{`
        @keyframes bwv {
          0%,100% { transform: scaleY(0.4); opacity: 0.5; }
          50% { transform: scaleY(1); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <div
        className="page-loader-overlay"
        role="status"
        aria-live="polite"
        aria-busy="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          fontFamily: 'Inter, sans-serif',
          animation: 'fadeIn 0.15s ease',
        }}
      >
        <div
          style={{ display: 'flex', gap: 6, alignItems: 'center', height: 48 }}
        >
          {bars.map((b, i) => (
            <span
              key={i}
              style={{
                width: 5,
                height: b.h,
                borderRadius: 3,
                background: b.color,
                display: 'block',
                animation: `bwv 0.9s ease-in-out ${b.delay} infinite`,
                boxShadow: `0 0 8px ${b.color}73`,
              }}
            />
          ))}
        </div>
        <span
          style={{
            fontSize: 13,
            color: '#9CA3AF',
            fontWeight: 500,
            letterSpacing: '0.04em',
          }}
        >
          Loading…
        </span>
      </div>
    </>
  );
}

export default function PageLoader() {
  const [active, setActive] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return subscribeTopLoader(setActive);
  }, []);

  if (!active || !mounted) return null;
  return createPortal(<BarWave />, document.body);
}
