export default {
  displayName: 'ble',
  preset: '../../jest.preset.js',
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { 
      tsconfig: '<rootDir>/tsconfig.json',
      useESM: true
    }]
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/packages/ble',
  moduleNameMapper: {
    '^@tomquist/hmjs-protocol$': '<rootDir>/../protocol/src/index.ts',
    '^@tomquist/hmjs-protocol/(.*)$': '<rootDir>/../protocol/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
};