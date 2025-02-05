describe('Test Environment', () => {
  it('should have Jest working', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have access to DOM testing utilities', () => {
    const element = document.createElement('div');
    element.textContent = 'Test';
    expect(element).toBeInstanceOf(HTMLElement);
    expect(element).toHaveTextContent('Test');
  });

  it('should handle async operations', async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });

  it('should have proper TypeScript support', () => {
    const add = (a: number, b: number): number => a + b;
    expect(add(2, 3)).toBe(5);
  });
}); 