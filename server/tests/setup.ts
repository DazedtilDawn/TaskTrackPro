import { beforeAll, afterAll } from 'vitest';
import { db } from '@db/index';
import { sql } from 'drizzle-orm';

// Set up environment variables for testing
process.env.NODE_ENV = 'test';

// Preserve existing DATABASE_URL if it exists
if (!process.env.DATABASE_URL) {
    console.warn('No DATABASE_URL found, using default test database URL');
    process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/test_db';
} else {
    console.log('Using existing DATABASE_URL:', process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
}

// Other environment variables needed for testing
process.env.SESSION_SECRET = 'test_session_secret';
process.env.REPL_ID = 'test_repl_id';
process.env.REPL_OWNER = 'test_owner';

// Global test setup
beforeAll(async () => {
    console.log('Setting up test environment...');
    console.log('NODE_ENV:', process.env.NODE_ENV);

    try {
        // Test database connection
        console.log('Testing database connection...');
        const result = await db.execute(sql`SELECT current_database(), current_user`);
        console.log('Database connection successful');
        console.log('Connected to database:', result.rows[0]);
    } catch (error) {
        console.error('Database connection failed:', error);
        throw error;
    }
});

// Global test teardown
afterAll(async () => {
    console.log('Cleaning up test environment...');
    // Add any cleanup code here if needed
}); 