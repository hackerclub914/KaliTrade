import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AdvancedOrderService } from '../services/AdvancedOrderService';
import { PortfolioService } from '../services/PortfolioService';
import { ExchangeOAuthService } from '../services/ExchangeOAuthService';
import { RealTimeMarketDataService } from '../services/RealTimeMarketDataService';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();
const prisma = new PrismaClient();

// Initialize services
const exchangeOAuthService = new ExchangeOAuthService();
const marketDataService = new RealTimeMarketDataService(null as any, prisma);
const advancedOrderService = new AdvancedOrderService(prisma, exchangeOAuthService, marketDataService);
const portfolioService = new PortfolioService(prisma, exchangeOAuthService, marketDataService);

// Get portfolio summary
router.get('/portfolio', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const portfolio = await portfolioService.getPortfolioSummary(userId);
    
    res.json({
      success: true,
      data: { portfolio }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get portfolio'
    });
  }
}));

// Get portfolio allocation
router.get('/portfolio/allocation', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const allocation = await portfolioService.getPortfolioAllocation(userId);
    
    res.json({
      success: true,
      data: { allocation }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get portfolio allocation'
    });
  }
}));

// Get portfolio performance
router.get('/portfolio/performance', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const { period = '30D' } = req.query;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const performance = await portfolioService.getPortfolioPerformance(userId, period as any);
    
    res.json({
      success: true,
      data: { performance }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get portfolio performance'
    });
  }
}));

// Get portfolio risk metrics
router.get('/portfolio/risk', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const riskMetrics = await portfolioService.getPortfolioRiskMetrics(userId);
    
    res.json({
      success: true,
      data: { riskMetrics }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get portfolio risk metrics'
    });
  }
}));

// Place advanced order
router.post('/orders/advanced', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const orderRequest = req.body;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  // Validate required fields
  const { exchangeName, symbol, side, type, quantity } = orderRequest;
  if (!exchangeName || !symbol || !side || !type || !quantity) {
    return res.status(400).json({
      success: false,
      error: 'Missing required order parameters'
    });
  }

  try {
    const result = await advancedOrderService.placeOrder({
      userId,
      ...orderRequest
    }, orderRequest.config);

    if (result.success) {
      res.json({
        success: true,
        data: { 
          orderId: result.orderId,
          orders: result.orders
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to place order'
    });
  }
}));

// Get order history
router.get('/orders', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const { 
    exchangeName, 
    symbol, 
    status, 
    startDate, 
    endDate, 
    limit = '50', 
    offset = '0' 
  } = req.query;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const filters: any = {};
    
    if (exchangeName) filters.exchangeName = exchangeName;
    if (symbol) filters.symbol = symbol;
    if (status) filters.status = status;
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);
    filters.limit = parseInt(limit as string);
    filters.offset = parseInt(offset as string);

    const orders = await advancedOrderService.getOrderHistory(userId, filters);
    
    res.json({
      success: true,
      data: { orders }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get order history'
    });
  }
}));

// Get specific order
router.get('/orders/:orderId', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const orderId = req.params.orderId;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Update order status from exchange
    await advancedOrderService.updateOrderStatus(userId, orderId);
    
    // Get updated order
    const updatedOrder = await prisma.order.findFirst({
      where: { id: orderId, userId }
    });

    res.json({
      success: true,
      data: { order: updatedOrder }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get order'
    });
  }
}));

// Cancel order
router.delete('/orders/:orderId', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const orderId = req.params.orderId;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const result = await advancedOrderService.cancelOrder(userId, orderId);
    
    if (result.success) {
      res.json({
        success: true,
        data: { message: 'Order cancelled successfully' }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to cancel order'
    });
  }
}));

// Get order statistics
router.get('/orders/statistics', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const { startDate, endDate } = req.query;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const period = startDate && endDate ? {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    } : undefined;

    const statistics = await advancedOrderService.getOrderStatistics(userId, period);
    
    res.json({
      success: true,
      data: { statistics }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get order statistics'
    });
  }
}));

// Rebalance portfolio
router.post('/portfolio/rebalance', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const { targetAllocation } = req.body;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  if (!targetAllocation || typeof targetAllocation !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'Invalid target allocation provided'
    });
  }

  try {
    const result = await portfolioService.rebalancePortfolio(userId, targetAllocation);
    
    if (result.success) {
      res.json({
        success: true,
        data: { 
          message: 'Portfolio rebalancing calculated',
          orders: result.orders
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to calculate portfolio rebalancing'
      });
    }
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to rebalance portfolio'
    });
  }
}));

// Get market data
router.get('/market-data/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const symbol = req.params.symbol;
  
  try {
    const marketData = await marketDataService.getLatestMarketData([symbol]);
    
    if (marketData.length > 0) {
      res.json({
        success: true,
        data: { marketData: marketData[0] }
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Market data not found for symbol'
      });
    }
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get market data'
    });
  }
}));

// Get order book
router.get('/market-data/:symbol/orderbook', asyncHandler(async (req: Request, res: Response) => {
  const symbol = req.params.symbol;
  const { limit = '20' } = req.query;
  
  try {
    // Simulate order book data since we don't have real-time order book
    const orderBook = {
      symbol: symbol,
      bids: [[50000, 0.5], [49999, 1.2], [49998, 0.8]],
      asks: [[50001, 0.3], [50002, 0.7], [50003, 1.1]],
      timestamp: Date.now()
    };
    
    if (orderBook) {
      res.json({
        success: true,
        data: { orderBook }
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Order book not found for symbol'
      });
    }
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get order book'
    });
  }
}));

// Get recent trades
router.get('/market-data/:symbol/trades', asyncHandler(async (req: Request, res: Response) => {
  const symbol = req.params.symbol;
  const { limit = '100' } = req.query;
  
  try {
    // Simulate recent trades data
    const trades = [
      { symbol, price: 50000, quantity: 0.1, side: 'buy', timestamp: Date.now() - 1000 },
      { symbol, price: 49999, quantity: 0.2, side: 'sell', timestamp: Date.now() - 2000 },
      { symbol, price: 50001, quantity: 0.15, side: 'buy', timestamp: Date.now() - 3000 }
    ];
    
    res.json({
      success: true,
      data: { trades }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get recent trades'
    });
  }
}));

// Get supported symbols
router.get('/symbols', asyncHandler(async (_req: Request, res: Response) => {
  try {
    // This would typically fetch from exchange APIs
    const symbols = [
      'BTC/USDT',
      'ETH/USDT',
      'BNB/USDT',
      'ADA/USDT',
      'SOL/USDT',
      'XRP/USDT',
      'DOT/USDT',
      'MATIC/USDT',
      'AVAX/USDT',
      'LINK/USDT',
      'UNI/USDT',
      'LTC/USDT',
      'ATOM/USDT',
      'FTM/USDT',
      'ALGO/USDT',
    ];
    
    res.json({
      success: true,
      data: { symbols }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get supported symbols'
    });
  }
}));

// Get trading pairs
router.get('/pairs', asyncHandler(async (req: Request, res: Response) => {
  const { exchange = 'binance' } = req.query;
  
  try {
    // This would typically fetch from the specified exchange
    const pairs = [
      { symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', status: 'TRADING', minQuantity: 0.00001 },
      { symbol: 'ETH/USDT', base: 'ETH', quote: 'USDT', status: 'TRADING', minQuantity: 0.0001 },
      { symbol: 'BNB/USDT', base: 'BNB', quote: 'USDT', status: 'TRADING', minQuantity: 0.001 },
      { symbol: 'ADA/USDT', base: 'ADA', quote: 'USDT', status: 'TRADING', minQuantity: 1 },
      { symbol: 'SOL/USDT', base: 'SOL', quote: 'USDT', status: 'TRADING', minQuantity: 0.01 },
    ];
    
    res.json({
      success: true,
      data: { pairs }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get trading pairs'
    });
  }
}));

// Get trading fees
router.get('/fees', asyncHandler(async (req: Request, res: Response) => {
  const { exchange = 'binance' } = req.query;
  
  try {
    // This would typically fetch from the exchange API
    const fees = {
      maker: 0.001, // 0.1%
      taker: 0.001, // 0.1%
      withdrawal: {
        BTC: 0.0005,
        ETH: 0.01,
        USDT: 1.0,
      }
    };
    
    res.json({
      success: true,
      data: { fees }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get trading fees'
    });
  }
}));

export default router;