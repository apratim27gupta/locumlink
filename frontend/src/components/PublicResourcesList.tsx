'use client';

import { useState } from 'react';
import ResourceGuideArticle from '@/components/ResourceGuideArticle';
import {
  PUBLIC_RESOURCES,
  findPublicGuide,
  type PublicResourceItem,
} from '@/lib/publicResources';

function PdfIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="#E0E7FF" />
      <path d="M10 6h8l6 6v14a2 2 0 01-2 2H10a2 2 0 01-2-2V8a2 2 0 012-2z" fill="#3B4FD8" opacity="0.2" />
      <path d="M18 6l6 6h-6V6z" fill="#3B4FD8" />
      <path
        d="M10 6h8v6h6v14a2 2 0 01-2 2H10a2 2 0 01-2-2V8a2 2 0 012-2z"
        stroke="#3B4FD8"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <text x="16" y="23" textAnchor="middle" fill="#3B4FD8" fontSize="6" fontWeight="700" fontFamily="sans-serif">
        PDF
      </text>
    </svg>
  );
}

function LinkTileIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="#E0E7FF" />
      <path
        d="M14.5 17.5l3-3M12.2 15.8l-1.4 1.4a3.2 3.2 0 004.5 4.5l1.4-1.4M19.8 16.2l1.4-1.4a3.2 3.2 0 00-4.5-4.5l-1.4 1.4"
        stroke="#3B4FD8"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GuideIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="#E0E7FF" />
      <path d="M9 8.5h14v15H9z" fill="#3B4FD8" opacity="0.15" />
      <path d="M11 11.5h10M11 15h10M11 18.5h7" stroke="#3B4FD8" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3M9 2h5m0 0v5m0-5L7 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type PublicResourcesListProps = {
  items?: PublicResourceItem[];
};

export default function PublicResourcesList({ items = PUBLIC_RESOURCES }: PublicResourcesListProps) {
  const [hoveredUrl, setHoveredUrl] = useState<string | null>(null);
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);
  const guide = activeGuideId ? findPublicGuide(activeGuideId) : null;

  if (guide) {
    return (
      <>
        <button type="button" className="public-resources-back" onClick={() => setActiveGuideId(null)}>
          ← Back to Resources
        </button>
        <ResourceGuideArticle guide={guide} />
      </>
    );
  }

  return (
    <div className="public-resources-list">
      {items.map((item) => {
        const hoverKey = item.kind === 'guide' ? item.id : item.url;
        const tileClass =
          hoveredUrl === hoverKey ? 'public-resources-tile public-resources-tile--hover' : 'public-resources-tile';
        const body = (
          <>
            {item.kind === 'guide' ? (
              <GuideIcon />
            ) : item.icon === 'link' ? (
              <LinkTileIcon />
            ) : (
              <PdfIcon />
            )}
            <div className="public-resources-tile__text">
              <div className="public-resources-tile__title">{item.title}</div>
              <div className="public-resources-tile__desc">{item.description}</div>
            </div>
            <div className="public-resources-tile__affordance">
              {item.kind === 'guide' ? <ChevronIcon /> : <ExternalLinkIcon />}
            </div>
          </>
        );
        if (item.kind === 'guide') {
          return (
            <button
              key={item.id}
              type="button"
              className={tileClass}
              onClick={() => setActiveGuideId(item.id)}
              onMouseEnter={() => setHoveredUrl(item.id)}
              onMouseLeave={() => setHoveredUrl(null)}
            >
              {body}
            </button>
          );
        }
        return (
          <a
            key={item.url}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={tileClass}
            onMouseEnter={() => setHoveredUrl(item.url)}
            onMouseLeave={() => setHoveredUrl(null)}
          >
            {body}
          </a>
        );
      })}
    </div>
  );
}
