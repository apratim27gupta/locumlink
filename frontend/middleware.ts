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
    // Separate admin entrypoint:
    // - /admin/login is public
    // - all other /admin routes require the admin cookie (NOT the normal ll_access cookie)
    if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
        return NextResponse.next();
    }
    if (pathname.startsWith('/admin')) {
        const adminToken = req.cookies.get('ll_admin')?.value;
        if (!adminToken) {
            const url = new URL('/admin/login', req.url);
            url.searchParams.set('next', pathname);
            return NextResponse.redirect(url);
        }
        return NextResponse.next();
    }
    if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api') ||
        pathname.startsWith('/favicon')) {
        return NextResponse.next();
    }
    const token = req.cookies.get('ll_access')?.value;
    const role = req.cookies.get('ll_role')?.value;
    const hostDone = req.cookies.get('ll_profile_clinic')?.value === '1';
    const locumDone = req.cookies.get('ll_profile_locum')?.value === '1';
    if (!token) {
        const url = new URL('/auth', req.url);
        url.searchParams.set('next', pathname);
        return NextResponse.redirect(url);
    }
    if (pathname.startsWith('/host') && role === 'locum')
        return NextResponse.redirect(new URL('/locum/dashboard', req.url));
    if (pathname.startsWith('/locum') && role === 'clinic')
        return NextResponse.redirect(new URL('/host/dashboard', req.url));
    if (pathname.startsWith('/host') &&
        !pathname.startsWith('/host/setup') &&
        role === 'clinic' &&
        !hostDone)
        return NextResponse.redirect(new URL('/host/setup', req.url));
    if (pathname.startsWith('/locum') &&
        !pathname.startsWith('/locum/setup') &&
        role === 'locum' &&
        !locumDone)
        return NextResponse.redirect(new URL('/locum/setup', req.url));
    return NextResponse.next();
}
export const config = {
    matcher: ['/host/:path*', '/locum/:path*', '/dashboard/:path*', '/admin/:path*'],
};
