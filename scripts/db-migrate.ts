#!/usr/bin/env tsx

import { spawn, type SpawnOptionsWithStdioTuple } from "child_process";

// Spawn the drizzle migration push command
const migrate = spawn("drizzle-kit", ["push"], {
  stdio: ["pipe", "inherit", "inherit"]
} as SpawnOptionsWithStdioTuple<"pipe", "inherit", "inherit">);

// Set up error handling
migrate.on('error', (err) => {
  console.error('Failed to start migration process:', err);
  process.exit(1);
});

let promptCount = 0;
const maxPrompts = 10; // Maximum number of prompts we'll handle
let responseInterval: NodeJS.Timeout;

// Function to handle sending confirmations
const sendConfirmation = () => {
  if (promptCount < maxPrompts) {
    migrate.stdin.write("y\n");
    promptCount++;
  } else {
    // If we've hit our max prompts, clean up
    clearInterval(responseInterval);
    migrate.stdin.end();
  }
};

// Start sending confirmations periodically
responseInterval = setInterval(sendConfirmation, 500);

// Also send an immediate confirmation
sendConfirmation();

migrate.on("exit", (code: number | null) => {
  clearInterval(responseInterval);

  if (code === 0) {
    console.log('Migration completed successfully');
  } else {
    console.error(`Migration failed with code ${code}`);
  }
  process.exit(code ?? 1);
});