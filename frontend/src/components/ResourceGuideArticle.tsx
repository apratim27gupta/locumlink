import type { CSSProperties } from 'react';
import type { ResourceGuide } from '@/lib/resourceGuides';

const LINK_STYLE: CSSProperties = {
  color: '#3B4FD8',
  textDecoration: 'none',
};

export default function ResourceGuideArticle({ guide }: { guide: ResourceGuide }) {
  return (
    <article style={{ color: '#1e293b', lineHeight: 1.45, maxWidth: 760 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>{guide.title}</h1>
      {guide.tagline ? (
        <p style={{ fontSize: 15, fontWeight: 600, color: '#334155', margin: '0 0 10px' }}>
          {guide.tagline}
        </p>
      ) : null}

      {guide.blocks.map((block, i) => {
        if (block.type === 'h') {
          return (
            <h2
              key={i}
              style={{
                fontSize: 15,
                fontWeight: 700,
                margin: '12px 0 4px',
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
          <p key={i} style={{ fontSize: 14, margin: '0 0 6px', color: '#334155' }}>
            {block.text}
          </p>
        );
      })}

      <p style={{ fontSize: 14, color: '#334155', margin: '10px 0 0' }}>
        <a href="mailto:doctor@locumlink.ca" style={LINK_STYLE}>
          doctor@locumlink.ca
        </a>
        {' | '}
        <a href="https://locumlink.ca" target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>
          LocumLink.ca
        </a>
      </p>
    </article>
  );
}
