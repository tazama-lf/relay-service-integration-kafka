// SPDX-License-Identifier: Apache-2.0
import { Kafka, logLevel, type Producer } from 'kafkajs';
import { additionalEnvironmentVariables, type Configuration } from '../config';
import type { LoggerService } from '@tazama-lf/frms-coe-lib';
import type { Apm } from '@tazama-lf/frms-coe-lib/lib/services/apm';
import { validateProcessorConfig } from '@tazama-lf/frms-coe-lib/lib/config/processor.config';
import * as fs from 'fs';
import type { ITransportPlugin } from '@tazama-lf/frms-coe-lib/lib/interfaces/relay-service/ITransportPlugin';
import type { ConnectionOptions } from 'tls';

export default class KafkaRelayPlugin implements ITransportPlugin {
  private readonly kafka: Kafka;
  private producer?: Producer;
  private loggerService?: LoggerService;
  private apm?: Apm;
  private readonly configuration: Configuration;
  private readonly maxInFlight: number;

  constructor() {
    // Validate and load configuration
    this.configuration = validateProcessorConfig(additionalEnvironmentVariables) as Configuration;

    const isDev = !this.configuration.nodeEnv || this.configuration.nodeEnv === 'dev';

    const ssl: boolean | ConnectionOptions = isDev
      ? false
      : {
          rejectUnauthorized: false,
          ca: fs.existsSync(this.configuration.KAFKA_TLS_CA) ? [fs.readFileSync(this.configuration.KAFKA_TLS_CA)] : [],
        };

    const parsedMaxInFlight = Number(process.env.maxInFlightRequests);

    if (!parsedMaxInFlight || !Number.isInteger(parsedMaxInFlight) || parsedMaxInFlight <= 0) {
      throw new Error(`Invalid or missing 'maxInFlightRequests': ${process.env.maxInFlightRequests}`);
    }

    this.maxInFlight = parsedMaxInFlight;

    this.kafka = new Kafka({
      clientId: this.configuration.KAFKA_CLIENT_ID ?? 'relay-plugin',
      brokers: [this.configuration.KAFKA_DESTINATION_TRANSPORT_URL ?? 'localhost:9092'],
      ssl,
      logLevel: logLevel.ERROR,
    });
  }

  async init(loggerService?: LoggerService, apm?: Apm): Promise<void> {
    this.loggerService = loggerService;
    this.apm = apm;

    this.loggerService?.log(
      `Initializing Kafka producer for broker: ${this.configuration.KAFKA_DESTINATION_TRANSPORT_URL}`,
      KafkaRelayPlugin.name,
    );

    this.producer = this.kafka.producer({
      maxInFlightRequests: this.maxInFlight,
    });

    await this.producer.connect();

    this.loggerService?.log(`Kafka producer connected with maxInFlightRequests = ${this.maxInFlight}`, KafkaRelayPlugin.name);
  }

  async relay(data: Uint8Array | string): Promise<void> {
    let apmTransaction = null;
    try {
      apmTransaction = this.apm?.startTransaction(KafkaRelayPlugin.name);
      const span = this.apm?.startSpan('relay');

      this.loggerService?.log(`Sending data to Kafka topic: ${this.configuration.KAFKA_PRODUCER_STREAM}`, KafkaRelayPlugin.name);

      const payload = Buffer.isBuffer(data) ? data.toString() : typeof data === 'string' ? data : JSON.stringify(data);

      await this.producer?.send({
        topic: this.configuration.KAFKA_PRODUCER_STREAM,
        messages: [{ value: payload }],
      });

      span?.end();
    } catch (error) {
      this.loggerService?.error(`Kafka relay error: ${(error as Error).message}`, KafkaRelayPlugin.name);
      throw error as Error;
    } finally {
      apmTransaction?.end();
    }
  }
}
