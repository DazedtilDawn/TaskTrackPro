#!/usr/bin/env tsx

import { spawn } from "child_process";
import type { SpawnOptions } from "child_process";

console.log('[Migration] Starting database migration process...');

// Set a reasonable timeout for the migration process (5 minutes)
const MIGRATION_TIMEOUT = 5 * 60 * 1000;

// Define spawn options with correct typing
const spawnOptions: SpawnOptions = {
  stdio: "inherit"
};

const migrate = spawn("drizzle-kit", ["push", "--force"], spawnOptions);

// Set up timeout handler
const timeout = setTimeout(() => {
  console.error('[Migration Error] Migration timed out after 5 minutes');
  migrate.kill();
  process.exit(1);
}, MIGRATION_TIMEOUT);

// Set up error handling
migrate.on('error', (err) => {
  console.error('[Migration Error] Failed to start migration process:', err);
  clearTimeout(timeout);
  process.exit(1);
});

migrate.on("exit", (code: number | null) => {
  clearTimeout(timeout);

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
  clearTimeout(timeout);
  migrate.kill();
  process.exit(1);
});