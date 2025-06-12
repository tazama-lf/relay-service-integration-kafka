// SPDX-License-Identifier: Apache-2.0

import { LoggerService } from '@tazama-lf/frms-coe-lib';

// Mock kafkajs globally
jest.mock('kafkajs');

describe('KafkaRelayPlugin', () => {
  let Kafka: any;
  let KafkaRelayPlugin: any;
  let kafkaRelayPlugin: any;
  let mockLoggerService: jest.Mocked<LoggerService>;
  let mockProducer: any;
  let mockApm: any;

  // Use lower-case nodeEnv to match actual config!
  const makeConfig = (overrides = {}) => ({
    CLIENT_ID: 'test-client',
    DESTINATION_TRANSPORT_URL: 'localhost:9092',
    PRODUCER_STREAM: 'test-topic',
    nodeEnv: 'prod',
    KAFKA_TLS_CA: 'FAKE_CA_CERT',
    ...overrides,
  });

  beforeEach(() => {
    jest.resetModules();

    jest.doMock('@tazama-lf/frms-coe-lib/lib/config/processor.config', () => ({
      validateProcessorConfig: jest.fn(() => makeConfig()),
    }));

    Kafka = require('kafkajs').Kafka;

    mockProducer = {
      connect: jest.fn(),
      send: jest.fn(),
    };

    (Kafka as unknown as jest.Mock).mockImplementation(() => ({
      producer: () => mockProducer,
    }));

    KafkaRelayPlugin = require('../src/service/kafkaRelayPlugin').default;

    mockLoggerService = {
      log: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;

    mockApm = {
      startTransaction: jest.fn().mockReturnValue({ end: jest.fn() }),
      startSpan: jest.fn().mockReturnValue({ end: jest.fn() }),
      captureError: jest.fn(),
    };

    kafkaRelayPlugin = new KafkaRelayPlugin(mockLoggerService, mockApm);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor SSL handling', () => {
    it('should not use SSL in dev', async () => {
      jest.resetModules();
      jest.doMock('@tazama-lf/frms-coe-lib/lib/config/processor.config', () => ({
        validateProcessorConfig: jest.fn(() => makeConfig({ nodeEnv: 'dev', KAFKA_TLS_CA: undefined })),
      }));

      const Kafka = require('kafkajs').Kafka;
      const KafkaRelayPlugin = require('../src/service/kafkaRelayPlugin').default;

      (Kafka as unknown as jest.Mock).mockImplementation(({ ssl }) => {
        // Should be false (no SSL) in dev
        expect(ssl).toBe(false);
        return { producer: () => mockProducer };
      });

      new KafkaRelayPlugin(mockLoggerService, mockApm);
    });

    it('should use only CA for SSL in prod', async () => {
      jest.resetModules();
      jest.doMock('@tazama-lf/frms-coe-lib/lib/config/processor.config', () => ({
        validateProcessorConfig: jest.fn(() => makeConfig({ nodeEnv: 'prod', KAFKA_TLS_CA: 'FAKE_CA_CERT' })),
      }));

      const Kafka = require('kafkajs').Kafka;
      const KafkaRelayPlugin = require('../src/service/kafkaRelayPlugin').default;

      (Kafka as unknown as jest.Mock).mockImplementation(({ ssl }) => {
        expect(ssl).toEqual({
          rejectUnauthorized: false,
          ca: ['FAKE_CA_CERT'],
        });
        return { producer: () => mockProducer };
      });

      new KafkaRelayPlugin(mockLoggerService, mockApm);
    });

    it('should use empty CA array if KAFKA_TLS_CA missing', async () => {
      jest.resetModules();
      jest.doMock('@tazama-lf/frms-coe-lib/lib/config/processor.config', () => ({
        validateProcessorConfig: jest.fn(() => makeConfig({ nodeEnv: 'prod', KAFKA_TLS_CA: undefined })),
      }));

      const Kafka = require('kafkajs').Kafka;
      const KafkaRelayPlugin = require('../src/service/kafkaRelayPlugin').default;

      (Kafka as unknown as jest.Mock).mockImplementation(({ ssl }) => {
        expect(ssl).toEqual({
          rejectUnauthorized: false,
          ca: [],
        });
        return { producer: () => mockProducer };
      });

      new KafkaRelayPlugin(mockLoggerService, mockApm);
    });
  });

  describe('init', () => {
    it('should initialize Kafka producer and connect', async () => {
      await kafkaRelayPlugin.init();

      expect(mockLoggerService.log).toHaveBeenCalledWith('Initializing Kafka producer for broker: localhost:9092', 'KafkaRelayPlugin');
      expect(mockProducer.connect).toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith('Kafka producer connected', 'KafkaRelayPlugin');
    });
  });

  describe('relay', () => {
    const dataObject = 'message';

    beforeEach(async () => {
      await kafkaRelayPlugin.init();
    });

    it('should relay string data to Kafka topic', async () => {
      await kafkaRelayPlugin.relay(dataObject);

      expect(mockLoggerService.log).toHaveBeenCalledWith('Sending data to Kafka topic: test-topic', 'KafkaRelayPlugin');
      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'test-topic',
        messages: [{ value: dataObject }],
      });
    });

    it('should handle string and buffer payloads correctly', async () => {
      await kafkaRelayPlugin.relay('simple-string');
      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'test-topic',
        messages: [{ value: 'simple-string' }],
      });

      const bufferData = Buffer.from('buffer-data');
      await kafkaRelayPlugin.relay(bufferData);
      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'test-topic',
        messages: [{ value: bufferData.toString() }],
      });
    });

    it('should handle errors during relay', async () => {
      const error = new Error('Send failed');
      mockProducer.send.mockRejectedValueOnce(error);

      await kafkaRelayPlugin.relay(dataObject);

      expect(mockLoggerService.error).toHaveBeenCalledWith('Kafka relay error: Send failed', 'KafkaRelayPlugin');
    });
  });
});
