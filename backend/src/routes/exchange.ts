import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ExchangeOAuthService } from '../services/ExchangeOAuthService';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();
const prisma = new PrismaClient();
const exchangeOAuthService = new ExchangeOAuthService();

// Get supported exchanges
router.get('/supported', asyncHandler(async (_req: Request, res: Response) => {
  const exchanges = exchangeOAuthService.getSupportedExchanges();
  
  res.json({
    success: true,
    data: { exchanges }
  });
}));

// Get user's exchange connections
router.get('/connections', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  const connections = await prisma.exchangeConnection.findMany({
    where: { userId, isActive: true },
    select: {
      id: true,
      exchangeName: true,
      exchangeId: true,
      permissions: true,
      createdAt: true,
      expiresAt: true,
    }
  });

  res.json({
    success: true,
    data: { connections }
  });
}));

// Initiate OAuth2 flow for exchange
router.post('/connect/:exchange', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const exchange = req.params.exchange;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const authUrl = exchangeOAuthService.generateAuthUrl(exchange, userId);
    
    res.json({
      success: true,
      data: { authUrl }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}));

// Handle OAuth2 callback
router.post('/callback/:exchange', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const exchange = req.params.exchange;
  const { code, state } = req.body;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  if (!code || !state) {
    return res.status(400).json({
      success: false,
      error: 'Missing authorization code or state'
    });
  }

  try {
    const tokens = await exchangeOAuthService.exchangeCodeForTokens(exchange, code, state);
    
    // Get user info from exchange
    const userInfo = await exchangeOAuthService.getExchangeUserInfo(exchange, userId);
    
    // Update exchange connection with user info
    await prisma.exchangeConnection.updateMany({
      where: { userId, exchangeName: exchange },
      data: {
        exchangeId: userInfo.id,
        permissions: userInfo.permissions,
      }
    });

    res.json({
      success: true,
      data: { 
        exchange,
        connected: true,
        userInfo
      }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}));

// Disconnect exchange account
router.delete('/disconnect/:exchange', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const exchange = req.params.exchange;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    await exchangeOAuthService.disconnectExchange(userId, exchange);
    
    res.json({
      success: true,
      data: { exchange, disconnected: true }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}));

// Get account balance from exchange
router.get('/:exchange/balance', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const exchange = req.params.exchange;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const balance = await exchangeOAuthService.getAccountBalance(exchange, userId);
    
    res.json({
      success: true,
      data: { exchange, balance }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}));

// Get account info from exchange
router.get('/:exchange/account', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const exchange = req.params.exchange;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const userInfo = await exchangeOAuthService.getExchangeUserInfo(exchange, userId);
    
    res.json({
      success: true,
      data: { exchange, userInfo }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}));

// Get markets/symbols from exchange
router.get('/:exchange/markets', asyncHandler(async (req: Request, res: Response) => {
  const exchange = req.params.exchange;
  
  try {
    // This would typically fetch from the exchange API
    // For now, return mock data
    const mockMarkets = [
      { symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', status: 'TRADING' },
      { symbol: 'ETH/USDT', base: 'ETH', quote: 'USDT', status: 'TRADING' },
      { symbol: 'BNB/USDT', base: 'BNB', quote: 'USDT', status: 'TRADING' },
      { symbol: 'ADA/USDT', base: 'ADA', quote: 'USDT', status: 'TRADING' },
      { symbol: 'SOL/USDT', base: 'SOL', quote: 'USDT', status: 'TRADING' },
    ];
    
    res.json({
      success: true,
      data: { exchange, markets: mockMarkets }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}));

// Place order on exchange
router.post('/:exchange/orders', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const exchange = req.params.exchange;
  const orderData = req.body;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  // Validate order data
  const { symbol, side, type, quantity, price } = orderData;
  if (!symbol || !side || !type || !quantity) {
    return res.status(400).json({
      success: false,
      error: 'Missing required order parameters'
    });
  }

  try {
    const order = await exchangeOAuthService.placeOrder(exchange, userId, orderData);
    
    // Store order in database
    const dbOrder = await prisma.order.create({
      data: {
        userId,
        exchangeName: exchange,
        exchangeOrderId: order.orderId || order.id,
        symbol,
        side: side.toUpperCase(),
        type: type.toUpperCase(),
        quantity: parseFloat(quantity),
        price: price ? parseFloat(price) : null,
        status: order.status || 'PENDING',
        filledQuantity: 0,
        averagePrice: null,
        exchangeData: order,
      }
    });

    res.json({
      success: true,
      data: { order: dbOrder }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}));

// Get order status
router.get('/:exchange/orders/:orderId', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const exchange = req.params.exchange;
  const orderId = req.params.orderId;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const orderStatus = await exchangeOAuthService.getOrderStatus(exchange, userId, orderId);
    
    // Update order in database if status changed
    const dbOrder = await prisma.order.findFirst({
      where: { userId, exchangeOrderId: orderId }
    });
    
    if (dbOrder) {
      await prisma.order.update({
        where: { id: dbOrder.id },
        data: {
          status: orderStatus.status,
          filledQuantity: orderStatus.executedQty ? parseFloat(orderStatus.executedQty) : dbOrder.filledQuantity,
          averagePrice: orderStatus.price ? parseFloat(orderStatus.price) : dbOrder.averagePrice,
          exchangeData: orderStatus,
        }
      });
    }

    res.json({
      success: true,
      data: { orderId, status: orderStatus }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}));

// Get user's orders from exchange
router.get('/:exchange/orders', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const exchange = req.params.exchange;
  const { limit = 50, offset = 0 } = req.query;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const orders = await prisma.order.findMany({
      where: { userId, exchangeName: exchange },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    res.json({
      success: true,
      data: { orders }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}));

// Cancel order on exchange
router.delete('/:exchange/orders/:orderId', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const exchange = req.params.exchange;
  const orderId = req.params.orderId;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    // Update order status to cancelled in database
    const order = await prisma.order.findFirst({
      where: { userId, exchangeOrderId: orderId }
    });

    if (order) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED' }
      });
    }

    res.json({
      success: true,
      data: { orderId, status: 'CANCELLED' }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}));

// Refresh exchange connection
router.post('/:exchange/refresh', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const exchange = req.params.exchange;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const tokens = await exchangeOAuthService.refreshAccessToken(exchange, userId);
    
    res.json({
      success: true,
      data: { exchange, refreshed: true }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}));

export default router;