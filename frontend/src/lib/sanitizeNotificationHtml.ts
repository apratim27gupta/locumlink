/**
 * Client-side sanitize for admin broadcast / rich notification bodies.
 * Allows only b/strong, i/em, u, br, p, and span/font size — no color, no scripts.
 */
const ALLOWED = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'span']);

const FONT_SIZE_MAP: Record<string, string> = {
  '1': '10px',
  '2': '13px',
  '3': '16px',
  '4': '18px',
  '5': '24px',
  '6': '32px',
  '7': '48px',
};

function sanitizeStyle(style: string): string {
  const parts: string[] = [];
  for (const decl of style.split(';')) {
    const colon = decl.indexOf(':');
    if (colon < 0) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const value = decl.slice(colon + 1).trim();
    if (
      prop === 'font-size' &&
      /^\d+(\.\d+)?(px|pt|em|rem|%)$/i.test(value)
    ) {
      parts.push(`font-size: ${value}`);
    }
  }
  return parts.join('; ');
}

export function sanitizeNotificationHtml(input: string): string {
  let s = input
    .replace(/<(script|style|iframe|object|embed|link|meta)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|link|meta)[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');

  // Convert <font size="N"> from contentEditable to span
  s = s.replace(
    /<font\b([^>]*)>/gi,
    (_m, attrs: string) => {
      const sizeMatch = String(attrs).match(/\bsize\s*=\s*["']?([1-7])["']?/i);
      const px = sizeMatch ? FONT_SIZE_MAP[sizeMatch[1]!] : undefined;
      return px ? `<span style="font-size: ${px}">` : '<span>';
    },
  );
  s = s.replace(/<\/font>/gi, '</span>');

  s = s.replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (match, rawTag: string, attrs = '') => {
    const tag = rawTag.toLowerCase();
    const closing = match.startsWith('</');
    if (!ALLOWED.has(tag)) return '';
    if (tag === 'br') return '<br>';
    if (closing) return `</${tag}>`;
    if (tag === 'span') {
      const styleMatch = String(attrs).match(/style\s*=\s*(["'])([\s\S]*?)\1/i);
      const style = styleMatch ? sanitizeStyle(styleMatch[2]) : '';
      return style ? `<span style="${style}">` : '<span>';
    }
    return `<${tag}>`;
  });

  return s.trim();
}

export function looksLikeRichNotificationHtml(body: string): boolean {
  return /<\/?(?:b|strong|i|em|u|br|p|span|font)\b/i.test(body);
}
