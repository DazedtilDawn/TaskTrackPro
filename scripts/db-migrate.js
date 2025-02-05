#!/usr/bin/env node

const { spawn } = require("child_process");

// Spawn the drizzle migration push command
const migrate = spawn("drizzle-kit", ["push"], {
  stdio: ["pipe", "inherit", "inherit"]
});

// Automatically respond with "y" to any prompt
migrate.stdin.write("y\n");
migrate.stdin.end();

migrate.on("exit", (code) => {
  process.exit(code);
});
