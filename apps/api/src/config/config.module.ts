import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import appConfig from './app.config';
import cacheConfig from './cache.config';
import i18nConfig from './i18n.config';
import redisConfig from './redis.config';
import swaggerConfig from './swagger.config';
import encryptedStoreConfig from './encrypted-store.config';
import versionConfig from './version.config';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [
        appConfig,
        swaggerConfig,
        versionConfig,
        i18nConfig,
        redisConfig,
        cacheConfig,
        encryptedStoreConfig
      ]
    })
  ]
})
export class AppConfigModule {}
