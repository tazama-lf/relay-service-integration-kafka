// SPDX-License-Identifier: Apache-2.0
import * as dotenv from 'dotenv';
import path from 'node:path';
import type { AdditionalConfig, ProcessorConfig } from '@tazama-lf/frms-coe-lib/lib/config/processor.config';

dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

export interface ExtendedConfig {
  KAFKA_DESTINATION_TRANSPORT_URL: string;
  KAFKA_PRODUCER_STREAM: string;
  KAFKA_TLS_CA: string;
  KAFKA_CLIENT_ID: string;
  KAFKA_MAX_IN_FLIGHT_REQUESTS: number;
}

export const additionalEnvironmentVariables: AdditionalConfig[] = [
  {
    name: 'KAFKA_DESTINATION_TRANSPORT_URL',
    type: 'string',
  },
  {
    name: 'KAFKA_PRODUCER_STREAM',
    type: 'string',
  },
  {
    name: 'KAFKA_TLS_CA',
    type: 'string',
    optional: true,
  },
  {
    name: 'KAFKA_CLIENT_ID',
    type: 'string',
  },
  {
    name: 'KAFKA_MAX_IN_FLIGHT_REQUESTS',
    type: 'number',
  },
];

export type Configuration = ProcessorConfig & ExtendedConfig;
