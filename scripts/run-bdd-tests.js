/**
 * Lance les tests BDD : build client avec auth activée, puis Cucumber (+ Playwright).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const buildIndex = path.join(__dirname, '..', 'client', 'build', 'index.html');
const buildMarker = path.join(__dirname, '..', 'client', 'build', '.bdd-auth-build');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const needsBuild = !fs.existsSync(buildIndex) || !fs.existsSync(buildMarker);

if (needsBuild) {
  console.log('Compilation client pour tests BDD (REACT_APP_AUTH_ENABLED=true)…');
  run('node', ['scripts/build-client.js'], {
    env: {
      ...process.env,
      REACT_APP_AUTH_ENABLED: 'true',
    },
  });
  fs.writeFileSync(buildMarker, new Date().toISOString());
}

console.log('Exécution des scénarios Cucumber…');
run('npx', ['cucumber-js']);
