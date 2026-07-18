# HMJS

A TypeScript library for communicating with Hame battery devices via Bluetooth Low Energy (BLE). Primary support for the B2500 model.

<!-- marstek-family:start -->
**🔋 The Marstek ecosystem.** This repo is part of a family of open-source tools for Marstek batteries (B2500, Venus, Jupiter, …):

| Project | What it does |
|---|---|
| [hm2mqtt](https://github.com/tomquist/hm2mqtt) | Brings your battery into your smart home, turning its raw data into readable sensors and controls (e.g. in Home Assistant) |
| [hame-relay](https://github.com/tomquist/hame-relay) | Connects the official Marstek cloud/app and your local smart home so both work together, forwarding data whichever way your battery is set up |
| [marsrelay](https://github.com/tomquist/marsrelay) | Runs your battery completely offline, with no internet or Marstek cloud, while still sending all its data to your smart home |
| [AstraMeter](https://github.com/tomquist/astrameter) | Tells your battery your live grid usage (read from your existing meter) so it charges and discharges to avoid buying or selling power |
| **hmjs** (this repo) | Sets up and configures B2500 batteries over Bluetooth, right from your web browser, with no app or account needed |
| [esphome-b2500](https://github.com/tomquist/esphome-b2500) | Continuously monitors and controls a B2500 over Bluetooth using a small ESP32 board |
<!-- marstek-family:end -->

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