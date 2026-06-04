/**
 * Build React avec les variables REACT_APP_* du .env racine (CRA ne lit que client/).
 */
const { spawnSync } = require('child_process');
const path = require('path');
const { loadRootEnv, root } = require('./loadRootEnv');

loadRootEnv();

const result = spawnSync('npm', ['run', 'build'], {
  cwd: path.join(root, 'client'),
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
