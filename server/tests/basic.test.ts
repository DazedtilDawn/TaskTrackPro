import { describe, it, expect } from 'vitest';

describe('Basic Test Suite', () => {
    it('should pass a simple test', () => {
        expect(1 + 1).toBe(2);
    });

    it('should have access to environment variables', () => {
        expect(process.env.NODE_ENV).toBe('test');
    });
}); 