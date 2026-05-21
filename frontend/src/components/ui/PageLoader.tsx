'use client';
import { useEffect, useState } from 'react';
import { subscribeTopLoader } from '@/lib/topLoader';

function BarWave() {
  const bars = [
    { h: 16, delay: '0s' },
    { h: 28, delay: '0.1s' },
    { h: 40, delay: '0.2s' },
    { h: 28, delay: '0.3s' },
    { h: 16, delay: '0.4s' },
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
                background:
                  i % 2 === 0
                    ? 'linear-gradient(180deg,#1C32D2,#3A65DB)'
                    : 'linear-gradient(180deg,#3BC6C6,#2AA8A8)',
                display: 'block',
                animation: `bwv 0.9s ease-in-out ${b.delay} infinite`,
                boxShadow:
                  i % 2 === 0
                    ? '0 0 8px rgba(28,50,210,0.4)'
                    : '0 0 8px rgba(59,198,198,0.4)',
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
  useEffect(() => subscribeTopLoader(setActive), []);
  if (!active) return null;
  return <BarWave />;
}
