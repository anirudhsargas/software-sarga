const { spawn } = require('child_process');
const path = require('path');

console.log('Starting Sarga servers...');

// Start Backend
const server = spawn('node', ['index.js'], {
  cwd: path.join(__dirname, 'server'),
  stdio: 'inherit',
  shell: true
});

// Start Frontend
const client = spawn('npm', ['run', 'dev'], {
  cwd: path.join(__dirname, 'client'),
  stdio: 'inherit',
  shell: true
});

server.on('error', (err) => {
  console.error('Failed to start backend:', err);
});

client.on('error', (err) => {
  console.error('Failed to start frontend:', err);
});

// Handle process termination
process.on('SIGINT', () => {
  server.kill();
  client.kill();
  process.exit();
});
