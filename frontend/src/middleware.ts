import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const ADMIN_PUBLIC_PREFIXES = ['/admin/login'];
const PUBLIC_PREFIXES = [
  '/',
  '/home',
  '/login',
  '/signup',
  '/register',
  '/auth',
  '/documents',
  '/support',
  '/privacy-policy',
  '/terms-of-use',
  '/offline',
  '/locum/browse',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // OAuth PKCE: route handler must exchange code before any Supabase cookie refresh
  if (pathname === '/auth/callback') {
    return NextResponse.next();
  }

  if (pathname.startsWith('/.well-known/')) {
    return NextResponse.next();
  }

  // Nest API routes authenticate via Authorization Bearer (ll_access), not Supabase cookies.
  if (pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  if (ADMIN_PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return supabaseResponse;
  }
  if (pathname.startsWith('/admin')) {
    const adminToken = request.cookies.get('ll_admin')?.value;
    if (!adminToken) {
      const url = new URL('/admin/login', request.url);
      url.searchParams.set('next', pathname);
      const redirect = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) =>
        redirect.cookies.set(c.name, c.value)
      );
      return redirect;
    }
    return supabaseResponse;
  }

  const isPublic =
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon');

  if (!isPublic) {
    const token = request.cookies.get('ll_access')?.value;
    const role = request.cookies.get('ll_role')?.value;
    const hostDone = request.cookies.get('ll_profile_clinic')?.value === '1';
    const locumDone = request.cookies.get('ll_profile_locum')?.value === '1';

    let redirectUrl: URL | null = null;

    if (!token) {
      redirectUrl = new URL('/auth', request.url);
      redirectUrl.searchParams.set('next', pathname);
    } else if (pathname.startsWith('/host') && role === 'locum') {
      redirectUrl = new URL('/locum/dashboard', request.url);
    } else if (pathname.startsWith('/locum') && role === 'clinic') {
      redirectUrl = new URL('/host/dashboard', request.url);
    } else if (
      pathname.startsWith('/host') &&
      !pathname.startsWith('/host/setup') &&
      role === 'clinic' &&
      !hostDone
    ) {
      redirectUrl = new URL('/host/setup', request.url);
    } else if (
      pathname.startsWith('/locum') &&
      !pathname.startsWith('/locum/setup') &&
      role === 'locum' &&
      !locumDone
    ) {
      redirectUrl = new URL('/locum/setup', request.url);
    }

    if (redirectUrl) {
      const redirect = NextResponse.redirect(redirectUrl);
      supabaseResponse.cookies.getAll().forEach((c) =>
        redirect.cookies.set(c.name, c.value)
      );
      return redirect;
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sitemap.xml|auth/callback$|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|docx|pdf|txt)$).*)',
  ],
};
