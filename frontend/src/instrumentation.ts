/**
 * Next.js server register hook. Browser bundles never load this, so the
 * Helix ingestion key stays on the server.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  await import('./instrumentation.node');
}
