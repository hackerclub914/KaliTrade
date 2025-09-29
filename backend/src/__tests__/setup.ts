import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock Prisma for testing
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    exchangeConnection: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    order: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    trade: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    oauthState: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    $disconnect: jest.fn(),
  })),
}));

// Mock external services
jest.mock('../services/ExchangeOAuthService');
jest.mock('../services/RealTimeMarketDataService');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/kalitrade_test';
process.env.REDIS_URL = 'redis://localhost:6379';

// Global test setup
beforeAll(async () => {
  // Setup test database if needed
});

afterAll(async () => {
  // Cleanup test database if needed
});

// Global test teardown
afterEach(() => {
  jest.clearAllMocks();
});
