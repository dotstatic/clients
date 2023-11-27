const { pathsToModuleNameMapper } = require("ts-jest");

const { compilerOptions } = require("../shared/tsconfig.libs");

const sharedConfig = require("../shared/jest.config.ts");

/** @type {import('jest').Config} */
module.exports = {
  ...sharedConfig,
  displayName: "libs/common tests",
  preset: "ts-jest",
  testEnvironment: "<rootDir>/spec/fix-jsdom-missing-fetch.ts",
  setupFilesAfterEnv: ["<rootDir>/test.setup.ts"],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions?.paths || {}, {
    prefix: "<rootDir>/",
  }),
};
