import { beforeAll, afterAll } from 'vitest';

// Set up environment variables for testing
process.env.NODE_ENV = 'test';

// If no test database URL is provided, use an in-memory or test database URL
if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/test_db';
}

// Other environment variables needed for testing
process.env.SESSION_SECRET = 'test_session_secret';

// Global test setup
beforeAll(async () => {
    // Any global setup needed before running tests
    console.log('Setting up test environment...');
});

// Global test teardown
afterAll(async () => {
    // Any global cleanup needed after running tests
    console.log('Cleaning up test environment...');
}); 