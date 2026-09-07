import { validateConfig } from '../validation.config';

describe('validateConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('does not treat transformer options as environment variables', () => {
    delete process.env['enableImplicitConversion'];

    expect(() => validateConfig()).not.toThrow();
  });
});
