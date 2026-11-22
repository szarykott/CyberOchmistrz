// eslint-disable-next-line @typescript-eslint/no-require-imports -- Reuse the existing CommonJS Jest configuration.
const base = require('./jest.config');

module.exports = {
  ...base,
  testPathIgnorePatterns: ['/node_modules/', '/test/cruiseUi.test.tsx'],
};
