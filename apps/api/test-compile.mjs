import { Test } from '@nestjs/testing';
import { DiscoveryModule, Reflector } from '@nestjs/core';
import { AppModule } from './dist/src/app.module.js';

async function test() {
  try {
    const moduleFixture = await Test.createTestingModule({
      imports: [DiscoveryModule, AppModule],
      providers: [
        {
          provide: Reflector,
          useValue: {
            get: () => null,
            getAll: () => [],
            getAllAndMerge: () => [],
            getAllAndOverride: () => []
          }
        }
      ]
    }).compile();

    console.log('SUCCESS: Module compiled successfully!');
    await moduleFixture.close();
  } catch (error) {
    console.error('FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
