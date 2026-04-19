import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PREFIXES = [
  '/',
  '/home',
  '/login',
  '/signup',
  '/register',
  '/auth',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    ) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get('ll_access')?.value;
  const role = req.cookies.get('ll_role')?.value;
  const hostDone = req.cookies.get('ll_profile_clinic')?.value === '1';
  const locumDone = req.cookies.get('ll_profile_locum')?.value === '1';

  // No token → send to auth, preserve destination
  if (!token) {
    const url = new URL('/auth', req.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Cross-role guard
  if (pathname.startsWith('/host') && role === 'locum')
    return NextResponse.redirect(new URL('/locum/dashboard', req.url));
  if (pathname.startsWith('/locum') && role === 'clinic')
    return NextResponse.redirect(new URL('/host/dashboard', req.url));

  // Setup guard — only if role cookie is known
  if (
    pathname.startsWith('/host') &&
    !pathname.startsWith('/host/setup') &&
    role === 'clinic' &&
    !hostDone
  )
    return NextResponse.redirect(new URL('/host/setup', req.url));
  if (
    pathname.startsWith('/locum') &&
    !pathname.startsWith('/locum/setup') &&
    role === 'locum' &&
    !locumDone
  )
    return NextResponse.redirect(new URL('/locum/setup', req.url));

  return NextResponse.next();
}

export const config = {
  matcher: ['/host/:path*', '/locum/:path*', '/dashboard/:path*'],
};
