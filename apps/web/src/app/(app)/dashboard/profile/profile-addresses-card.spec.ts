import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readProfileAddressesCardSource() {
  const fs = await import('node:fs/promises');
  const filePath = path.join(__dirname, 'profile-addresses-card.tsx');
  return fs.readFile(filePath, 'utf-8');
}

describe('profile-addresses-card data ownership', () => {
  it('keeps the SSR seed and avoids an unconditional mount refetch', async () => {
    const source = await readProfileAddressesCardSource();

    expect(source).toContain('initialData: initialAddresses');
    expect(source).toContain('staleTime: 30_000');
    expect(source).toContain('refetchOnMount: false');
    expect(source).not.toContain("refetchOnMount: 'always'");
  });
});
