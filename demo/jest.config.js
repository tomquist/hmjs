export default {
  displayName: 'demo',
  preset: '../jest.preset.js',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.(spec|test).+(ts|tsx|js|jsx)'],
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
      useESM: true,
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'html'],
  coverageDirectory: '../coverage/packages/demo',
  moduleNameMapper: {
    '^@tomquist/hmjs-protocol$': '<rootDir>/../packages/protocol/src/index.ts',
    '^@tomquist/hmjs-protocol/(.*)$': '<rootDir>/../packages/protocol/src/$1',
    '^@tomquist/hmjs-ble$': '<rootDir>/../packages/ble/src/index.ts',
    '^@tomquist/hmjs-ble/(.*)$': '<rootDir>/../packages/ble/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
