import request from 'supertest';
import { app } from '../../index';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Mock Prisma
jest.mock('@prisma/client');
const mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;

// Mock bcrypt
jest.mock('bcryptjs');
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      // Arrange
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null); // User doesn't exist
      mockBcrypt.genSalt.mockResolvedValue('salt' as never);
      mockBcrypt.hash.mockResolvedValue('hashedPassword' as never);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user123',
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      mockPrisma.session.create.mockResolvedValue({
        id: 'session123',
        userId: 'user123',
        token: 'jwt-token',
        expiresAt: new Date(),
      } as any);

      // Act
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('test@example.com');
      expect(response.body.data.token).toBeDefined();
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          username: 'testuser',
          email: 'test@example.com',
          password: 'hashedPassword',
        },
      });
    });

    it('should reject registration with existing email', async () => {
      // Arrange
      const userData = {
        username: 'testuser',
        email: 'existing@example.com',
        password: 'password123',
      };

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: 'existing@example.com',
      } as any);

      // Act
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('User with this email already exists');
    });

    it('should reject registration with missing fields', async () => {
      // Arrange
      const userData = {
        username: 'testuser',
        // Missing email and password
      };

      // Act
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Please enter all fields');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login user with valid credentials', async () => {
      // Arrange
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        email: 'test@example.com',
        username: 'testuser',
        password: 'hashedPassword',
      } as any);
      mockBcrypt.compare.mockResolvedValue(true as never);
      mockPrisma.session.create.mockResolvedValue({
        id: 'session123',
        userId: 'user123',
        token: 'jwt-token',
        expiresAt: new Date(),
      } as any);

      // Act
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('test@example.com');
      expect(response.body.data.token).toBeDefined();
      expect(mockBcrypt.compare).toHaveBeenCalledWith('password123', 'hashedPassword');
    });

    it('should reject login with invalid email', async () => {
      // Arrange
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Act
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should reject login with invalid password', async () => {
      // Arrange
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        email: 'test@example.com',
        password: 'hashedPassword',
      } as any);
      mockBcrypt.compare.mockResolvedValue(false as never);

      // Act
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout user successfully', async () => {
      // Arrange
      const token = 'valid-jwt-token';
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 1 });

      // Act
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .send({ token });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logout successful');
    });

    it('should reject logout without token', async () => {
      // Act
      const response = await request(app)
        .post('/api/auth/logout')
        .send({});

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Token required');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user with valid token', async () => {
      // Arrange
      const token = 'valid-jwt-token';
      const user = {
        id: 'user123',
        username: 'testuser',
        email: 'test@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(user as any);

      // Mock the authenticateToken middleware
      jest.doMock('../../middleware/auth', () => ({
        authenticateToken: (req: any, res: any, next: any) => {
          req.user = { id: 'user123' };
          next();
        },
      }));

      // Act
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('test@example.com');
    });
  });
});
