'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { LOCUMLINK_FAQ_SECTIONS } from '@/lib/faqContent';

export default function FaqAccordion() {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {LOCUMLINK_FAQ_SECTIONS.map((section) => (
        <section key={section.title}>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: '#0f1523',
              marginBottom: 12,
              lineHeight: 1.35,
            }}
          >
            {section.title}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {section.items.map((item, index) => {
              const key = `${section.title}:${index}`;
              const open = openKey === key;
              const panelId = `faq-panel-${key.replace(/[^a-zA-Z0-9]+/g, '-')}`;
              const buttonId = `faq-button-${key.replace(/[^a-zA-Z0-9]+/g, '-')}`;
              return (
                <div
                  key={key}
                  style={{
                    border: '1px solid #E5E7EB',
                    borderRadius: 12,
                    background: '#fff',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    id={buttonId}
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpenKey(open ? null : key)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '14px 16px',
                      border: 'none',
                      background: open ? '#F8FAFC' : '#fff',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      fontSize: 15,
                      fontWeight: 600,
                      color: '#0f1523',
                      lineHeight: 1.4,
                    }}
                  >
                    <span>{item.question}</span>
                    <ChevronDown
                      size={18}
                      color="#64748b"
                      style={{
                        flexShrink: 0,
                        transform: open ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.15s ease',
                      }}
                    />
                  </button>
                  {open ? (
                    <div
                      id={panelId}
                      role="region"
                      aria-labelledby={buttonId}
                      style={{
                        padding: '0 16px 16px',
                        fontSize: 14,
                        color: '#4B5563',
                        lineHeight: 1.55,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {item.answer}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
