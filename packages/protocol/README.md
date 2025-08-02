# @tomquist/hmjs-protocol

Core protocol implementation for HM device communication.

## Installation

This package is published to GitHub Packages. You need to configure npm to use GitHub Packages for the `@tomquist` scope:

```bash
# One-time setup: Configure npm registry for @tomquist packages
echo "@tomquist:registry=https://npm.pkg.github.com" >> ~/.npmrc

# Then install the package
npm install @tomquist/hmjs-protocol
```

Alternatively, you can create a `.npmrc` file in your project root:

```
@tomquist:registry=https://npm.pkg.github.com
```

## Description

This package provides the core protocol implementation for communicating with Hame battery management systems. It handles the low-level protocol details including:

- Message encoding and decoding
- Command structures
- Data parsing and validation
- Protocol constants and types

## Usage

```typescript
import { HMDeviceProtocol } from '@tomquist/hmjs-protocol';

const protocol = new HMDeviceProtocol();

// The protocol is typically used through a transport layer
// such as @tomquist/hmjs-ble rather than directly
```

## Features

- TypeScript support with full type definitions
- Comprehensive protocol implementation
- Message validation and error handling
- Support for all HM device commands and responses

## API Documentation

The protocol package exports the main `HMDeviceProtocol` class along with TypeScript interfaces and types for all supported device operations.

## Package Information

- **Registry**: GitHub Packages
- **Scope**: `@tomquist`
- **Package URL**: https://github.com/tomquist/hmjs/packages

## License

MIT