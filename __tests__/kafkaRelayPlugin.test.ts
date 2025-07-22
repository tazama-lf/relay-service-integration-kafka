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
  const makeConfig = (overrides = {}) => ({
    KAFKA_CLIENT_ID: 'test-client',
    KAFKA_DESTINATION_TRANSPORT_URL: 'localhost:9092',
    KAFKA_PRODUCER_STREAM: 'test-topic',
    nodeEnv: 'prod',
    KAFKA_TLS_CA: 'FAKE_CA_CERT',
    KAFKA_MAX_IN_FLIGHT_REQUESTS: 5,
    ...overrides,
  });
  beforeEach(() => {
    jest.resetModules();

    mockProducer = {
      connect: jest.fn(),
      send: jest.fn(),
    };

    mockLoggerService = {
      log: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;

    mockApm = {
      startTransaction: jest.fn(() => ({ end: jest.fn() })),
      startSpan: jest.fn(() => ({ end: jest.fn() })),
      captureError: jest.fn(),
    };
  });

  afterEach(() => {
    delete process.env.maxInFlightRequests;
    jest.clearAllMocks();
  });

  describe('constructor SSL handling', () => {
    it('should not use SSL in dev', () => {
      jest.doMock('@tazama-lf/frms-coe-lib/lib/config/processor.config', () => ({
        validateProcessorConfig: jest.fn(() => makeConfig({ nodeEnv: 'dev', KAFKA_TLS_CA: undefined })),
      }));

      Kafka = require('kafkajs').Kafka;
      (Kafka as unknown as jest.Mock).mockImplementation(({ ssl }) => {
        expect(ssl).toBe(false);
        return { producer: () => mockProducer };
      });

      KafkaRelayPlugin = require('../src/service/kafkaRelayPlugin').default;
      new KafkaRelayPlugin(); // no constructor args now
    });

    it('should use CA for SSL in prod', () => {
      const fakeCert = Buffer.from('FAKE_CA_CERT_CONTENT');

      jest.doMock('node:fs', () => ({
        existsSync: jest.fn(() => true),
        readFileSync: jest.fn(() => fakeCert),
      }));

      jest.doMock('@tazama-lf/frms-coe-lib/lib/config/processor.config', () => ({
        validateProcessorConfig: jest.fn(() => makeConfig({ KAFKA_TLS_CA: '/fake/path/to/ca.cert' })),
      }));

      Kafka = require('kafkajs').Kafka;
      (Kafka as unknown as jest.Mock).mockImplementation(({ ssl }) => {
        expect(ssl).toEqual({
          rejectUnauthorized: false,
          ca: [fakeCert],
        });
        return { producer: () => mockProducer };
      });

      KafkaRelayPlugin = require('../src/service/kafkaRelayPlugin').default;
      new KafkaRelayPlugin();
    });

    it('should use empty CA array if CA file is missing', () => {
      jest.doMock('node:fs', () => ({
        existsSync: jest.fn(() => false),
        readFileSync: jest.fn(),
      }));

      jest.doMock('@tazama-lf/frms-coe-lib/lib/config/processor.config', () => ({
        validateProcessorConfig: jest.fn(() => makeConfig({ KAFKA_TLS_CA: '/missing/path' })),
      }));

      Kafka = require('kafkajs').Kafka;
      (Kafka as unknown as jest.Mock).mockImplementation(({ ssl }) => {
        expect(ssl).toEqual({
          rejectUnauthorized: false,
          ca: [],
        });
        return { producer: () => mockProducer };
      });
      KafkaRelayPlugin = require('../src/service/kafkaRelayPlugin').default;
      new KafkaRelayPlugin();
    });

    it('should throw error when KAFKA_MAX_IN_FLIGHT_REQUESTS is invalid', () => {
      jest.doMock('@tazama-lf/frms-coe-lib/lib/config/processor.config', () => ({
        validateProcessorConfig: jest.fn(() => makeConfig({ KAFKA_MAX_IN_FLIGHT_REQUESTS: 0 })),
      }));

      KafkaRelayPlugin = require('../src/service/kafkaRelayPlugin').default;

      expect(() => new KafkaRelayPlugin()).toThrow("Invalid or missing 'maxInFlightRequests': 0");
    });

    it('should throw error when KAFKA_MAX_IN_FLIGHT_REQUESTS is negative', () => {
      jest.doMock('@tazama-lf/frms-coe-lib/lib/config/processor.config', () => ({
        validateProcessorConfig: jest.fn(() => makeConfig({ KAFKA_MAX_IN_FLIGHT_REQUESTS: -5 })),
      }));

      KafkaRelayPlugin = require('../src/service/kafkaRelayPlugin').default;

      expect(() => new KafkaRelayPlugin()).toThrow("Invalid or missing 'maxInFlightRequests': -5");
    });
  });

  describe('init', () => {
    beforeEach(() => {
      jest.doMock('@tazama-lf/frms-coe-lib/lib/config/processor.config', () => ({
        validateProcessorConfig: jest.fn(() => makeConfig()),
      }));

      Kafka = require('kafkajs').Kafka;
      (Kafka as unknown as jest.Mock).mockImplementation(() => ({
        producer: (config: any) => {
          expect(config?.maxInFlightRequests).toBe(5);
          return mockProducer;
        },
      }));

      KafkaRelayPlugin = require('../src/service/kafkaRelayPlugin').default;
      kafkaRelayPlugin = new KafkaRelayPlugin(); // no constructor args
    });

    it('should initialize and connect the producer', async () => {
      await kafkaRelayPlugin.init(mockLoggerService, mockApm);
      expect(mockLoggerService.log).toHaveBeenCalledWith('Initializing Kafka producer for broker: localhost:9092', 'KafkaRelayPlugin');
      expect(mockProducer.connect).toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith('Kafka producer connected with maxInFlightRequests = 5', 'KafkaRelayPlugin');
    });
  });

  describe('relay', () => {
    const dataObject = 'message';

    beforeEach(async () => {
      jest.doMock('@tazama-lf/frms-coe-lib/lib/config/processor.config', () => ({
        validateProcessorConfig: jest.fn(() => makeConfig()),
      }));

      Kafka = require('kafkajs').Kafka;
      (Kafka as unknown as jest.Mock).mockImplementation(() => ({
        producer: () => mockProducer,
      }));

      KafkaRelayPlugin = require('../src/service/kafkaRelayPlugin').default;
      kafkaRelayPlugin = new KafkaRelayPlugin(); // constructor has no args
      await kafkaRelayPlugin.init(mockLoggerService, mockApm); // pass mocks into init
    });

    it('should relay string data', async () => {
      await kafkaRelayPlugin.relay(dataObject);

      expect(mockLoggerService.log).toHaveBeenCalledWith('Sending data to Kafka topic: test-topic', 'KafkaRelayPlugin');
      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'test-topic',
        messages: [{ value: dataObject }],
      });
    });

    it('should handle both string and buffer input', async () => {
      await kafkaRelayPlugin.relay('text');
      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'test-topic',
        messages: [{ value: 'text' }],
      });

      const bufferData = Buffer.from('buffered');
      await kafkaRelayPlugin.relay(bufferData);
      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'test-topic',
        messages: [{ value: bufferData.toString() }],
      });
    });

    it('should log and throw on producer send error', async () => {
      const error = new Error('Send failed');
      mockProducer.send.mockRejectedValueOnce(error);

      await expect(kafkaRelayPlugin.relay(dataObject)).rejects.toThrow('Send failed');

      expect(mockLoggerService.error).toHaveBeenCalledWith('Kafka relay error: Send failed', 'KafkaRelayPlugin');
    });
  });
});
