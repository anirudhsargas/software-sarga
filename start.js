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
const clientPort = process.env.CLIENT_PORT || '5173';
const client = spawn('npm', ['run', 'dev', '--', '--port', clientPort], {
  cwd: path.join(__dirname, 'client'),
  stdio: 'inherit',
  shell: true
});

// Start Website
const websitePort = process.env.WEBSITE_PORT || '5174';
const website = spawn('npm', ['run', 'dev', '--', '--port', websitePort], {
  cwd: path.join(__dirname, 'website'),
  stdio: 'inherit',
  shell: true
});

server.on('error', (err) => {
  console.error('Failed to start backend:', err);
});

client.on('error', (err) => {
  console.error('Failed to start frontend:', err);
});

website.on('error', (err) => {
  console.error('Failed to start website:', err);
});

// Handle process termination
process.on('SIGINT', () => {
  server.kill();
  client.kill();
  website.kill();
  process.exit();
});
