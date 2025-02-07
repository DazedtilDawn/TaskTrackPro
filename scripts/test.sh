#!/bin/bash

# Set environment variables
export NODE_ENV=test
export DATABASE_URL=${DATABASE_URL:-"postgres://postgres:postgres@localhost:5432/test_db"}
export SESSION_SECRET="test_session_secret"
export REPL_ID="test_repl_id"
export REPL_OWNER="test_owner"

# Run the tests
if [ -z "$1" ]; then
  # If no argument is provided, run all tests
  echo "Running all tests..."
  npx vitest run --reporter verbose
else
  # If an argument is provided, run specific test file
  echo "Running tests in $1..."
  npx vitest run "$1" --reporter verbose
fi 