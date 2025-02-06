#!/usr/bin/env tsx

import { spawn, type SpawnOptionsWithStdioTuple } from "child_process";

// Spawn the drizzle migration push command with verbose output
console.log('[Migration] Starting database migration process...');

const migrate = spawn("drizzle-kit", ["push", "--verbose"], {
  stdio: ["pipe", "inherit", "inherit"]
} as SpawnOptionsWithStdioTuple<"pipe", "inherit", "inherit">);

// Set up error handling
migrate.on('error', (err) => {
  console.error('[Migration Error] Failed to start migration process:', err);
  process.exit(1);
});

let promptCount = 0;
const maxPrompts = 10; // Maximum number of prompts we'll handle
let responseInterval: NodeJS.Timeout;

// Function to handle sending confirmations
const sendConfirmation = () => {
  if (promptCount < maxPrompts) {
    console.log("[Migration] Sending confirmation 'y' to migration prompt");
    migrate.stdin.write("y\n");
    promptCount++;
  } else {
    // If we've hit our max prompts, clean up
    console.log("[Migration Warning] Reached maximum number of prompts:", maxPrompts);
    clearInterval(responseInterval);
    migrate.stdin.end();
  }
};

// Start sending confirmations periodically
console.log('[Migration] Setting up automatic confirmation handling...');
responseInterval = setInterval(sendConfirmation, 500);

// Also send an immediate confirmation
sendConfirmation();

migrate.on("exit", (code: number | null) => {
  clearInterval(responseInterval);

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
  clearInterval(responseInterval);
  migrate.kill();
  process.exit(1);
});