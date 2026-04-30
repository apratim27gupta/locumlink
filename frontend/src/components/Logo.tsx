'use client';
import Image from 'next/image';
interface LogoProps {
    white?: boolean;
    size?: 'sm' | 'md' | 'lg';
}
// Match HomeLandingView branding by default.
const sizes = { sm: 20, md: 27, lg: 32 };
const imgPx = { sm: 28, md: 36, lg: 44 };
export default function Logo({ white = false, size = 'md' }: LogoProps) {
    const fs = sizes[size];
    const color = white ? '#fff' : '#0F2A7A';
    const accent = white ? '#fff' : '#38C6C6';
    const icon = imgPx[size];
    return (<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Image src="/logo1.png" alt="" width={icon} height={icon} style={{ objectFit: 'contain', flexShrink: 0 }}/>
      <span style={{
            fontSize: fs,
            fontFamily: 'Gilroy-Black, Outfit, sans-serif',
            fontWeight: 900,
            letterSpacing: 0,
        }}>
        <span style={{ color }}>Locum </span>
        <span style={{ color: accent }}>Link</span>
      </span>
    </div>);
}
