# @tomquist/hmjs-ble

BLE transport layer for HM devices using the Web Bluetooth API. Works in browsers and in Node.js (via the optional [`webbluetooth`](https://github.com/thegecko/webbluetooth) peer dependency).

## Installation

This package is published to GitHub Packages. You need to configure npm to use GitHub Packages for the `@tomquist` scope:

```bash
# One-time setup: Configure npm registry for @tomquist packages
echo "@tomquist:registry=https://npm.pkg.github.com" >> ~/.npmrc

# Then install the package (protocol dependency will be resolved automatically)
npm install @tomquist/hmjs-ble
```

Alternatively, you can create a `.npmrc` file in your project root:

```
@tomquist:registry=https://npm.pkg.github.com
```

## Description

This package provides a Bluetooth Low Energy (BLE) transport layer for communicating with Hame battery management systems through the Web Bluetooth API. It handles device discovery, connection management, and data transmission.

## Usage

```typescript
import { BLEDeviceManager } from '@tomquist/hmjs-ble';

const manager = new BLEDeviceManager();

// Scan and connect to a device
await manager.scanAndConnect();

// Listen for runtime data
manager.on('runtimeInfo', (data) => {
  console.log('Battery SOC:', data.soc);
  console.log('Power:', data.in1Power + data.in2Power);
});

// Listen for device information
manager.on('deviceInfo', (info) => {
  console.log('Device Model:', info.model);
  console.log('Firmware Version:', info.firmwareVersion);
});

// Get cell information
const cellInfo = await manager.getCellInfo();
console.log('Cell voltages:', cellInfo.cellVoltages);
```

## Features

- **Device Discovery**: Scan for compatible HM devices
- **Connection Management**: Automatic connection handling with reconnection support
- **Real-time Monitoring**: Live data streaming for battery status, power, and temperatures
- **Device Configuration**: Read and write device settings
- **Cell Monitoring**: Individual cell voltage and temperature monitoring
- **Event-driven API**: Subscribe to device events and data updates

## Node.js Usage

The library auto-detects Node.js and loads the optional [`webbluetooth`](https://github.com/thegecko/webbluetooth) peer dependency (backed by BlueZ on Linux — e.g. Raspberry Pi):

```bash
npm install webbluetooth
```

Then use the manager exactly as in the browser — no extra wiring required:

```typescript
import { BLEDeviceManager } from '@tomquist/hmjs-ble';

const manager = new BLEDeviceManager();
await manager.connect();
console.log(await manager.getDeviceInfo());
```

If you need to customise the `Bluetooth` instance (e.g. to filter devices during the Node.js scan), inject your own:

```typescript
import { Bluetooth } from 'webbluetooth';
import { BLEDeviceManager } from '@tomquist/hmjs-ble';

const bluetooth = new Bluetooth({
  deviceFound: (device) => device.name?.startsWith('HM_') ?? false,
});
const manager = new BLEDeviceManager({ bluetooth });
await manager.connect();
```

BlueZ typically needs root or `CAP_NET_ADMIN`/`CAP_NET_RAW` capabilities, so run with `sudo` or grant the Node binary capabilities.

## Browser Compatibility

Requires a browser with Web Bluetooth API support:
- ✅ Chrome/Chromium (desktop)
- ✅ Edge (desktop)
- ✅ Opera (desktop)
- ❌ Firefox (no Web Bluetooth support)
- ⚠️ Mobile browsers (limited support)

## API Documentation

### BLEDeviceManager

The main class for managing BLE connections to HM devices.

#### Methods

- `scanAndConnect()`: Scan for and connect to a device
- `disconnect()`: Disconnect from the current device
- `getDeviceInfo()`: Get device information
- `getRuntimeInfo()`: Get current runtime data
- `getCellInfo()`: Get cell voltage and temperature data
- `getConfiguration()`: Get device configuration
- `setConfiguration(config)`: Update device configuration

#### Events

- `'connected'`: Device connected
- `'disconnected'`: Device disconnected
- `'deviceInfo'`: Device information received
- `'runtimeInfo'`: Runtime data received
- `'cellInfo'`: Cell data received
- `'error'`: Error occurred

## Package Information

- **Registry**: GitHub Packages  
- **Scope**: `@tomquist`
- **Package URL**: https://github.com/tomquist/hmjs/packages

## Dependencies

This package automatically installs `@tomquist/hmjs-protocol` as a dependency from the same GitHub Packages registry.

## License

MIT