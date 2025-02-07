import { startVitest } from 'vitest/node';
import { resolve } from 'path';

// Set up environment variables
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test_session_secret';
process.env.REPL_ID = 'test_repl_id';
process.env.REPL_OWNER = 'test_owner';

async function runTests() {
    console.log('Starting test runner...');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('DATABASE_URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'));

    try {
        const testFile = process.argv[2];
        console.log('Running tests for:', testFile || 'all test files');

        const vitest = await startVitest('test', [], {
            root: process.cwd(),
            globals: true,
            environment: 'node',
            setupFiles: ['./server/tests/setup.ts'],
            include: testFile ? [testFile] : ['server/tests/**/*.test.ts'],
            reporters: ['verbose'],
            testTimeout: 10000,
            hookTimeout: 10000
        });

        await vitest?.close();
    } catch (error) {
        console.error('Error running tests:', error);
        process.exit(1);
    }
}

runTests(); 