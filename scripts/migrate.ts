import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from '../db/schema';

// Force run migrations
const runMigration = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  console.log('Starting migration...');

  try {
    const connection = postgres(process.env.DATABASE_URL);
    const db = drizzle(connection, { schema });

    // Push schema changes using migrate
    await migrate(db, { migrationsFolder: './migrations' });

    console.log('Migration completed successfully');

    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

runMigration();