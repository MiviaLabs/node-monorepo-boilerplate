import { strict as assert } from 'node:assert';
import { describe, it, before, afterEach } from 'node:test';

import { KafkaClientManager, setKafkaConfig, parseKafkaBrokers } from '../client';
import { logger } from '../logging/logger';

describe('KafkaClientManager', () => {
  let kafkaManager: KafkaClientManager;

  before(() => {
    kafkaManager = new KafkaClientManager();
  });

  describe('createKafkaClient', () => {
    it('should create a Kafka client with valid config', () => {
      const config = {
        brokers: ['localhost:9092'],
        clientId: 'test-client'
      };

      const client = kafkaManager.createKafkaClient(config);

      assert.strictEqual(typeof client === 'object', true);
      assert.strictEqual(client !== null, true);
    });

    it('should return the same client instance for subsequent calls', () => {
      const config = {
        brokers: ['localhost:9092'],
        clientId: 'test-client'
      };

      const client1 = kafkaManager.createKafkaClient(config);
      const client2 = kafkaManager.createKafkaClient(config);

      assert.strictEqual(client1 === client2, true);
    });

    it('should throw error for invalid config with missing brokers', () => {
      // Use a fresh KafkaClientManager instance for this test
      const freshManager = new KafkaClientManager();
      const config = {
        brokers: []
      };

      assert.throws(
        () => freshManager.createKafkaClient(config),
        Error,
        'Invalid Kafka configuration'
      );
    });

    it('should throw error for invalid config with empty broker string', () => {
      // Use a fresh KafkaClientManager instance for this test
      const freshManager = new KafkaClientManager();
      const config = {
        brokers: ['']
      };

      assert.throws(
        () => freshManager.createKafkaClient(config),
        Error,
        'Invalid Kafka configuration'
      );
    });

    it('should accept valid SSL configuration', () => {
      const config = {
        brokers: ['localhost:9092'],
        ssl: true
      };

      const client = kafkaManager.createKafkaClient(config);

      assert.strictEqual(typeof client === 'object', true);
    });

    it('should accept valid SASL plain configuration', () => {
      const config = {
        brokers: ['localhost:9092'],
        sasl: {
          mechanism: 'plain' as const,
          username: 'user',
          password: 'pass'
        }
      };

      const client = kafkaManager.createKafkaClient(config);

      assert.strictEqual(typeof client === 'object', true);
    });

    it('should accept valid connection timeout', () => {
      const config = {
        brokers: ['localhost:9092'],
        connectionTimeout: 5000
      };

      const client = kafkaManager.createKafkaClient(config);

      assert.strictEqual(typeof client === 'object', true);
    });

    it('should reject connection timeout over 60000ms', () => {
      // Use a fresh KafkaClientManager instance for this test
      const freshManager = new KafkaClientManager();
      const config = {
        brokers: ['localhost:9092'],
        connectionTimeout: 70000
      };

      assert.throws(
        () => freshManager.createKafkaClient(config),
        Error,
        'Invalid Kafka configuration'
      );
    });
  });

  describe('parseBrokers', () => {
    it('should parse single broker', () => {
      const result = parseKafkaBrokers('localhost:9092');
      assert.deepEqual(result, ['localhost:9092']);
    });

    it('should parse multiple brokers', () => {
      const result = parseKafkaBrokers('localhost:9092,localhost:9093');
      assert.deepEqual(result, ['localhost:9092', 'localhost:9093']);
    });

    it('should trim whitespace from brokers', () => {
      const result = parseKafkaBrokers('localhost:9092, localhost:9093 , localhost:9094');
      assert.deepEqual(result, ['localhost:9092', 'localhost:9093', 'localhost:9094']);
    });

    it('should filter empty broker strings', () => {
      const result = parseKafkaBrokers('localhost:9092,,localhost:9093');
      assert.deepEqual(result, ['localhost:9092', 'localhost:9093']);
    });

    it('should strip Railway INTERNAL:// protocol prefix', () => {
      const result = parseKafkaBrokers('INTERNAL://kafka.railway.internal:29092');
      assert.deepEqual(result, ['kafka.railway.internal:29092']);
    });

    it('should strip PLAINTEXT:// protocol prefix', () => {
      const result = parseKafkaBrokers('PLAINTEXT://kafka.example.com:9092');
      assert.deepEqual(result, ['kafka.example.com:9092']);
    });

    it('should handle mixed broker formats', () => {
      const result = parseKafkaBrokers(
        'INTERNAL://kafka.railway.internal:29092,PLAINTEXT://kafka2.example.com:9092,localhost:9093'
      );
      assert.deepEqual(result, [
        'kafka.railway.internal:29092',
        'kafka2.example.com:9092',
        'localhost:9093'
      ]);
    });
  });

  describe('structured logging', () => {
    it('should log info messages with structured format', () => {
      // eslint-disable-next-line no-console
      const consoleLog = console.log;
      let loggedData: unknown;

      // eslint-disable-next-line no-console
      console.log = (...args) => {
        loggedData = args[0];
      };

      logger.info('Test message', { key: 'value' });

      // eslint-disable-next-line no-console
      console.log = consoleLog;

      const parsed = JSON.parse(String(loggedData));
      assert.strictEqual(parsed.level, 'info');
      assert.strictEqual(parsed.message, 'Test message');
      assert.strictEqual(parsed.key, 'value');
      assert.strictEqual(typeof parsed.timestamp, 'string');
    });

    it('should log warn messages with structured format', () => {
      const consoleWarn = console.warn;
      let loggedData: unknown;

      console.warn = (...args) => {
        loggedData = args[0];
      };

      logger.warn('Warning message', { key: 'value' });

      console.warn = consoleWarn;

      const parsed = JSON.parse(String(loggedData));
      assert.strictEqual(parsed.level, 'warn');
      assert.strictEqual(parsed.message, 'Warning message');
    });

    it('should log error messages with structured format', () => {
      const consoleError = console.error;
      let loggedData: unknown;

      console.error = (...args) => {
        loggedData = args[0];
      };

      logger.error('Error message', { key: 'value' });

      console.error = consoleError;

      const parsed = JSON.parse(String(loggedData));
      assert.strictEqual(parsed.level, 'error');
      assert.strictEqual(parsed.message, 'Error message');
    });
  });

  describe('shutdown reconnect guard', () => {
    it('should not schedule producer reconnects during shutdown disconnects', async () => {
      let disconnectHandler: (() => Promise<void>) | undefined;

      const fakeProducer = {
        on(eventName: string, handler: () => Promise<void>) {
          if (eventName === 'producer.disconnect') {
            disconnectHandler = handler;
          }
        },
        async disconnect() {
          await disconnectHandler?.();
        }
      };

      const manager = kafkaManager as unknown as {
        producerInstance: typeof fakeProducer | null;
        isProducerConnected: boolean;
        reconnectTimeout: NodeJS.Timeout | null;
        setupProducerEventListeners: () => void;
        closeProducer: () => Promise<void>;
      };

      manager.producerInstance = fakeProducer;
      manager.isProducerConnected = true;
      manager.reconnectTimeout = null;

      manager.setupProducerEventListeners();
      await manager.closeProducer();

      assert.strictEqual(manager.reconnectTimeout, null);
    });
  });

  describe('setKafkaConfig', () => {
    afterEach(() => {
      // Reset static config after each test
      KafkaClientManager.resetConfig();
    });

    it('should set Kafka configuration', () => {
      const config = {
        kafka: {
          brokers: ['localhost:9092', 'localhost:9093'],
          clientId: 'test-client',
          ssl: true
        }
      };

      setKafkaConfig(config);

      const retrievedConfig = KafkaClientManager.getConfig();
      assert.strictEqual(retrievedConfig !== null, true);
      assert.strictEqual(retrievedConfig?.kafka.brokers[0], 'localhost:9092');
      assert.strictEqual(retrievedConfig?.kafka.brokers[1], 'localhost:9093');
      assert.strictEqual(retrievedConfig?.kafka.clientId, 'test-client');
      assert.strictEqual(retrievedConfig?.kafka.ssl, true);
    });

    it('should accept SASL configuration', () => {
      const config = {
        kafka: {
          brokers: ['localhost:9092'],
          sasl: {
            mechanism: 'plain' as const,
            username: 'user',
            password: 'pass'
          }
        }
      };

      setKafkaConfig(config);

      const retrievedConfig = KafkaClientManager.getConfig();
      assert.strictEqual(retrievedConfig !== null, true);
      assert.strictEqual(retrievedConfig?.kafka.sasl?.mechanism, 'plain');
      assert.strictEqual(retrievedConfig?.kafka.sasl?.username, 'user');
      assert.strictEqual(retrievedConfig?.kafka.sasl?.password, 'pass');
    });

    it('should accept timeout configurations', () => {
      const config = {
        kafka: {
          brokers: ['localhost:9092'],
          connectionTimeout: 10000,
          requestTimeout: 30000,
          retryInterval: 5000,
          maxRetries: 5
        }
      };

      setKafkaConfig(config);

      const retrievedConfig = KafkaClientManager.getConfig();
      assert.strictEqual(retrievedConfig !== null, true);
      assert.strictEqual(retrievedConfig?.kafka.connectionTimeout, 10000);
      assert.strictEqual(retrievedConfig?.kafka.requestTimeout, 30000);
      assert.strictEqual(retrievedConfig?.kafka.retryInterval, 5000);
      assert.strictEqual(retrievedConfig?.kafka.maxRetries, 5);
    });

    it('should allow null to reset config', () => {
      const config = {
        kafka: {
          brokers: ['localhost:9092']
        }
      };

      setKafkaConfig(config);
      assert.strictEqual(KafkaClientManager.getConfig() !== null, true);

      KafkaClientManager.resetConfig();
      assert.strictEqual(KafkaClientManager.getConfig(), null);
    });
  });
});
