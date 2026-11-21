# HMJS

A TypeScript library for communicating with Marstek (Hame) devices via Bluetooth Low Energy (BLE): the B2500, the Venus family, the Venus E Mini, the Jupiter family and the CT002/CT003 meters.

**👉 [Try the live demo](https://tomquist.github.io/hmjs/)** — connect to your Marstek battery straight from the browser, no install or account needed (requires a Web Bluetooth capable browser).

<!-- marstek-family:start -->
**🔋 The Marstek ecosystem.** This repo is part of a family of open-source tools for Marstek batteries (B2500, Venus, Jupiter, …):

| Project | What it does |
|---|---|
| [hm2mqtt](https://github.com/tomquist/hm2mqtt) | Brings your battery into your smart home, turning its raw data into readable sensors and controls (e.g. in Home Assistant) |
| [hame-relay](https://github.com/tomquist/hame-relay) | Connects the official Marstek cloud/app and your local smart home so both work together, forwarding data whichever way your battery is set up |
| [marsrelay](https://github.com/tomquist/marsrelay) | Runs your battery completely offline, with no internet or Marstek cloud, while still sending all its data to your smart home |
| [AstraMeter](https://github.com/tomquist/astrameter) | Tells your battery your live grid usage (read from your existing meter) so it charges and discharges to avoid buying or selling power |
| **hmjs** (this repo) | Sets up and configures Marstek batteries and meters over Bluetooth, right from your web browser, with no app or account needed |
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

The demo is deployed to GitHub Pages at **<https://tomquist.github.io/hmjs/>** — open it in Chrome, Edge or Opera to use it without building anything.

To run it locally:

```bash
npm start
```

Open your browser to the provided URL and use the demo interface to:
- Scan and connect to HM devices
- View device information and real-time data
- Monitor cell voltages and temperatures
- Read and edit the manual-mode timer schedule
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

#### Other Marstek devices

All Marstek devices share the B2500's frame format, but each family gives the
command numbers its own meaning. The manager works out the family from the
Bluetooth name and the device type, and offers typed methods for what is
known about each:

| | B2500 | Venus C/E | Venus E 3.0/A/D | Venus E Mini | Jupiter | CT002/CT003 |
|---|---|---|---|---|---|---|
| Device info, Wi-Fi setup | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Status (`getStatus`) | `getRuntimeInfo` | ✓ | ✓ | ✓ | ✓ | raw |
| Battery and cell voltages (`getBatteryInfo`) | `getCellInfo` | ✓ | ✓ | ✓ | ✓ | |
| Grid, PV and battery (`getSystemInfo`) | | | | | ✓ | |
| Grid and inverter (`getInverterInfo`) | | | ✓ | | | |
| Device clock (`getDeviceTime`) | | | ✓ | | ✓ | |
| Wi-Fi network / IP (`getWifiSsid` / `getNetworkInfo`) | | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | / ✓ | |
| Depth of discharge (`setDepthOfDischarge`) | ✓ | | ✓ | ✓ | ✓ | |
| Status LED (`setStatusLed`) | | | ✓ | ✓ | | |
| Working mode (`setWorkingMode`) | | ✓ | ✓ | ✓ | ✓ | |
| Schedule (`getTimePeriods`/`setTimePeriod`, Mini: `getMiniSchedule`/`setMiniScheduleSlot`) | timers | ✓ | ✓ | ✓ | ✓ | |
| Bluetooth advertising (`setBluetooth`) | | | ✓ | ✓ | ✓ | |
| Surplus feed-in (`setSurplusFeedIn`) | | ✓ | ✓ | | ✓ | |
| Local API (`setLocalApi`) | | ✓ | ✓ | ✓ | | |
| Meter IP (`setMeterIp`) | | ✓ | ✓ | ✓ | ✓ | |
| Phase detection, clock, cloud server | | | ✓ | ✓ | ✓ | |
| Max charge/discharge power, peak shaving (`setMaxChargePower`, …) | | | ✓ | | | |
| Backup output (`setBackup`) | | ✓ | ✓ | | | |
| Power limits, UPS power, anti-reverse, restart, meter power | | | | ✓ | | |

```typescript
const manager = new BLEDeviceManager();
await manager.connect();                 // the picker lists every Marstek device
const family = await manager.detectFamily(); // e.g. "venus3"

const status = await manager.getStatus();
console.log(status.soc, status.acPower);

const battery = await manager.getBatteryInfo();
console.log(battery.cellVoltages);       // mV
```

"raw" means the reply is available undecoded through `request(0x03)`.
The B2500-only methods (timers, MQTT, charge mode, …) refuse to run on other
families, because the same command numbers change unrelated settings there.
Commands that make a device's Wi-Fi module flash new firmware are never sent.
[docs/bluetooth-protocol.md](docs/bluetooth-protocol.md) has the command
tables and reply layouts, and how they were mapped.

#### Timer schedule

The device stores a fixed number of manual-mode timer slots (3 on firmware
< 218, 5 otherwise) and rewrites all of them from a single command. Read the
current schedule first, change the slots you care about and write the complete
set back:

```typescript
const schedule = await manager.getTimers();

const timers = schedule.timers.map((timer) => ({ ...timer }));
timers[0] = {
  enabled: true,
  start: { hour: 8, minute: 0 },
  end: { hour: 17, minute: 0 },
  outputPower: 500,
};

await manager.setTimers(timers);
```

> **Note:** every `setTimers` call is persisted to the device's flash memory,
> which only tolerates a limited number of write cycles. Do not use the timers
> to build a zero feed-in automation.

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