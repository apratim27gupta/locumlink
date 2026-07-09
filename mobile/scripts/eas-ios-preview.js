const { spawnSync } = require('child_process');

/**
 * EAS syncs iOS capabilities (Push Notifications, Sign in with Apple, etc.)
 * with Apple Developer on each build. Do not set EXPO_NO_CAPABILITY_SYNC.
 */
const result = spawnSync(
  'npx',
  ['eas', 'build', '--platform', 'ios', '--profile', 'preview'],
  { stdio: 'inherit', shell: true, env: process.env },
);

process.exit(result.status ?? 1);
