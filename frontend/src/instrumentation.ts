/**
 * Next.js server register hook. Browser bundles never load this, so the
 * Helix ingestion key stays on the server.
 */
export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    await import('./instrumentation.node');
  }
}
