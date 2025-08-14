# Kafka Relay Plugin

A TypeScript plugin for relaying messages to Kafka, a simple, secure, and high-performance open source messaging system.

## Overview

The Kafka Relay Plugin is a transport plugin that enables applications to easily connect to and publish messages to a Kafka server. It wraps the underlying Kafka client functionality and provides a simple interface for initialization and message relaying. The plugin integrates with application performance monitoring (APM) to track transactions and spans, making it easy to monitor and troubleshoot message publishing.

## Features

- Connect to Kafka servers with configurable connection settings
- Support for TLS connections with certificate authority
- Publish various data types (binary, string, object) to configurable Kafka topics
- Automatic data type conversion for simple integration
- APM integration for performance monitoring and tracing
- Comprehensive logging for debugging and operational visibility
- Simple API with just two methods: `init()` and `relay()`
- Written in TypeScript with full type safety
- Fully tested with Jest

## Core Components

- **KafkaRelayPlugin Class**: Main implementation that handles connection and message relaying
- **Configuration Module**: Environment-based configuration system
- **Interface Definitions**: Type-safe contract definitions

## Installation

```bash
npm install @tazama-lf/kafka-relay-plugin
```

## Configuration

The plugin uses environment variables for configuration. Create a `.env` file in the root directory with the following variables:

```
KAFKA_DESTINATION_TRANSPORT_URL=localhost:9092
KAFKA_PRODUCER_STREAM=example.subject
KAFKA_TLS_CA=/path/to/ca.pem
KAFKA_CLIENT_ID=your-client-id
KAFKA_MAX_IN_FLIGHT_REQUESTS=5
```

### Configuration Options

| Environment Variable            | Description                                | Default Value      |
| ------------------------------- | ------------------------------------------ | ------------------ |
| KAFKA_DESTINATION_TRANSPORT_URL | The URL of the Kafka server to connect to  | localhost:9092     |
| KAFKA_PRODUCER_STREAM           | The topic to publish messages to           | example.subject    |
| KAFKA_TLS_CA                    | Path to the Certificate Authority file     | (required for TLS) |
| KAFKA_CLIENT_ID                 | Unique identifier for the Kafka client.    | relay-plugin       |
| KAFKA_maxInFlightRequests       | Max number of unacknowledged requests sent | None               |

## Usage

### Basic Usage

```typescript
import KafkaRelayPlugin from '@tazama-lf/kafka-relay-plugin';
import { LoggerService, Apm } from '@tazama-lf/frms-coe-lib';

// Create logger and APM instances
const loggerService = new LoggerService();
const apm = new Apm();

// Create plugin instance
const kafkaRelayPlugin = new KafkaRelayPlugin();

// Initialize the plugin (connects to Kafka server)
await kafkaRelayPlugin.init(loggerService, apm);

// Create some data to send
const stringData = 'Hello, Kafka!';
const binaryData = new TextEncoder().encode('Hello, Kafka!');

// Relay the data to Kafka
await kafkaRelayPlugin.relay(stringData);
await kafkaRelayPlugin.relay(binaryData);

// For objects, you must stringify them first
const objectData = { message: 'Hello, Kafka!', timestamp: Date.now() };
await kafkaRelayPlugin.relay(JSON.stringify(objectData));
```

## API Reference

### `KafkaRelayPlugin` Class

The main class that implements the `ITransportPlugin` interface.

#### Constructor

```typescript
constructor();
```

#### Methods

##### `init(loggerService?: LoggerService, apm?: Apm)`

Accepts `loggerService` and `apm` as parameters.
Initializes the connection to the Kafka server.

```typescript
async init(loggerService?: LoggerService, apm?: Apm): Promise<void>
```

- **Parameters**:
  - `loggerService`: An instance of LoggerService from @tazama-lf/frms-coe-lib for logging
  - `apm`: An instance of Apm from @tazama-lf/frms-coe-lib for performance monitoring
- **Returns**: A Promise that resolves when the connection is established
- **Functionality**:
  - Establishes connection to Kafka server using the configured server URL
  - Sets up TLS with the provided CA certificate
  - Logs success or failure of connection attempt
  - Handles connection errors gracefully

##### `relay(data)`

Relays (publishes) data to the configured Kafka topic.

```typescript
async relay(data: Uint8Array | string): Promise<void>
```

- **Parameters**:
  - `data`: The data to publish (can be Buffer, string, or object)
- **Returns**: A Promise that resolves when the data has been published
- **Functionality**:
  - Creates an APM transaction for monitoring
  - Creates a span to track the relay operation
  - Converts the input data to the appropriate format:
    - Buffers are converted to strings
    - Strings are sent as-is
  - Publishes the data to the configured Kafka topic
  - Logs the operation and any errors
  - Ends the APM transaction

### Configuration Module

The `config.ts` module loads configuration from environment variables.

- **Functionality**:
  - Loads the .env file from the project root
  - Provides server URL and topic name with defaults
  - Exports a typed configuration object

### Interfaces

#### `ITransportPlugin`

Defines the contract for transport plugins.

```typescript
interface ITransportPlugin {
  init(loggerService?: LoggerService, apm?: Apm): Promise<void>;
  relay(data: Uint8Array | string): Promise<void>;
}
```

#### `ExtendedConfig`

Defines the extended configuration structure with optional fields.

```typescript
export interface ExtendedConfig {
  KAFKA_DESTINATION_TRANSPORT_URL: string;
  KAFKA_PRODUCER_STREAM: string;
  KAFKA_TLS_CA: string;
  KAFKA_CLIENT_ID: string;
  KAFKA_MAX_IN_FLIGHT_REQUESTS: number;
}
```

#### `Configuration` Type

A composite type combining ProcessorConfig and ExtendedConfig.

```typescript
export type Configuration = ProcessorConfig & ExtendedConfig;
```

## Project Structure

```
kafka-relay-plugin/
├── dist/                   # Compiled JavaScript output
├── node_modules/           # Dependencies
├── src/
│   ├── config.ts           # Configuration module
│   ├── index.ts            # Main entry point
│   └── service/
│       └── kafkaRelayPlugin.ts   # Main implementation
├── __tests__/
│   └── kafkaRelayPlugin.test.ts  # Tests for the plugin
├── .env                    # Environment variables (create this)
├── package.json            # Project metadata and dependencies
├── tsconfig.json           # TypeScript configuration
├── jest.config.ts          # Jest configuration
└── README.md               # This file
```

## Development

### Prerequisites

- Node.js (>=14.x)
- npm or yarn
- A running Kafka server for testing
- TLS certificate for secure connections

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your configuration, including the path to your CA certificate file
4. Build the project:
   ```bash
   npm run build
   ```

### Available Scripts

- `npm run clean` - Clean build artifacts
- `npm run build` - Build the TypeScript code
- `npm test` - Run the test suite
- `npm run version` - Bump package version
- `npm run publish` - Publish the package
- `npm run lint` - Lint the codebase (ESLint and Prettier)
- `npm run fix:eslint` - Fix ESLint issues automatically
- `npm run fix:prettier` - Fix Prettier issues automatically

## Testing

The plugin includes comprehensive unit tests using Jest. The tests cover connection initialization, successful message relaying, and error handling scenarios. Mocks are used for Kafka connections, logger service, APM, and file system to isolate the testing of the plugin's functionality.

To run the tests:

```bash
npm test
```

## License

SPDX-License-Identifier: Apache-2.0
