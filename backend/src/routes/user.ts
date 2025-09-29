import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();
const prisma = new PrismaClient();

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
  };
}

// @desc    Get user profile
// @route   GET /api/user/profile
// @access  Private
export const getProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

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
      updatedAt: true,
      exchangeConnections: {
        select: {
          id: true,
          exchangeName: true,
          isActive: true,
          createdAt: true
        }
      },
      portfolios: {
        select: {
          id: true,
          name: true,
          totalValue: true,
          totalCost: true,
          totalProfit: true,
          profitMargin: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  res.json({
    success: true,
    data: { user }
  });
});

// @desc    Update user profile
// @route   PUT /api/user/profile
// @access  Private
export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { firstName, lastName, avatar } = req.body;

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(avatar && { avatar })
    },
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

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: { user }
  });
});

// @desc    Change password
// @route   PUT /api/user/password
// @access  Private
export const changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      error: 'Current password and new password are required'
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'New password must be at least 6 characters long'
    });
  }

  // Get current user with password
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true }
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    return res.status(400).json({
      success: false,
      error: 'Current password is incorrect'
    });
  }

  // Hash new password
  const saltRounds = 12;
  const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

  // Update password
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedNewPassword }
  });

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
});

// @desc    Get user statistics
// @route   GET /api/user/stats
// @access  Private
export const getUserStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  // Get user's trading statistics
  const [
    totalTrades,
    totalPortfolios,
    totalExchangeConnections,
    recentTrades
  ] = await Promise.all([
    prisma.trade.count({
      where: { userId }
    }),
    prisma.portfolio.count({
      where: { userId }
    }),
    prisma.exchangeConnection.count({
      where: { userId, isActive: true }
    }),
    prisma.trade.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        symbol: true,
        side: true,
        amount: true,
        price: true,
        status: true,
        createdAt: true
      }
    })
  ]);

  // Calculate portfolio performance
  const portfolios = await prisma.portfolio.findMany({
    where: { userId },
    select: {
      totalValue: true,
      totalCost: true,
      totalProfit: true,
      profitMargin: true
    }
  });

  const totalPortfolioValue = portfolios.reduce((sum, p) => sum + Number(p.totalValue), 0);
  const totalPortfolioCost = portfolios.reduce((sum, p) => sum + Number(p.totalCost), 0);
  const totalPortfolioProfit = portfolios.reduce((sum, p) => sum + Number(p.totalProfit), 0);
  const overallProfitMargin = totalPortfolioCost > 0 ? (totalPortfolioProfit / totalPortfolioCost) * 100 : 0;

  res.json({
    success: true,
    data: {
      totalTrades,
      totalPortfolios,
      totalExchangeConnections,
      totalPortfolioValue,
      totalPortfolioCost,
      totalPortfolioProfit,
      overallProfitMargin,
      recentTrades
    }
  });
});

// @desc    Delete user account
// @route   DELETE /api/user/account
// @access  Private
export const deleteAccount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({
      success: false,
      error: 'Password is required to delete account'
    });
  }

  // Verify password
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true }
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return res.status(400).json({
      success: false,
      error: 'Password is incorrect'
    });
  }

  // Delete user (cascade will handle related records)
  await prisma.user.delete({
    where: { id: userId }
  });

  res.json({
    success: true,
    message: 'Account deleted successfully'
  });
});

// Route definitions
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.put('/password', changePassword);
router.get('/stats', getUserStats);
router.delete('/account', deleteAccount);

export default router;
