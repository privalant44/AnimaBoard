/**
 * Lance le serveur (3000) et le client React (3001) dans le même terminal.
 * Arrêt : Ctrl+C
 */
const { spawn } = require('child_process');
const path = require('path');
const { loadRootEnv, root } = require('./loadRootEnv');

loadRootEnv();

const server = spawn('node', ['server/index.js'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PORT: '3000' }
});

server.on('error', (err) => {
  console.error('Erreur serveur:', err);
});

let client;
setTimeout(() => {
  client = spawn('npm', ['start'], {
    cwd: path.join(root, 'client'),
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PORT: '3001', BROWSER: 'none' }
  });
  client.on('error', (err) => {
    console.error('Erreur client:', err);
  });
}, 2000);

function killAll() {
  if (server) server.kill();
  if (client) client.kill();
  process.exit(0);
}

process.on('SIGINT', killAll);
process.on('SIGTERM', killAll);

console.log('Serveur : http://localhost:3000');
console.log('Client  : http://localhost:3001 (démarrage dans ~5 s)');
console.log('Arrêt   : Ctrl+C\n');
