import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure environment variables
process.env.NODE_OPTIONS = '--experimental-vm-modules';

// Run Jest with proper configuration
const jestProcess = spawn('npx', [
  'jest',
  '--config',
  resolve(__dirname, 'jest.config.ts'),
  '--verbose',
  ...process.argv.slice(2)
], {
  stdio: 'inherit',
  shell: true
});

jestProcess.on('error', (error) => {
  console.error('Failed to start Jest:', error);
  process.exit(1);
});

jestProcess.on('exit', (code) => {
  process.exit(code || 0);
}); 