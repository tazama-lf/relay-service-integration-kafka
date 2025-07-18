# SPDX-License-Identifier: Apache-2.0
# Developed By Paysys Labs

# Use Node.js as the base image
FROM node:20-alpine

ARG GH_TOKEN

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to the container
COPY package*.json ./
COPY .npmrc .npmrc

# Install dependencies
RUN npm install

# Copy the rest of the application code to the container
COPY . .

# Build the TypeScript code
RUN npm run build

# Environment variables (May require changes based on requirements)
ENV KAFKA_DESTINATION_TRANSPORT_URL=localhost:9092
ENV KAFKA_PRODUCER_STREAM=example.subject
ENV KAFKA_TLS_CA=/path/to/ca.pem
ENV KAFKA_CLIENT_ID=your-client-id
ENV KAFKA_MAX_IN_FLIGHT_REQUESTS=5

# Expose the port the app runs on
EXPOSE 3000

# Command to start the application
CMD ["npm", "start"]
