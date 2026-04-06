module.exports = {
  testEnvironment: "jsdom",        // required for React DOM testing
  roots: ["<rootDir>/tests/lib/p5"], // only look inside your p5 wrapper folder
  transform: {
    "^.+\\.(js|jsx)$": "babel-jest",
  },
  setupFilesAfterEnv: ["@testing-library/jest-dom"],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
    // optional: style stubs if you ever import CSS in components
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    // mocks p5 in tests as we don't have the need to test p5 functionality; only that it is loaded.
    '^p5$': '<rootDir>/tests/__mocks__/p5.js',
  },
  moduleDirectories: ['node_modules', '<rootDir>'],
};
