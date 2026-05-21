export function FileIcon({ active }: {
    active?: boolean;
}) {
    const c = active ? '#1C32D2' : '#02071B';
    return (<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M11.5 2H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6.5L11.5 2Z" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M11.5 2v4.5H16" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7.5 10.5h5M7.5 13h5M7.5 8h2" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>);
}
export function ProfileIcon({ active }: {
    active?: boolean;
}) {
    const c = active ? '#1C32D2' : '#02071B';
    return (<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8.25" stroke={c} strokeWidth="1.5"/>
      <circle cx="10" cy="7.5" r="2.75" stroke={c} strokeWidth="1.5"/>
      <path d="M4.5 16.5a5.75 5.75 0 0 1 11 0" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>);
}
export function MessageIcon({ active }: {
    active?: boolean;
}) {
    const c = active ? '#1C32D2' : '#02071B';
    return (<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M7 9.25h.01M10 9.25h.01M13 9.25h.01M3.5 6C3.5 4.9 4.4 4 5.5 4h9c1.1 0 2 .9 2 2v5c0 1.1-.9 2-2 2h-.5L11 14.5 8 13H5.5c-1.1 0-2-.9-2-2V6Z" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}
export function BookIcon({ active }: {
    active?: boolean;
}) {
    const c = active ? '#1C32D2' : '#02071B';
    return (<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 15.5V4.833A1.333 1.333 0 0 1 5.333 3.5H15c.368 0 .667.299.667.667V15.5M4 15.5c0 .736.597 1.333 1.333 1.333h10.334c.368 0 .666-.299.666-.666V15.5M4 15.5h12" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7.5 7h5M7.5 10h3" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>);
}
export function BellIcon() {
    return (<svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path d="M14 4.083c-3.682 0-6.667 2.985-6.667 6.667v1.167c0 .672-.183 1.332-.532 1.908L5.468 15.75c-.896 1.494-.148 3.453 1.532 3.917C9.094 20.22 11.524 20.667 14 20.667s4.906-.448 7-.999c1.68-.465 2.428-2.424 1.532-3.918l-1.333-2.025a3.5 3.5 0 0 1-.532-1.908V10.75C20.667 7.068 17.682 4.083 14 4.083Z" stroke="#0F2AAE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M11.667 21.583a2.333 2.333 0 0 0 4.666 0" stroke="#0F2AAE" strokeWidth="2" strokeLinecap="round"/>
    </svg>);
}
export function ShieldIcon() {
    return (<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M8.333 10.417 9.583 11.667l2.292-2.5M10 2.083l-6.667 2.5v4.25c0 3.875 2.85 7.5 6.667 8.417 3.816-.917 6.667-4.542 6.667-8.417v-4.25L10 2.083Z" stroke="#309BB7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}
export function PlusIcon() {
    return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 3v12M3 9h12" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
    </svg>);
}
export function TrashIcon({ stroke = '#B91C1C' }: {
    stroke?: string;
}) {
    return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M2.5 4.5h13M6.5 4.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5M7 8v6m4-6v6M4.5 8.5v7A1.5 1.5 0 0 0 6 17h6a1.5 1.5 0 0 0 1.5-1.5v-7" stroke={stroke} strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}
export function ReopenJobIcon({ stroke = '#374151' }: {
    stroke?: string;
}) {
    return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M13.75 7.75A5.25 5.25 0 1 0 12.62 13" stroke={stroke} strokeWidth="1.35" strokeLinecap="round" fill="none"/>
      <path d="M13.75 4.25v3.75h-3.5" stroke={stroke} strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}
export function UserEditIcon({ stroke = '#0B0F1F' }: {
    stroke?: string;
}) {
    return (<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M9.167 3.333H4.167A1.667 1.667 0 0 0 2.5 5v11.667a1.667 1.667 0 0 0 1.667 1.666H15.833a1.667 1.667 0 0 0 1.667-1.666v-5" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M15.833 2.083a1.768 1.768 0 0 1 2.5 2.5L10.833 12l-3.333.833.833-3.333 7.5-7.417Z" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}
export function EmptyIllustration() {
    return (<svg width="100" height="100" viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="48" fill="#F3F4F6"/>
      <rect x="25" y="18" width="42" height="52" rx="4" fill="white" stroke="#D1D5DB" strokeWidth="1.5"/>
      <rect x="31" y="30" width="30" height="3" rx="1.5" fill="#E5E7EB"/>
      <rect x="31" y="37" width="22" height="3" rx="1.5" fill="#E5E7EB"/>
      <rect x="31" y="44" width="26" height="3" rx="1.5" fill="#E5E7EB"/>
      <circle cx="68" cy="68" r="16" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="1.5"/>
      <path d="M62 68h12M68 62v12" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round"/>
    </svg>);
}
