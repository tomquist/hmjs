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

### Without a device: the marsemu emulator

[marsemu](https://github.com/tomquist/marsemu) runs a device's own firmware
without the hardware and serves its Bluetooth over WebSocket. Start it with
`--ble-ws`, then open the demo with `?emulator=` pointing at it; the scan
then finds the emulated device instead of opening the browser's picker.
This works in any browser, without Web Bluetooth or a Bluetooth adapter:

Browsers let the hosted (HTTPS) demo open `ws://` only to the local
computer (`localhost`, `127.0.0.1`); an emulator on another machine needs
`wss://` there, or a demo served over plain HTTP (`npm start`).

```bash
marsemu venus3 CONTROL.bin BMS.bin --realtime --ble-ws 7101
# https://tomquist.github.io/hmjs/?emulator=ws://localhost:7101/
```

The URL can also be entered in the demo's advanced connection options, and
marsemu's dashboard has an "Open in hmjs" button that does it for you. In
code, pass `createEmulatorBluetooth(url)` as the manager's `bluetooth`
option:

```ts
import { BLEDeviceManager, createEmulatorBluetooth } from "@tomquist/hmjs-ble";

const manager = new BLEDeviceManager({
  bluetooth: createEmulatorBluetooth("ws://localhost:7101/"),
});
await manager.connect();
```

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
| Status (`getStatus`) | `getRuntimeInfo` | ✓ | ✓ | ✓ | ✓ | ✓ |
| Battery and cell voltages (`getBatteryInfo`) | `getCellInfo` | ✓ | ✓ | ✓ | ✓ | |
| Grid, PV and battery (`getSystemInfo`) | | | | | ✓ | |
| Grid and inverter (`getInverterInfo`) | | | ✓ | | | |
| Device clock (`getDeviceTime`) | | | ✓ | | ✓ | |
| Wi-Fi network / IP (`getWifiSsid` / `getNetworkInfo`) | / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | / ✓ | ✓ / |
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
| Wi-Fi signal, module version, packs, CT status, rated power (`getWifiSignal`, …) | ✓ | | | | | |
| Region, meter type, surplus feed-in, factory reset | ✓ | | | | | factory reset |
| Meter direction, zero calibration, phase readings (CT002); reader settings (CT003) | | | | | | ✓ |

```typescript
const manager = new BLEDeviceManager();
await manager.connect();                 // the picker lists every Marstek device
const family = await manager.detectFamily(); // e.g. "venus3"

if (family === "meter") {
  const meter = await manager.getStatus();
  if ("phases" in meter) console.log(meter.phases, meter.total); // W
} else if (family && family !== "b2500") {
  const status = await manager.getStatus();
  if ("soc" in status) console.log(status.soc);
  const battery = await manager.getBatteryInfo();
  console.log(battery.cellVoltages);     // mV
}
```

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

Requires a browser with Web Bluetooth API support (Chrome, Edge, Opera on desktop; limited mobile support). With an emulated device (`?emulator=`), any browser with WebSocket works (`wss://` for an emulator on another machine, from the hosted demo).

## License

MIT