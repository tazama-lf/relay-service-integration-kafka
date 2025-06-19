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
    CLIENT_ID: 'test-client',
    DESTINATION_TRANSPORT_URL: 'localhost:9092',
    PRODUCER_STREAM: 'test-topic',
    nodeEnv: 'prod',
    KAFKA_TLS_CA: 'FAKE_CA_CERT',
    ...overrides,
  });

  beforeEach(() => {
    jest.resetModules();
    process.env.maxInFlightRequests = '5'; // ✅ REQUIRED for constructor

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
      new KafkaRelayPlugin(mockLoggerService, mockApm);
    });

    it('should use CA for SSL in prod', () => {
      const fakeCert = Buffer.from('FAKE_CA_CERT_CONTENT');

      jest.doMock('fs', () => ({
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
      new KafkaRelayPlugin(mockLoggerService, mockApm);
    });

    it('should use empty CA array if CA file is missing', () => {
      jest.doMock('fs', () => ({
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
      new KafkaRelayPlugin(mockLoggerService, mockApm);
    });
  });

  describe('init', () => {
    beforeEach(() => {
      jest.doMock('@tazama-lf/frms-coe-lib/lib/config/processor.config', () => ({
        validateProcessorConfig: jest.fn(() => makeConfig()),
      }));

      Kafka = require('kafkajs').Kafka;
      (Kafka as unknown as jest.Mock).mockImplementation(() => ({
        producer: () => mockProducer,
      }));

      KafkaRelayPlugin = require('../src/service/kafkaRelayPlugin').default;
      kafkaRelayPlugin = new KafkaRelayPlugin(mockLoggerService, mockApm);
    });

    it('should initialize and connect the producer', async () => {
      await kafkaRelayPlugin.init();

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
      kafkaRelayPlugin = new KafkaRelayPlugin(mockLoggerService, mockApm);
      await kafkaRelayPlugin.init();
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
