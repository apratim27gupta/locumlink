import type { CSSProperties } from 'react';
import type { ResourceGuide } from '@/lib/resourceGuides';

const LINK_STYLE: CSSProperties = {
  color: '#3B4FD8',
  textDecoration: 'none',
};

export default function ResourceGuideArticle({ guide }: { guide: ResourceGuide }) {
  return (
    <article style={{ color: '#1e293b', lineHeight: 1.55 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>{guide.title}</h1>
      {guide.tagline ? (
        <p style={{ fontSize: 16, fontWeight: 600, color: '#334155', margin: '0 0 16px' }}>
          {guide.tagline}
        </p>
      ) : null}

      {guide.blocks.map((block, i) => {
        if (block.type === 'h') {
          return (
            <h2
              key={i}
              style={{
                fontSize: 16,
                fontWeight: 700,
                margin: '22px 0 8px',
                color: '#0f1523',
              }}
            >
              {block.text}
            </h2>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={i} style={{ margin: '0 0 12px', paddingLeft: 22 }}>
              {block.items.map((item) => (
                <li key={item} style={{ fontSize: 15, marginBottom: 4 }}>
                  {item}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} style={{ fontSize: 15, margin: '0 0 10px', color: '#334155' }}>
            {block.text}
          </p>
        );
      })}

      <div style={{ fontSize: 15, color: '#334155', marginTop: 4 }}>
        <p style={{ margin: '0 0 6px' }}>
          📧{' '}
          <a href="mailto:doctor@locumlink.ca" style={LINK_STYLE}>
            doctor@locumlink.ca
          </a>
        </p>
        <p style={{ margin: '0 0 6px' }}>
          🌐{' '}
          <a href="https://locumlink.ca" target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>
            LocumLink.ca
          </a>
        </p>
        <p style={{ margin: '0 0 6px' }}>📘 Facebook: LocumLink Canada</p>
        <p style={{ margin: '0 0 16px' }}>💼 LinkedIn: LocumLink Canada</p>
        <p style={{ margin: 0, fontWeight: 700, color: '#0f1523' }}>LocumLink</p>
        <p style={{ margin: '4px 0 0', fontStyle: 'italic' }}>Connect. Cover. Care.</p>
      </div>
    </article>
  );
}
