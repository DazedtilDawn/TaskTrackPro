#!/bin/bash

# Set environment variables
export NODE_ENV=test
export DATABASE_URL=${DATABASE_URL:-"postgresql://neondb_owner:npg_gfEW8djXu6ty@ep-divine-heart-a4r47ba4.us-east-1.aws.neon.tech/neondb?sslmode=require"}
export SESSION_SECRET="test_session_secret"
export REPL_ID="test_repl_id"
export REPL_OWNER="test_owner"

# Run the tests
if [ -z "$1" ]; then
  # If no argument is provided, run all tests
  echo "Running all tests..."
  NODE_OPTIONS="--experimental-vm-modules --no-warnings" npx vitest run --config vitest.config.ts --reporter verbose
else
  # If an argument is provided, run specific test file
  echo "Running tests in $1..."
  NODE_OPTIONS="--experimental-vm-modules --no-warnings" npx vitest run "$1" --config vitest.config.ts --reporter verbose
fi 