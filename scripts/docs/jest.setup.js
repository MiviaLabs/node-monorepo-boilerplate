/**
 * Jest setup file for docs tests.
 *
 * Mocks the 'glob' package which has issues with jest's CommonJS/ESM interop.
 */

// Mock the glob package completely to avoid 'Cannot read properties of undefined (reading 'native')' error
jest.mock('glob', () => ({
  globSync: jest.fn(() => [])
}));
