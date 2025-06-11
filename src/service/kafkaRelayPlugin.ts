// SPDX-License-Identifier: Apache-2.0
import { Kafka, logLevel, type Producer } from 'kafkajs';
import { additionalEnvironmentVariables, type Configuration } from '../config';
import { type ITransportPlugin } from '../interfaces/ITransportPlugin';
import type { LoggerService } from '@tazama-lf/frms-coe-lib';
import type { Apm } from '@tazama-lf/frms-coe-lib/lib/services/apm';
import { validateProcessorConfig } from '@tazama-lf/frms-coe-lib/lib/config/processor.config';

export default class KafkaRelayPlugin implements ITransportPlugin {
  private readonly kafka: Kafka;
  private producer?: Producer;
  private readonly loggerService: LoggerService;
  private readonly apm: Apm;
  private readonly configuration: Configuration;

  constructor(loggerService: LoggerService, apm: Apm) {
    this.loggerService = loggerService;
    this.apm = apm;
    // Validate and load configuration using the provided utility
    this.configuration = validateProcessorConfig(additionalEnvironmentVariables) as Configuration;

    // Use only CA_CERT for TLS
    const isDev = (this.configuration.NODE_ENV ?? process.env.NODE_ENV ?? 'dev') === 'dev';

    const ssl = isDev
      ? false
      : {
        rejectUnauthorized: false,
        ca: this.configuration.KAFKA_TLS_CA ? [this.configuration.KAFKA_TLS_CA] : [],
      };


    this.kafka = new Kafka({
      clientId: this.configuration.CLIENT_ID ?? 'relay-plugin',
      brokers: [this.configuration.DESTINATION_TRANSPORT_URL ?? 'localhost:9092'],
      ssl,
      logLevel: logLevel.ERROR,
    });
  }

  async init(): Promise<void> {
    this.loggerService.log(
      `Initializing Kafka producer for broker: ${this.configuration.DESTINATION_TRANSPORT_URL}`,
      KafkaRelayPlugin.name,
    );
    this.producer = this.kafka.producer();
    await this.producer.connect();
    this.loggerService.log('Kafka producer connected', KafkaRelayPlugin.name);
  }

  async relay(data: Uint8Array | string): Promise<void> {
    let apmTransaction = null;
    try {
      apmTransaction = this.apm.startTransaction(KafkaRelayPlugin.name);
      const span = this.apm.startSpan('relay');
      this.loggerService.log(`Sending data to Kafka topic: ${this.configuration.PRODUCER_STREAM}`, KafkaRelayPlugin.name);

      const payload = Buffer.isBuffer(data) ? data.toString() : typeof data === 'string' ? data : JSON.stringify(data);

      await this.producer?.send({
        topic: this.configuration.PRODUCER_STREAM,
        messages: [{ value: payload }],
      });

      span?.end();
    } catch (error) {
      this.loggerService?.error(`Kafka relay error: ${(error as Error).message}`, KafkaRelayPlugin.name);
    } finally {
      apmTransaction?.end();
    }
  }
}
