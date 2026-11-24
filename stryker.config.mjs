import path from 'node:path';

const output = process.env.MODEL_TEST_REPORT_DIR ?? 'reports/model-testing/mutation';
const config = {
  mutate: process.env.MODEL_TEST_MUTATE
    ? [process.env.MODEL_TEST_MUTATE]
    : ['src/model/**/*.ts', 'src/data/cruiseRepository.ts'],
  testRunner: 'jest',
  jest: { configFile: 'jest.model.config.js' },
  coverageAnalysis: 'perTest',
  concurrency: 2,
  timeoutMS: 5000,
  reporters: ['clear-text', 'html', 'json', 'event-recorder'],
  htmlReporter: { fileName: path.join(output, 'mutation.html') },
  jsonReporter: { fileName: path.join(output, 'mutation.json') },
  eventReporter: { baseDir: path.join(output, 'events') },
  thresholds: { high: 80, low: 60, break: 0 },
  tempDirName: process.env.MODEL_TEST_TEMP_DIR ?? '.model-testing/stryker-tmp',
  ignorePatterns: ['.model-testing', 'reports', 'out', '.next'],
};

export default config;
