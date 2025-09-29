import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';
import { createToken, verifyToken } from '../utils/jwt';

const router = Router();
const prisma = new PrismaClient();

interface RegisterRequest extends Request {
  body: {
    email: string;
    username: string;
    password: string;
    firstName?: string;
    lastName?: string;
  };
}

interface LoginRequest extends Request {
  body: {
    email: string;
    password: string;
  };
}

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = asyncHandler(async (req: RegisterRequest, res: Response) => {
  const { email, username, password, firstName, lastName } = req.body;

  // Validate input
  if (!email || !username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email, username, and password are required'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 6 characters long'
    });
  }

  // Check if user already exists
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        { username }
      ]
    }
  });

  if (existingUser) {
    return res.status(400).json({
      success: false,
      error: 'User with this email or username already exists'
    });
  }

  // Hash password
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      username,
      password: hashedPassword,
      firstName,
      lastName,
      isActive: true,
      isVerified: false
    },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      isActive: true,
      isVerified: true,
      createdAt: true
    }
  });

  // Generate JWT token
  const token = createToken({ userId: user.id });

  // Create session
  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    }
  });

  return res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user,
      token
    }
  });
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = asyncHandler(async (req: LoginRequest, res: Response) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required'
    });
  }

  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      username: true,
      password: true,
      firstName: true,
      lastName: true,
      isActive: true,
      isVerified: true
    }
  });

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }

  if (!user.isActive) {
    return res.status(401).json({
      success: false,
      error: 'Account is deactivated'
    });
  }

  // Check password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }

  // Generate JWT token
  const token = createToken({ userId: user.id });

  // Delete existing sessions for user and create new one
  await prisma.session.deleteMany({
    where: { userId: user.id }
  });
  
  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    }
  });

  // Remove password from response
  const { password: _, ...userWithoutPassword } = user;

  return res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: userWithoutPassword,
      token
    }
  });
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    // Delete session
    await prisma.session.deleteMany({
      where: { token }
    });
  }

  return res.json({
    success: true,
    message: 'Logout successful'
  });
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      avatar: true,
      isActive: true,
      isVerified: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  return res.json({
    success: true,
    data: { user }
  });
});

// @desc    Refresh token
// @route   POST /api/auth/refresh
// @access  Private
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Token required'
    });
  }

  // Verify current token
  let decoded: any;
  try {
    decoded = verifyToken(token);
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }

  // Check if session exists
  const session = await prisma.session.findFirst({
    where: { token }
  });

  if (!session) {
    return res.status(401).json({
      success: false,
      error: 'Session not found'
    });
  }

  // Generate new token
  const newToken = createToken({ userId: decoded.userId });

  // Update session
  await prisma.session.update({
    where: { id: session.id },
    data: {
      token: newToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    }
  });

  return res.json({
    success: true,
    data: { token: newToken }
  });
});

// Route definitions
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', getMe);
router.post('/refresh', refreshToken);

export default router;
