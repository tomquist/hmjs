# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Ten more device commands, with typed `BLEDeviceManager` methods: read WiFi
  info (`0x08`), set depth of discharge (`0x0B`), set discharge threshold
  (`0x0C`), set charge mode (`0x0D`), set output channels (`0x0E`), set
  adaptive mode (`0x11`), set date/time (`0x14`), restart (`0x25`), run
  diagnosis (`0x2A`) and read error info (`0x30`). Frames were taken from the
  official app; `0x2A` and `0x30` were not previously documented here.
- `CHARGE_MODE`, `OUTPUT_CHANNEL`, `DIAGNOSIS_VARIANT` and
  `DATETIME_YEAR_EPOCH` constants.
### Changed
### Deprecated
### Removed
### Fixed
- Correct the protocol reference, which had wrong length bytes in every
  single-payload-byte example (`73 05 …` where the device expects `73 06 …`).
  All documented example frames now carry a correct length and checksum.
- Correct the `0x14` date/time documentation: the payload is 8 bytes, not 6,
  the year counts from 1900, not 2000, and the month is zero-based.
- Document `0x08` as reading the stored WiFi info rather than "WiFi State".
- Reject `,`, `"` and `\` in the WiFi SSID and password instead of sending
  them. The device stores those characters incorrectly and then fails to join
  the network, which looked like a wrong password (#13).
- Reject WiFi passwords shorter than 8 characters, the WPA minimum the device
  requires. Note this rules out shorter WEP keys.
- Fall back to the deprecated `writeValue()` when the command characteristic
  does not implement `writeValueWithoutResponse()`. This fixes
  "writeValueWithoutResponse is not a function" errors on older Web Bluetooth
  implementations such as Bluefy on iOS (#8).
### Security

## [0.1.0] - 2024-01-XX

### Added
- Initial release of @tomquist/hmjs-protocol package
- Initial release of @tomquist/hmjs-ble package
- BLE device manager with Web Bluetooth API support
- Demo application showcasing library usage


[Unreleased]: https://github.com/tomquist/hmjs/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/tomquist/hmjs/releases/tag/v0.1.0