import { Router, Request, Response } from 'express';
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

// @desc    Get trading performance analytics
// @route   GET /api/analytics/performance
// @access  Private
export const getPerformanceAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { period = '30d', strategyId } = req.query;

  // Calculate date range based on period
  const now = new Date();
  let startDate: Date;
  
  switch (period) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const where: any = {
    userId,
    createdAt: { gte: startDate }
  };

  if (strategyId) {
    where.strategyId = strategyId;
  }

  // Get trades for the period
  const trades = await prisma.trade.findMany({
    where,
    select: {
      id: true,
      symbol: true,
      side: true,
      amount: true,
      price: true,
      fee: true,
      status: true,
      executedAt: true,
      createdAt: true
    },
    orderBy: { createdAt: 'asc' }
  });

  // Calculate performance metrics
  const totalTrades = trades.length;
  const filledTrades = trades.filter(t => t.status === 'FILLED');
  const winningTrades = filledTrades.filter(t => {
    // Simple profit calculation - in real implementation, this would be more complex
    return t.side === 'BUY' ? Number(t.price) > 0 : Number(t.price) > 0;
  });

  const winRate = filledTrades.length > 0 ? (winningTrades.length / filledTrades.length) * 100 : 0;

  // Calculate total profit/loss (simplified)
  const totalProfit = filledTrades.reduce((sum, trade) => {
    const tradeValue = Number(trade.amount) * Number(trade.price);
    const fee = Number(trade.fee);
    return sum + tradeValue - fee;
  }, 0);

  // Calculate daily returns for Sharpe ratio
  const dailyReturns: number[] = [];
  const tradeGroups = new Map<string, any[]>();
  
  filledTrades.forEach(trade => {
    const date = trade.executedAt ? trade.executedAt.toISOString().split('T')[0] : trade.createdAt.toISOString().split('T')[0];
    if (!tradeGroups.has(date)) {
      tradeGroups.set(date, []);
    }
    tradeGroups.get(date)!.push(trade);
  });

  let previousValue = 1000; // Starting value
  tradeGroups.forEach((dayTrades, date) => {
    const dayValue = dayTrades.reduce((sum, trade) => {
      const tradeValue = Number(trade.amount) * Number(trade.price);
      return sum + tradeValue;
    }, previousValue);
    
    const dailyReturn = (dayValue - previousValue) / previousValue;
    dailyReturns.push(dailyReturn);
    previousValue = dayValue;
  });

  // Calculate Sharpe ratio
  const avgReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

  // Calculate maximum drawdown
  let maxDrawdown = 0;
  let peak = 1000;
  let currentValue = 1000;

  filledTrades.forEach(trade => {
    const tradeValue = Number(trade.amount) * Number(trade.price);
    currentValue += tradeValue;
    
    if (currentValue > peak) {
      peak = currentValue;
    }
    
    const drawdown = (peak - currentValue) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  });

  // Get portfolio data
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
  const overallReturn = totalPortfolioCost > 0 ? (totalPortfolioProfit / totalPortfolioCost) * 100 : 0;

  res.json({
    success: true,
    data: {
      period,
      metrics: {
        totalTrades,
        filledTrades: filledTrades.length,
        winRate: Number(winRate.toFixed(2)),
        totalProfit: Number(totalProfit.toFixed(2)),
        sharpeRatio: Number(sharpeRatio.toFixed(4)),
        maxDrawdown: Number((maxDrawdown * 100).toFixed(2)),
        overallReturn: Number(overallReturn.toFixed(2))
      },
      portfolio: {
        totalValue: totalPortfolioValue,
        totalCost: totalPortfolioCost,
        totalProfit: totalPortfolioProfit
      },
      trades: trades.slice(0, 10) // Return recent trades for context
    }
  });
});

// @desc    Get portfolio analytics
// @route   GET /api/analytics/portfolio
// @access  Private
export const getPortfolioAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  const portfolios = await prisma.portfolio.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      totalValue: true,
      totalCost: true,
      totalProfit: true,
      profitMargin: true,
      positions: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: { updatedAt: 'desc' }
  });

  // Calculate overall portfolio metrics
  const totalValue = portfolios.reduce((sum, p) => sum + Number(p.totalValue), 0);
  const totalCost = portfolios.reduce((sum, p) => sum + Number(p.totalCost), 0);
  const totalProfit = portfolios.reduce((sum, p) => sum + Number(p.totalProfit), 0);
  const overallReturn = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

  // Get asset allocation from positions
  const assetAllocation: { [key: string]: number } = {};
  portfolios.forEach(portfolio => {
    if (portfolio.positions && typeof portfolio.positions === 'object') {
      const positions = portfolio.positions as any[];
      positions.forEach((position: any) => {
        if (position.symbol && position.value) {
          const symbol = position.symbol.split('/')[0]; // Get base asset
          assetAllocation[symbol] = (assetAllocation[symbol] || 0) + Number(position.value);
        }
      });
    }
  });

  // Convert to percentage
  const totalAllocation = Object.values(assetAllocation).reduce((sum, val) => sum + val, 0);
  const allocationPercentages = Object.entries(assetAllocation).map(([asset, value]) => ({
    asset,
    value: Number(value.toFixed(2)),
    percentage: totalAllocation > 0 ? Number(((value / totalAllocation) * 100).toFixed(2)) : 0
  }));

  res.json({
    success: true,
    data: {
      portfolios,
      overall: {
        totalValue,
        totalCost,
        totalProfit,
        overallReturn: Number(overallReturn.toFixed(2)),
        portfolioCount: portfolios.length
      },
      assetAllocation: allocationPercentages.sort((a, b) => b.value - a.value)
    }
  });
});

// @desc    Get risk analytics
// @route   GET /api/analytics/risk
// @access  Private
export const getRiskAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  // Get recent trades for risk analysis
  const recentTrades = await prisma.trade.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      amount: true,
      price: true,
      side: true,
      status: true,
      createdAt: true
    }
  });

  const filledTrades = recentTrades.filter(t => t.status === 'FILLED');

  // Calculate position sizes
  const positionSizes = filledTrades.map(trade => Number(trade.amount) * Number(trade.price));
  const avgPositionSize = positionSizes.length > 0 ? positionSizes.reduce((sum, size) => sum + size, 0) / positionSizes.length : 0;
  const maxPositionSize = positionSizes.length > 0 ? Math.max(...positionSizes) : 0;

  // Calculate volatility (simplified)
  const returns: number[] = [];
  for (let i = 1; i < filledTrades.length; i++) {
    const prevValue = Number(filledTrades[i-1].amount) * Number(filledTrades[i-1].price);
    const currValue = Number(filledTrades[i].amount) * Number(filledTrades[i].price);
    const return_pct = (currValue - prevValue) / prevValue;
    returns.push(return_pct);
  }

  const avgReturn = returns.length > 0 ? returns.reduce((sum, ret) => sum + ret, 0) / returns.length : 0;
  const variance = returns.length > 0 ? returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length : 0;
  const volatility = Math.sqrt(variance) * 100; // Annualized volatility (simplified)

  // Calculate Value at Risk (VaR) - 95% confidence
  const sortedReturns = returns.sort((a, b) => a - b);
  const var95Index = Math.floor(sortedReturns.length * 0.05);
  const var95 = sortedReturns.length > 0 ? Math.abs(sortedReturns[var95Index]) * 100 : 0;

  // Get active positions
  const activeSessions = await prisma.tradingSession.findMany({
    where: { userId, status: 'RUNNING' },
    select: {
      id: true,
      strategyId: true,
      startTime: true,
      totalTrades: true,
      totalProfit: true,
      maxDrawdown: true
    }
  });

  res.json({
    success: true,
    data: {
      positionAnalysis: {
        avgPositionSize: Number(avgPositionSize.toFixed(2)),
        maxPositionSize: Number(maxPositionSize.toFixed(2)),
        totalTrades: filledTrades.length
      },
      volatility: {
        annualized: Number(volatility.toFixed(2)),
        avgReturn: Number((avgReturn * 100).toFixed(4))
      },
      riskMetrics: {
        var95: Number(var95.toFixed(2)),
        maxDrawdown: activeSessions.length > 0 ? Math.max(...activeSessions.map(s => Number(s.maxDrawdown))) : 0
      },
      activeExposure: {
        activeSessions: activeSessions.length,
        totalActiveTrades: activeSessions.reduce((sum, s) => sum + s.totalTrades, 0),
        activeProfit: activeSessions.reduce((sum, s) => sum + Number(s.totalProfit), 0)
      }
    }
  });
});

// @desc    Get market data analytics
// @route   GET /api/analytics/market
// @access  Private
export const getMarketAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { symbol, timeframe = '1h' } = req.query;

  // TODO: Implement actual market data fetching
  // For now, return mock market data
  const mockMarketData = {
    symbol: symbol || 'BTC/USDT',
    timeframe,
    currentPrice: 45000,
    change24h: 2.5,
    volume24h: 1500000000,
    marketCap: 850000000000,
    technicalIndicators: {
      rsi: 65.4,
      macd: 120.5,
      bollingerBands: {
        upper: 46000,
        middle: 45000,
        lower: 44000
      }
    },
    sentiment: {
      score: 0.7,
      sources: ['twitter', 'reddit', 'news'],
      lastUpdated: new Date().toISOString()
    }
  };

  res.json({
    success: true,
    data: mockMarketData
  });
});

// Route definitions
router.get('/performance', getPerformanceAnalytics);
router.get('/portfolio', getPortfolioAnalytics);
router.get('/risk', getRiskAnalytics);
router.get('/market', getMarketAnalytics);

export default router;
