/**
 * Fix TypeScript (nodenext) resolution of Prisma Client types on Windows.
 *
 * `@prisma/client/default.d.ts` uses `from '.prisma/client/default'`, which is
 * relative to the package folder. Prisma generate writes the client to the
 * hoisted `node_modules/.prisma/client`. Node can still resolve the bare/relative
 * package via module paths; TypeScript nodenext cannot, so the IDE keeps stale
 * (or empty) Prisma types — e.g. missing supportTicket / replacementApplication.
 *
 * After generate: (1) junction for package-local `.prisma`, (2) rewrite .d.ts
 * imports to the hoisted client so tsserver always sees the fresh types.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const prismaClientPkg = path.join(root, 'node_modules', '@prisma', 'client');
const hoistedPrisma = path.join(root, 'node_modules', '.prisma');
const junctionPath = path.join(prismaClientPkg, '.prisma');

function ensureJunction() {
  if (!fs.existsSync(hoistedPrisma) || !fs.existsSync(prismaClientPkg)) return;

  try {
    const st = fs.lstatSync(junctionPath);
    if (st.isSymbolicLink() || st.isDirectory()) {
      try {
        if (path.resolve(fs.realpathSync(junctionPath)) === path.resolve(hoistedPrisma)) {
          return;
        }
      } catch {
        // broken link
      }
      fs.rmSync(junctionPath, { recursive: true, force: true });
    }
  } catch {
    // missing
  }

  try {
    fs.symlinkSync(hoistedPrisma, junctionPath, 'junction');
    console.log('[link-prisma-client] junction @prisma/client/.prisma -> node_modules/.prisma');
  } catch (err) {
    console.warn('[link-prisma-client] junction failed:', err.message);
  }
}

/** Rewrite package .d.ts re-exports to the hoisted generated client. */
function patchDtsImports() {
  if (!fs.existsSync(prismaClientPkg)) return;
  const rewrites = [
    [/\.prisma\/client\/default/g, '../../.prisma/client/default'],
    [/\.prisma\/client\/edge/g, '../../.prisma/client/edge'],
    [/\.prisma\/client\/wasm/g, '../../.prisma/client/wasm'],
    [/\.prisma\/client\/react-native/g, '../../.prisma/client/react-native'],
  ];

  for (const name of fs.readdirSync(prismaClientPkg)) {
    if (!name.endsWith('.d.ts')) continue;
    const file = path.join(prismaClientPkg, name);
    let text = fs.readFileSync(file, 'utf8');
    let next = text;
    // Normalize any prior form, then apply hoisted relative path once.
    next = next.replace(/from ['"](?:\.\.\/)*\.?\.prisma\/client\/([^'"]+)['"]/g, (_m, sub) => {
      return `from '../../.prisma/client/${sub}'`;
    });
    next = next.replace(/from ['"]\.prisma\/client\/([^'"]+)['"]/g, (_m, sub) => {
      return `from '../../.prisma/client/${sub}'`;
    });
    if (next !== text) {
      fs.writeFileSync(file, next);
      console.log(`[link-prisma-client] patched ${name}`);
    }
  }
}

ensureJunction();
patchDtsImports();

const check = path.join(hoistedPrisma, 'client', 'index.d.ts');
if (fs.existsSync(check) && !fs.readFileSync(check, 'utf8').includes('TICKET_RESOLVED')) {
  console.warn('[link-prisma-client] generated client missing TICKET_RESOLVED — re-run prisma generate');
}
