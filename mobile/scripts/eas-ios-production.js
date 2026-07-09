const { spawnSync } = require('child_process');

const result = spawnSync(
  'npx',
  ['eas', 'build', '--platform', 'ios', '--profile', 'production'],
  { stdio: 'inherit', shell: true, env: process.env },
);

process.exit(result.status ?? 1);
