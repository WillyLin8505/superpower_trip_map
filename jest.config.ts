import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.{ts,tsx}'],
  moduleNameMapper: {
    // Stub the Anthropic SDK so ItineraryClient tests that don't mock AiRearrangeInput
    // can still load without TextEncoder / ESM errors in Node/jsdom test environments.
    '^@anthropic-ai/sdk$': '<rootDir>/__stubs__/anthropic-sdk.js',
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
}

export default createJestConfig(config)
