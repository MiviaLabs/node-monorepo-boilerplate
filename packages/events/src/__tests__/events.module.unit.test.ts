import { strict as assert } from 'node:assert';
import { describe, it, mock, afterEach } from 'node:test';

import { DiscoveryModule } from '@nestjs/core';

import {
  EventsModule,
  EventBus,
  MessageHandler,
  OutboxRepository,
  OutboxPollerService,
  KafkaClientManager,
  EventVersioningService,
  EventValidationService,
  EventRegistryService,
  DeadLetterService,
  EventReplayService
} from '../index';

describe('EventsModule', () => {
  afterEach(() => {
    // Reset static config after each test
    KafkaClientManager.resetConfig();
  });

  describe('forRoot', () => {
    it('should return a dynamic module with EventBus, MessageHandler, OutboxRepository, OutboxPollerService, EventVersioningService, EventValidationService, EventRegistryService, and DeadLetterService, and EventReplayService providers', () => {
      const dynamicModule = EventsModule.forRoot();

      assert.strictEqual(dynamicModule.module, EventsModule);
      assert.strictEqual(dynamicModule.exports?.length, 9);
      assert.strictEqual(dynamicModule.exports?.includes(EventBus), true);
      assert.strictEqual(dynamicModule.exports?.includes(MessageHandler), true);
      assert.strictEqual(dynamicModule.exports?.includes(OutboxRepository), true);
      assert.strictEqual(dynamicModule.exports?.includes(OutboxPollerService), true);
      assert.strictEqual(dynamicModule.exports?.includes(EventVersioningService), true);
      assert.strictEqual(dynamicModule.exports?.includes(EventValidationService), true);
      assert.strictEqual(dynamicModule.exports?.includes(EventRegistryService), true);
      assert.strictEqual(dynamicModule.exports?.includes(DeadLetterService), true);
      assert.strictEqual(dynamicModule.exports?.includes(EventReplayService), true);
    });

    it('should accept custom EventBus', () => {
      const customEventBus = new EventBus();
      const dynamicModule = EventsModule.forRoot({ eventBus: customEventBus });

      const eventBusProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === EventBus
      );
      assert.strictEqual(eventBusProvider !== undefined, true);
      if (eventBusProvider && 'useValue' in eventBusProvider) {
        assert.strictEqual(eventBusProvider.useValue, customEventBus);
      }
    });

    it('should accept custom MessageHandler', () => {
      const customMessageHandler = new MessageHandler();
      const dynamicModule = EventsModule.forRoot({ messageHandler: customMessageHandler });

      const messageHandlerProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === MessageHandler
      );
      assert.strictEqual(messageHandlerProvider !== undefined, true);
      if (messageHandlerProvider && 'useValue' in messageHandlerProvider) {
        assert.strictEqual(messageHandlerProvider.useValue, customMessageHandler);
      }
    });

    it('should accept Kafka configuration', () => {
      const kafkaConfig = {
        kafka: {
          brokers: ['localhost:9092'],
          clientId: 'test-client',
          ssl: true
        }
      };

      EventsModule.forRoot(kafkaConfig);

      // Verify the config was set by checking we can get it
      const config = KafkaClientManager.getConfig();
      assert.strictEqual(config !== null, true);
      assert.strictEqual(config?.kafka.brokers[0], 'localhost:9092');
      assert.strictEqual(config?.kafka.clientId, 'test-client');
      assert.strictEqual(config?.kafka.ssl, true);
    });
  });

  describe('forRootAsync', () => {
    it('should return a dynamic module with EventBus, MessageHandler, OutboxRepository, OutboxPollerService, EventVersioningService, EventValidationService, EventRegistryService, and DeadLetterService, and EventReplayService providers', () => {
      const useFactory = mock.fn(() => ({
        enableGracefulShutdown: true
      }));

      const dynamicModule = EventsModule.forRootAsync({
        useFactory
      });

      assert.strictEqual(dynamicModule.module, EventsModule);
      assert.strictEqual(dynamicModule.exports?.length, 9);
      assert.strictEqual(dynamicModule.exports?.includes(EventBus), true);
      assert.strictEqual(dynamicModule.exports?.includes(MessageHandler), true);
      assert.strictEqual(dynamicModule.exports?.includes(OutboxRepository), true);
      assert.strictEqual(dynamicModule.exports?.includes(OutboxPollerService), true);
      assert.strictEqual(dynamicModule.exports?.includes(EventVersioningService), true);
      assert.strictEqual(dynamicModule.exports?.includes(EventValidationService), true);
      assert.strictEqual(dynamicModule.exports?.includes(EventRegistryService), true);
      assert.strictEqual(dynamicModule.exports?.includes(DeadLetterService), true);
      assert.strictEqual(dynamicModule.exports?.includes(EventReplayService), true);
    });

    it('should accept imports array', () => {
      const useFactory = mock.fn(() => ({}));
      const imports = [{ module: class TestModule {} }] as unknown[];

      const dynamicModule = EventsModule.forRootAsync({
        useFactory,
        imports
      });

      // DiscoveryModule is always included, so length is 1 + imports.length
      assert.strictEqual(dynamicModule.imports?.length, 2);
      assert.strictEqual(dynamicModule.imports?.includes(DiscoveryModule), true);
    });

    it('should accept inject array', () => {
      const useFactory = mock.fn(() => ({}));
      const inject = ['ConfigService'] as unknown[];

      const dynamicModule = EventsModule.forRootAsync({
        useFactory,
        inject
      });

      const configProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === 'EVENTS_CONFIG'
      );
      assert.strictEqual(configProvider !== undefined, true);
      if (configProvider && 'inject' in configProvider) {
        assert.strictEqual(configProvider.inject?.length, 1);
      }
    });

    it('should create EVENTS_CONFIG provider', () => {
      const useFactory = mock.fn(() => ({
        enableGracefulShutdown: false
      }));

      const dynamicModule = EventsModule.forRootAsync({
        useFactory
      });

      const configProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === 'EVENTS_CONFIG'
      );
      assert.strictEqual(configProvider !== undefined, true);
      if (configProvider && 'useFactory' in configProvider) {
        assert.strictEqual(typeof configProvider.useFactory, 'function');
      }
    });

    it('should create EventBus provider with factory', () => {
      const useFactory = mock.fn(() => ({}));

      const dynamicModule = EventsModule.forRootAsync({
        useFactory
      });

      const eventBusProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === EventBus
      );
      assert.strictEqual(eventBusProvider !== undefined, true);
      if (eventBusProvider && 'useFactory' in eventBusProvider) {
        assert.strictEqual(typeof eventBusProvider.useFactory, 'function');
        assert.deepStrictEqual(eventBusProvider.inject, ['EVENTS_CONFIG']);
      }
    });

    it('should create MessageHandler provider with factory', () => {
      const useFactory = mock.fn(() => ({}));

      const dynamicModule = EventsModule.forRootAsync({
        useFactory
      });

      const messageHandlerProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === MessageHandler
      );
      assert.strictEqual(messageHandlerProvider !== undefined, true);
      if (messageHandlerProvider && 'useFactory' in messageHandlerProvider) {
        assert.strictEqual(typeof messageHandlerProvider.useFactory, 'function');
        assert.deepStrictEqual(messageHandlerProvider.inject, ['EVENTS_CONFIG']);
      }
    });

    it('should accept Kafka configuration in factory', () => {
      const kafkaConfig = {
        kafka: {
          brokers: ['localhost:9092', 'localhost:9093'],
          clientId: 'async-client',
          ssl: true,
          connectionTimeout: 15000,
          requestTimeout: 45000
        }
      };

      const useFactory = mock.fn(() => kafkaConfig);

      const dynamicModule = EventsModule.forRootAsync({
        useFactory
      });

      const configProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === 'EVENTS_CONFIG'
      );
      assert.strictEqual(configProvider !== undefined, true);
    });

    it('should accept enableGracefulShutdown in factory', () => {
      const useFactory = mock.fn(() => ({
        enableGracefulShutdown: false
      }));

      const dynamicModule = EventsModule.forRootAsync({
        useFactory
      });

      const configProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === 'EVENTS_CONFIG'
      );
      assert.strictEqual(configProvider !== undefined, true);
    });

    it('should accept SASL configuration in factory', () => {
      const kafkaConfig = {
        brokers: ['localhost:9092'],
        sasl: {
          mechanism: 'plain' as const,
          username: 'testuser',
          password: 'testpass'
        }
      };

      const useFactory = mock.fn(() => ({
        kafka: kafkaConfig
      }));

      const dynamicModule = EventsModule.forRootAsync({
        useFactory
      });

      const configProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === 'EVENTS_CONFIG'
      );
      assert.strictEqual(configProvider !== undefined, true);
    });

    it('should accept custom EventBus in factory', () => {
      const customEventBus = new EventBus();
      const useFactory = mock.fn(() => ({
        eventBus: customEventBus
      }));

      const dynamicModule = EventsModule.forRootAsync({
        useFactory
      });

      const eventBusProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === EventBus
      );
      assert.strictEqual(eventBusProvider !== undefined, true);
    });

    it('should accept custom MessageHandler in factory', () => {
      const customMessageHandler = new MessageHandler();
      const useFactory = mock.fn(() => ({
        messageHandler: customMessageHandler
      }));

      const dynamicModule = EventsModule.forRootAsync({
        useFactory
      });

      const messageHandlerProvider = dynamicModule.providers?.find(
        (p) => 'provide' in p && p.provide === MessageHandler
      );
      assert.strictEqual(messageHandlerProvider !== undefined, true);
    });
  });
});
