#!/usr/bin/env node

const { spawn } = require("child_process");

console.log('[Migration] Starting database migration process...');

// Spawn the drizzle migration push command
const migrate = spawn("drizzle-kit", ["push", "--verbose"], {
  stdio: ["pipe", "pipe", "inherit"]
});

// Set up error handling
migrate.on('error', (err) => {
  console.error('[Migration Error] Failed to start migration process:', err);
  process.exit(1);
});

// Listen for the confirmation prompt in stdout
migrate.stdout.on('data', (data) => {
  const output = data.toString();
  console.log('[Migration] Process output:', output);

  // Check for confirmation prompts
  if (output.toLowerCase().includes('are you sure') || 
      output.toLowerCase().includes('proceed with')) {
    console.log("[Migration] Detected confirmation prompt, sending 'y'");
    migrate.stdin.write("y\n");
  }
});

migrate.on("exit", (code) => {
  if (code === 0) {
    console.log('[Migration] Migration completed successfully');
    console.log('[Migration] Remember to verify your database state using:');
    console.log('  - Check the migrations/ directory for new files');
    console.log('  - Verify table structure matches db/schema.ts');
  } else {
    console.error(`[Migration Error] Migration failed with code ${code}`);
    console.error('[Migration Error] Possible causes:');
    console.error('  - Database connection issues');
    console.error('  - Schema conflicts');
    console.error('  - Permission problems');
    console.error('Try running with --verbose flag for more details');
  }
  process.exit(code ?? 1);
});

// Add SIGINT handler for graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Migration] Received SIGINT. Cleaning up...');
  migrate.kill();
  process.exit(1);
});