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

`xxxx` is the end of the Bluetooth MAC address. The B2500's original
command set is documented in the library's `HMDeviceProtocol` and in
[esphome-b2500](https://github.com/tomquist/esphome-b2500); its additions are
below, the rest of this page covers the other families.

## B2500 additions

Queries take the payload `01`. Several replies come straight from the
firmware with a wrong length byte or without a checksum (`0x03`, `0x09`,
`0x33`, `0x38`); hmjs takes them as they arrive.

| Cmd | Payload | Reply / effect |
|---|---|---|
| `0x02` | region: 0 EU, 1 China, 2 rest of world | moves the device to that cloud host |
| `0x09` | `01` | signal (i16, dBm), then the SSID; no checksum |
| `0x23` | `01` | Wi-Fi module firmware version, text |
| `0x26` | `01` | factory reset: Wi-Fi and settings back to defaults |
| `0x2D` | `01` | rated output and input power (u16, W) |
| `0x2E` | `01` | host pack and two extension packs, 12 bytes each: voltage (u32, mV), current (i32, mA), two temperatures (i16, °C); zeros for an absent pack |
| `0x31` | meter code, then the meter MAC as 12 hex characters | sets the smart meter; restarts the CT search |
| `0x33` | `01` | CT search state, connection state, phase, meter type, three phase powers, grid power and total output (i16/u16, W); no checksum |
| `0x35` | `00` on, `01` off | surplus feed-in (firmware 226 or later, HMJ 108) |
| `0x38` | `01` | `ip<.,.>gateway<.,.>netmask<.,.>dns`; no checksum |

Corrections to the original command set:

* `0x0D` is the charging mode: 0 charges and discharges at the same time (a
  v1 passes PV2 through), 1 fully charges first. The app calls them
  half/full.
* `0x11` switches to adaptive mode whatever the payload; writing the timers
  (`0x12`) is the way back to timer mode.
* `0x14`: the six date fields are UTC, followed by the offset to local time
  in minutes (i16), as the app sends them.
* `0x03` also carries the charging and discharging temperature alarms (37,
  38), the bootloader version (56), two-device mode (57) and surplus feed-in
  off (59). The timer reply `0x13` carries the CT phase (payload 29), CT
  status (30), the three CT phase powers (33–38) and the meter type (53).
* `0x24` makes the Wi-Fi module download and flash firmware from a URL:
  never sent. `0x2B` reboots the device; `0x01`, `0x15` and `0x2C` left
  the emulated device's Bluetooth unusable for minutes.

The Saturn micro-inverters (`HMI`) run their Bluetooth on the Wi-Fi module
rather than the control board; their protocol is not covered here.

## Commands shared by the other families

| Cmd | Payload | Reply | Families |
|---|---|---|---|
| `0x03` | none | status block, see below | all (decoded: every family but the meters) |
| `0x04` | `0x01` | `type=…,id=…,mac=…` plus versions, as text | all (the Venus E 3.0/A/D only answer with the `0x01`) |
| `0x05` | `ssid<.,.>password` | — | all |
| `0x08` | none | name of the configured Wi-Fi network, as text | `venus`, `venus3`, `venusMini` |
| `0x0B` | none | clock: year (u16), month, day, hour, minute, second, weekday (0 = Sunday) | `venus3`, `jupiter` |
| `0x0D` | none | grid and inverter, see below | `venus3` |
| `0x14` | none | battery data with cells, see below | `venus`, `venus3`, `venusMini`, `jupiter` |
| `0x24` | `00` | `ip:…,gate:…,mask:…,dns:…` | every Venus, `venusMini`; the Jupiter answers `29 00` |

### Commands never to send

| Family | Cmd | Effect |
|---|---|---|
| `venusMini` | `0x17` | the Wi-Fi module downloads and flashes firmware from `http://192.168.137.1/FC41D_OTA.rbl` |
| `meter` | `0x29` | the Wi-Fi module downloads and flashes firmware from the URL in the payload |

A wrong image can leave the device without Wi-Fi or Bluetooth. The library
refuses both, also through `sendRawBytes`.

## Settings and schedules

The same setting often has a different command number per family. Payloads
are complete as listed: the Venus E Mini does not check the length of what it
receives and fills a short payload with leftover bytes. "`0A 0B 0C`" is a
fixed marker some Venus and Jupiter commands expect.

| Setting | Venus C/E, Venus E 3.0/A/D | Jupiter | Venus E Mini |
|---|---|---|---|
| Working mode | `09 00` auto, `09 01` manual, `09 05 01` AI | `09 01` auto, `09 02` manual | `02 <m>`: 0 auto, 1 UPS, 2 manual, 3 AI |
| Read schedule | `0A 01` → 10 slots of 8 bytes | `0A 01` → 5 slots used | `0A 01` → mode + 6 slots of 9 bytes |
| Write one slot | `09 01 <i> <slot>` | `09 02 <i> <slot>` (also selects manual) | `A0+i <9 bytes>` |
| Depth of discharge | `54 <%>` (E 3.0/A/D, 30–88) | `54 <%>` (30–90) | `44 <%>` (30–90) |
| Status LED | `59 <1 on / 0 off>` (E 3.0/A/D) | — | `27 <0 on / 1 off>` |
| Bluetooth advertising | `53 0A <1/0>` (E 3.0/A/D) | `55 0A <1/0>` | `26 <2 on / 1 lock>` |
| Surplus feed-in | `41 <1/0>` (not reported back) | `22 <1/0>` | — |
| Local API | `28 <en> <port u16>` | — | `2D <en> <port u16> <remote port u16>` |
| Max charge / discharge power | `16 <W u16>` / `17 <W u16>` (E 3.0/A/D) | — | — |
| Peak shaving | `29 01 <W u16>`, off `29 00` (E 3.0/A/D) | — | — |
| Backup output | `0F <1/0>` | — | — |
| Meter IP (P1, EcoTracker) | `21 0A <IP text>` | `25 0A <IP text>` | `21 0A <IP text>` |
| Phase detection | `1D 0A 0B 0C` (E 3.0/A/D) | `20 0A 0B 0C` | `20 01` |
| Clock | `0B <year u16> <month> <day> <h> <m> <s>` (E 3.0/A/D) | same | `46 <year−2000> <month> <day> <h> <m> <s>` |
| Cloud server | `02 <n>`: 0 EU, 2 China/other, 3 test, 4 pre-release (E 3.0/A/D) | same | `2A <n>`: 0 EU, 1 US, 2 dev, 3 staging |
| Power limits | — | — | `28 <feed-in: 0 800 W, 1 higher> <grid charge: 0 1250 W, 1 800 W>` |
| UPS charge power | — | — | `2C <W u16>` |
| Anti-reverse | — | — | `35 <en> 02 <W u16>` |
| Restart | — | — | `2B 01` |

Schedule slot, Venus and Jupiter (8 bytes): start hour, start minute, end
hour, end minute, weekday mask, power (i16, W; Venus: positive discharges,
negative charges, −1 follows the meter; Jupiter: discharge power), enabled.

Schedule slot, Venus E Mini, as written (9 bytes): enabled, power (u16, W),
action (0 idle, 1 charge, 2 discharge, 3 follow the meter), start hour, start
minute, end hour, end minute (23:59 runs to midnight), weekday mask (bit 0 =
Monday). The `0A` reply stores each slot with the action before the power.

`0x13` (error history) can exceed 255 bytes on a Venus; its length byte then
holds the length modulo 256. The library does not request it.

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

`0x03` status (120 bytes):

| Offset | Type | Field |
|---|---|---|
| 0 | u16 | grid frequency, ×0.01 Hz |
| 2 | u16 | grid voltage, ×0.1 V |
| 14 | u32 | remaining energy, Wh |
| 18 | u16 | state of charge, ×0.1 % |
| 24 | u8 | working mode (0 auto, 1 UPS, 2 manual, 3 AI) |
| 25 | u8 | meter answering |
| 34 | i32 | AC power, W |
| 42 | u8 | depth of discharge, % |
| 47 | i16 | battery power, W (negative: discharging) |
| 54 | u8 | Wi-Fi signal, −dBm |
| 91, 93, 95 | u16 | inverter, control and DC/DC firmware versions |
| 97 | u8 | meter type code |
| 100 | u8 | LED (0 = on) |
| 101 | u8 | feed-in limit (1 = the higher one) |
| 102 | u8 | detected meter phase |
| 103 | u8 | cloud server |
| 112 | u16 | UPS charge power, W |
| 114, 115, 117 | u8, u16, u16 | local API enabled, port, remote port |
| 119 | u8 | grid charge limited to 800 W |

`0x1A` meter power (19 bytes): phase A, B, C and total power (i16, W) at 0,
2, 4, 6; detected phase at 10, meter type code at 11, meter answering at 12,
the meter's MAC at 13.

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

`0x03` (payload `01`) status. The CT002 sends 19 payload bytes: firmware
version (0), phase A/B/C and total power (i16, W) at 7, 9, 11, 13, batteries
reading the meter (16), Wi-Fi signal (i8, dBm, 17), direction mask (18). The
CT003 sends a longer block: firmware version (0), total power (i32, W, 1),
total energy (i64, 0.1 Wh, 5; on a DSMR meter import minus export), batteries
(14), Wi-Fi signal (15), reader settings (16–19), phase A/B/C power (i32, W)
at 24, 28, 32.

| Cmd | Payload | Effect | Meter |
|---|---|---|---|
| `0x08` | `01` | configured Wi-Fi network name | both |
| `0x10` | `01` | zero-point calibration | CT002 |
| `0x11` | interface (0 infrared, 1 P1), serial settings code, protocol (0 SML, 1 DSMR), meter number | reader settings; the meter restarts | CT003 |
| `0x13`, `0x15`, `0x16` | `01` | phase voltages (V), voltage phase angles AB/CA/BC (°), active power per phase (W) | CT002 |
| `0x17` | mask, bit 0–2 = phase A–C | measurement direction. On the emulated HME-4 a cleared bit inverts the phase; check on your meter | CT002 |
| `0x09` | `01` | restart (it is the Wi-Fi query on a B2500) | both |
| `0x06` | `01` | factory reset | both |

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

The settings, schedules and the Mini's status fields were then read out of
the Marstek app (1.7.0) as a list of the commands it sends and the replies it
parses, and each one was confirmed on the emulated firmware by sending the
app's payload and checking the device's own status afterwards. Where the app
and the firmware disagreed, the firmware won (the Mini's phase mode is
`0x19`, not the `0x13` the app sends; its factory reset does not work over
Bluetooth).

The library was then tested end to end against the emulated Venus E 3.0,
Jupiter, Venus E Mini, B2500 v3 (HMA V232) and CT002 (HME-4 V124). Real devices may run newer firmware; if a value
looks wrong on yours, please open an issue with the raw reply from the
Advanced tab.
