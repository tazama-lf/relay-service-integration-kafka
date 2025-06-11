// SPDX-License-Identifier: Apache-2.0
import * as dotenv from 'dotenv';
import path from 'path';
import type { AdditionalConfig, ProcessorConfig } from '@tazama-lf/frms-coe-lib/lib/config/processor.config';

dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

export interface ExtendedConfig {
  DESTINATION_TRANSPORT_URL: string;
  PRODUCER_STREAM: string;
  KAFKA_TLS_CA: string;
  CLIENT_ID?: string;
  NODE_ENV?: string;
}

export const additionalEnvironmentVariables: AdditionalConfig[] = [
  {
    name: 'DESTINATION_TRANSPORT_URL',
    type: 'string',
  },
  {
    name: 'PRODUCER_STREAM',
    type: 'string',
  },
  {
    name: 'KAFKA_TLS_CA',
    type: 'string',
  },
  {
    name: 'CLIENT_ID',
    type: 'string',
    optional: true,
  },
  
];

export type Configuration = ProcessorConfig & ExtendedConfig;
