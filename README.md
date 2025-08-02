# HMJS

A TypeScript library for communicating with Hame battery devices via Bluetooth Low Energy (BLE). Primary support for the B2500 model.

## Overview

HMJS provides a simple interface for connecting to and monitoring Hame battery management systems through the Web Bluetooth API. The library includes device information retrieval, real-time monitoring, and configuration capabilities.

## Project Structure

- **`@tomquist/hmjs-protocol`** - Core protocol implementation for HM device communication
- **`@tomquist/hmjs-ble`** - BLE transport layer using Web Bluetooth API  
- **`demo`** - React web application demonstrating library usage

## Quick Start

### Installation

This project uses GitHub Packages for distribution. To install the published packages:

```bash
# One-time setup: Configure npm to use GitHub Packages for @tomquist scope
echo "@tomquist:registry=https://npm.pkg.github.com" >> ~/.npmrc

# Install the packages
npm install @tomquist/hmjs-ble
```

For development:

```bash
# Clone and install dependencies
git clone https://github.com/yourusername/hmjs.git
cd hmjs
npm install
```

### Running the Demo

```bash
npm start
```

Open your browser to the provided URL and use the demo interface to:
- Scan and connect to HM devices
- View device information and real-time data
- Monitor cell voltages and temperatures
- Configure device settings

### Using the Library

```typescript
import { BLEDeviceManager } from '@tomquist/hmjs-ble';

const manager = new BLEDeviceManager();

// Connect to a device
await manager.scanAndConnect();

// Listen for runtime data
manager.on('runtimeInfo', (data) => {
  console.log('Battery SOC:', data.soc);
  console.log('Power:', data.in1Power + data.in2Power);
});
```

## Development

```bash
# Build all packages
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

## Browser Compatibility

Requires a browser with Web Bluetooth API support (Chrome, Edge, Opera on desktop; limited mobile support).

## License

MIT