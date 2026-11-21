# Bluetooth protocol of the Marstek devices

Every Marstek (Hame) device in this list speaks the same frame format over
Bluetooth Low Energy, but the families give the command numbers different
meanings. This page records what is known per family and how it was found.

## Common to all families

| | |
|---|---|
| Service | `0xFF00` (`0000ff00-0000-1000-8000-00805f9b34fb`) |
| Write | `0xFF01` |
| Notify | `0xFF02` |
| Frame | `0x73`, length of the whole frame, `0x23`, command, payload, XOR of all previous bytes |
| Byte order | little-endian unless noted |

The Tronic (Lidl, 100 series) is the exception: service `0x00FF`, write
`0xFF03`, notify `0xFF01`.

## Families

| Family | Products | Device type | Bluetooth name |
|---|---|---|---|
| `b2500` | B2500 v1/v2/v3, Saturn | `HMA`, `HMB`, `HMF`, `HMJ`, `HMK` | `HM_B2500_xxxx` |
| `venus` | Venus C, Venus E (v1/v2) | `HMG` | `MST_ACCP_xxxx` |
| `venus3` | Venus E 3.0, Venus A, Venus D | `VNSE3`, `VNSA`, `VNSD` | `MST_VNSE3_xxxx`, `MST_VNSA_xxxx`, `MST_VNSD_xxxx` |
| `venusMini` | Venus E Mini | `VNSEMINI` | `MARS_VNSEM_xxxx` |
| `jupiter` | Jupiter C, Jupiter E, Jupiter C Plus | `HMM`, `HMN`, `JPLS` | `MST_AIOS_xxxx`, `MST_JPLS_xxxx` |
| `meter` | CT002, CT003 | `HME`, `SMR`, `TPM` | `MST-TPM_xxxx`, `MST-SMR_xxxx` |

`xxxx` is the end of the Bluetooth MAC address. The B2500 command set is
documented in the library's `HMDeviceProtocol` and in
[esphome-b2500](https://github.com/tomquist/esphome-b2500); the rest of this
page covers the other families.

The Saturn micro-inverters (`HMI`) run their Bluetooth on the Wi-Fi module
rather than the control board; their protocol is not covered here.

## Commands shared by the other families

| Cmd | Payload | Reply | Families |
|---|---|---|---|
| `0x03` | none | status block, see below | all (decoded: every family but the meters) |
| `0x04` | `0x01` | `type=…,id=…,mac=…` plus versions, as text | all (the Venus E 3.0/A/D only answer with the `0x01`) |
| `0x05` | `ssid<.,.>password` | — | all |
| `0x08` | none | name of the configured Wi-Fi network, as text | `venus`, `venus3` |
| `0x0B` | none | clock: year (u16), month, day, hour, minute, second, weekday (0 = Sunday) | `venus3`, `jupiter` |
| `0x0D` | none | grid and inverter, see below | `venus3` |
| `0x14` | none | battery data with cells, see below | `venus`, `venus3`, `venusMini`, `jupiter` |
| `0x24` | none | `ip:…,gate:…,mask:…,dns:…` | `venus`, `venusMini` |
| `0x54` | percent (u8) | — sets the depth of discharge | `venus3` (30–88), `jupiter` (30–90) |
| `0x59` | `0x01` on, `0x00` off | — sets the status LED | `venus3` |

### Commands never to send

| Family | Cmd | Effect |
|---|---|---|
| `venusMini` | `0x17` | the Wi-Fi module downloads and flashes firmware from `http://192.168.137.1/FC41D_OTA.rbl` |
| `meter` | `0x29` | the Wi-Fi module downloads and flashes firmware from the URL in the payload |

A wrong image can leave the device without Wi-Fi or Bluetooth. The library
refuses both, also through `sendRawBytes`.

## Reply layouts

Offsets are into the payload (after the 4 header bytes). Only fields whose
meaning was confirmed are listed; everything else is in `rawPayload`.

### Venus E 3.0 / A / D

`0x03` status, 139 bytes on the E 3.0. The A and D insert 28 bytes of PV data
after offset 106, so the fields marked † move by 28 there (read them relative
to the end of the block).

| Offset | Type | Field |
|---|---|---|
| 2 | i16 | AC power, W (positive: feeding the house) |
| 9 | u16 | remaining energy, ×10 Wh |
| 11 | u8 | state of charge, % |
| 12 | u16 | control firmware version |
| 61 | u8 | Wi-Fi signal, −dBm |
| 72 | u16 | maximum charging power, W |
| 79 | u16 | BMS firmware version |
| 81 | 12 chars | Wi-Fi module firmware version |
| 103 | u16 | inverter firmware version |
| 105 | u16 | local API port |
| 122 | u16 | MPPT firmware version (A and D only) |
| 112 † | i16 | battery power, W (negative: discharging) |
| 121 † | u8 | depth of discharge, % |

`0x0D` grid and inverter: grid frequency u16 at 1 (×0.1 Hz), grid voltage u16
at 3 (×0.1 V), AC power i16 at 5 (W).

`0x14` battery:

| Offset | Type | Field |
|---|---|---|
| 0 | u16 | BMS firmware version |
| 8 | u16 | state of charge, % |
| 12 | u16 | rated capacity, Wh |
| 14 | u16 | pack voltage, ×0.01 V |
| 16 | i16 | pack current, ×0.1 A (negative: discharging) |
| 22 | u16 | remaining energy, ×10 Wh |
| 40 | 4 × i16 | cell temperatures, ×0.1 °C |
| 48 | 16 × u16 | cell voltages, mV |

### Venus E Mini

`0x03` status (120 bytes): grid frequency u16 at 0 (×0.01 Hz), grid voltage
u16 at 2 (×0.1 V), remaining energy u16 at 14 (Wh), state of charge u16 at 18
(×0.1 %), AC power i16 at 34 (W).

`0x14` battery (44 bytes):

| Offset | Type | Field |
|---|---|---|
| 12 | u16 | state of charge, ×0.1 % |
| 16 | u16 | rated capacity, Wh |
| 18 | u16 | pack voltage, mV |
| 22 | i32 | pack current, mA (negative: discharging) |
| 26 | i16 | temperature, ×0.1 °C |
| 30 | u16 | remaining energy, Wh |
| 36, 38 | i16 | temperatures, ×0.1 °C |
| 40, 42 | u16 | cell voltages, mV |

The state of charge is the Mini's own estimate; the cell voltages and current
are measurements. None of this is available over MQTT.

### Jupiter C / E / C Plus

`0x03` status (72 bytes, 74 on the C Plus):

| Offset | Type | Field |
|---|---|---|
| 0, 3, 6, 9 | u16 | PV 1–4 power, W; the byte after each is 1 while the input is active |
| 12 | u16 | AC power, W |
| 19 | u16 | remaining energy, ×10 Wh |
| 21 | u8 | state of charge, % |
| 39 | u32 | energy delivered today, ×10 Wh |
| 43 | u32 | energy delivered this month, ×10 Wh |
| 47, 49, 51, 53 | u16 | control, inverter, MPPT and BMS firmware versions |
| 57 | u8 | Wi-Fi signal, −dBm |
| end − 2 | u8 | depth of discharge, % |

`0x14` system (166 bytes):

| Offset | Type | Field |
|---|---|---|
| 6 | u16 | grid voltage, ×0.1 V |
| 8 | u16 | AC current, ×0.01 A |
| 12 | u16 | grid frequency, ×0.01 Hz |
| 16 | u16 | AC power, W |
| 40 + 6n | 3 × u16 | PV n+1: voltage ×0.1 V, current ×0.1 A, power ×0.1 W |
| 94 | u16 | state of charge, % |
| 98 | u16 | rated capacity, Wh |
| 100 | u16 | BMS firmware version |
| 102 | u16 | pack voltage, ×0.01 V |
| 104 | i16 | pack current, ×0.1 A (positive: charging) |
| 122 | 16 × u16 | cell voltages, mV (Jupiter C/E) |
| 124, 126 | u16 | highest and lowest cell, mV (Jupiter C Plus) |
| 154 | 6 × i16 | temperatures, ×0.1 °C (whole °C on the C Plus) |

### Venus C / E

`0x03` status (109 bytes) has the Venus E 3.0 header: AC power i16 at 2 (W,
as the device reports it), remaining energy u16 at 9 (×10 Wh), state of charge
u8 at 11 (%), control firmware version u16 at 12, Wi-Fi signal u8 at 61
(−dBm), BMS firmware version u16 at 79, Wi-Fi module firmware version at 81
(12 characters) and the local API port u16 at 102. There is no inverter
version: the control board runs the power stage itself.

`0x14` battery (80 bytes) has the Venus E 3.0 layout, with the four
temperatures at 40 in whole °C.

`0x25` sets the Shelly port and `0x28` the local API port, as on the Venus E
3.0; their payload format is not mapped, so the library does not offer them.

### CT002 / CT003

Device info and Wi-Fi setup work as above. The status block is not decoded
yet; the library returns it raw.

## How this was mapped

Each family's control firmware was run in
[marsemu](https://github.com/tomquist/marsemu), an emulator that runs the
real images against simulated batteries, inverters, PV and meters. Every
command number was sent; for each reply, the bytes were compared with what
the same firmware reported over MQTT at that moment and with the simulated
hardware, at two different operating points so that a match also had to
follow a change. Settings were mapped by sending each command a value derived
from its own number and watching which MQTT status field took that value.
Fields are listed only where that left no doubt.

The Venus C/E runs its 30 kHz power-stage control loop on the control board,
which the emulator executes at about a ninth of real time; its run took half
an hour.

The library was then tested end to end against the emulated Venus E 3.0,
Jupiter and Venus E Mini. Real devices may run newer firmware; if a value
looks wrong on yours, please open an issue with the raw reply from the
Advanced tab.
