import { Router, Request, Response } from 'express';

// Extend Request interface to include user property
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import axios from 'axios';
import crypto from 'crypto';

const router = Router();

// Trading Engine Interface
interface TradingConfig {
  binance: {
    apiKey: string;
    secretKey: string;
    enabled: boolean;
  };
  kraken: {
    apiKey: string;
    privateKey: string;
    enabled: boolean;
  };
  coinbase: {
    apiKey: string;
    secret: string;
    passphrase: string;
    enabled: boolean;
  };
}

interface OrderRequest {
  exchange: 'binance' | 'kraken' | 'coinbase';
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity: number;
  price?: number;
}

interface AIStrategyConfig {
  name: string;
  description?: string;
  symbols: string[];
  maxPositionSize: number;
  riskLevel: 'low' | 'medium' | 'high';
  aiModel: string;
  stopLoss: number;
  takeProfit: number;
  rebalanceInterval: number;
  maxDailyTrades: number;
  enableDCA: boolean;
  dcaInterval?: number;
}

// Real Trading API Endpoints

// Place Order
router.post('/orders', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { exchange, symbol, side, type, quantity, price }: OrderRequest = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    // Validate order parameters
    if (!exchange || !symbol || !side || !type || !quantity) {
      return res.status(400).json({
        success: false,
        error: 'Missing required order parameters'
      });
    }

    if (quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Quantity must be greater than 0'
      });
    }

    // Get user's exchange credentials
    const userCredentials = await getUserExchangeCredentials(userId, exchange);
    if (!userCredentials || !userCredentials.enabled) {
      return res.status(400).json({
        success: false,
        error: `${exchange} trading not enabled or credentials not found`
      });
    }

    // Place order on exchange
    let orderResult;
    switch (exchange) {
      case 'binance':
        orderResult = await placeBinanceOrder(userCredentials, symbol, side, type, quantity, price);
        break;
      case 'kraken':
        orderResult = await placeKrakenOrder(userCredentials, symbol, side, type, quantity, price);
        break;
      case 'coinbase':
        orderResult = await placeCoinbaseOrder(userCredentials, symbol, side, type, quantity, price);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Unsupported exchange'
        });
    }

    // Save order to database
    const order = await saveOrderToDatabase(userId, {
      exchange,
      symbol,
      side,
      type,
      quantity,
      price,
      status: 'filled',
      orderId: orderResult.orderId || orderResult.id,
      timestamp: Date.now()
    });

    // Update user portfolio
    await updateUserPortfolio(userId, order);

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        exchange: exchange,
        symbol: symbol,
        side: side,
        type: type,
        quantity: quantity,
        price: price,
        status: 'filled',
        timestamp: Date.now()
      }
    });

  } catch (error: any) {
    console.error('Error placing order:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to place order'
    });
  }
}));

// Get Portfolio
router.get('/portfolio', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const portfolio = await getUserPortfolio(userId);
    const totalValue = calculatePortfolioValue(portfolio);
    const totalPnL = calculateTotalPnL(portfolio);

    res.status(200).json({
      success: true,
      data: {
        totalValue,
        totalPnL,
        positions: portfolio,
        timestamp: Date.now()
      }
    });

  } catch (error: any) {
    console.error('Error fetching portfolio:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch portfolio'
    });
  }
}));

// Get Trading History
router.get('/history', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const history = await getTradingHistory(userId, limit, offset);
    const total = await getTradingHistoryCount(userId);

    res.status(200).json({
      success: true,
      data: {
        history,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      }
    });

  } catch (error: any) {
    console.error('Error fetching trading history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch trading history'
    });
  }
}));

// Create AI Strategy
router.post('/strategies', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const strategyConfig: AIStrategyConfig = req.body;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    // Validate strategy configuration
    if (!strategyConfig.name || !strategyConfig.symbols || strategyConfig.symbols.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required strategy parameters'
      });
    }

    const strategy = await createAIStrategy(userId, strategyConfig);

    res.status(200).json({
      success: true,
      data: strategy
    });

  } catch (error: any) {
    console.error('Error creating AI strategy:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create AI strategy'
    });
  }
}));

// Get AI Strategies
router.get('/strategies', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const strategies = await getUserAIStrategies(userId);

    res.status(200).json({
      success: true,
      data: strategies
    });

  } catch (error: any) {
    console.error('Error fetching AI strategies:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch AI strategies'
    });
  }
}));

// Update AI Strategy
router.put('/strategies/:strategyId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const { strategyId } = req.params;
  const updates = req.body;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const strategy = await updateAIStrategy(userId, strategyId, updates);

    if (!strategy) {
      return res.status(404).json({
        success: false,
        error: 'Strategy not found'
      });
    }

    res.status(200).json({
      success: true,
      data: strategy
    });

  } catch (error: any) {
    console.error('Error updating AI strategy:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update AI strategy'
    });
  }
}));

// Delete AI Strategy
router.delete('/strategies/:strategyId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const { strategyId } = req.params;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const deleted = await deleteAIStrategy(userId, strategyId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Strategy not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Strategy deleted successfully'
    });

  } catch (error: any) {
    console.error('Error deleting AI strategy:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete AI strategy'
    });
  }
}));

// Enable/Disable Trading
router.post('/trading/toggle', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const { enabled } = req.body;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    await setTradingEnabled(userId, enabled);

    res.status(200).json({
      success: true,
      data: {
        enabled,
        timestamp: Date.now()
      }
    });

  } catch (error: any) {
    console.error('Error toggling trading:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to toggle trading'
    });
  }
}));

// Get Exchange Credentials Status
router.get('/exchanges/status', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const exchanges = await getUserExchangeStatus(userId);

    res.status(200).json({
      success: true,
      data: exchanges
    });

  } catch (error: any) {
    console.error('Error fetching exchange status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch exchange status'
    });
  }
}));

// Exchange-specific Order Placement Functions

async function placeBinanceOrder(credentials: any, symbol: string, side: string, type: string, quantity: number, price?: number) {
  const timestamp = Date.now();
  const params: any = {
    symbol: symbol,
    side: side.toUpperCase(),
    type: type.toUpperCase(),
    quantity: quantity.toString(),
    timestamp: timestamp
  };

  if (price && type.toLowerCase() !== 'market') {
    params.price = price.toString();
  }

  // Generate signature
  const signature = crypto
    .createHmac('sha256', credentials.secretKey)
    .update(new URLSearchParams(params).toString())
    .digest('hex');

  params.signature = signature;

  const response = await axios.post('https://api.binance.com/api/v3/order', new URLSearchParams(params), {
    headers: {
      'X-MBX-APIKEY': credentials.apiKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  return response.data;
}

async function placeKrakenOrder(credentials: any, symbol: string, side: string, type: string, quantity: number, price?: number) {
  const nonce = Date.now();
  const params: any = {
    pair: symbol,
    type: side,
    ordertype: type,
    volume: quantity.toString(),
    nonce: nonce.toString()
  };

  if (price && type !== 'market') {
    params.price = price.toString();
  }

  const signature = generateKrakenSignature(credentials.privateKey, params, nonce);

  const response = await axios.post('https://api.kraken.com/0/private/AddOrder', new URLSearchParams(params), {
    headers: {
      'API-Key': credentials.apiKey,
      'API-Sign': signature,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  return response.data;
}

async function placeCoinbaseOrder(credentials: any, symbol: string, side: string, type: string, quantity: number, price?: number) {
  const timestamp = Date.now() / 1000;
  const orderData: any = {
    size: quantity.toString(),
    side: side,
    product_id: symbol,
    type: type
  };

  if (price && type !== 'market') {
    orderData.price = price.toString();
  }

  const signature = generateCoinbaseSignature(credentials.secret, 'POST', '/orders', orderData, timestamp);

  const response = await axios.post('https://api.exchange.coinbase.com/orders', orderData, {
    headers: {
      'CB-ACCESS-KEY': credentials.apiKey,
      'CB-ACCESS-SIGN': signature,
      'CB-ACCESS-TIMESTAMP': timestamp.toString(),
      'CB-ACCESS-PASSPHRASE': credentials.passphrase,
      'Content-Type': 'application/json'
    }
  });

  return response.data;
}

// Signature Generation Functions

function generateKrakenSignature(privateKey: string, params: any, nonce: number): string {
  const queryString = new URLSearchParams(params).toString();
  const message = '/0/private/AddOrder' + crypto.createHash('sha256').update(nonce + queryString).digest('binary');
  
  return crypto
    .createHmac('sha512', Buffer.from(privateKey, 'base64'))
    .update(message, 'binary')
    .digest('base64');
}

function generateCoinbaseSignature(secret: string, method: string, path: string, body: any, timestamp: number): string {
  const message = timestamp + method + path + JSON.stringify(body);
  return crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('base64');
}

// Database Functions (to be implemented with Prisma)

async function getUserExchangeCredentials(userId: string, exchange: string) {
  // This would query the database for user's exchange credentials
  // For now, return mock data
  return {
    apiKey: 'mock_api_key',
    secretKey: 'mock_secret_key',
    enabled: true
  };
}

async function saveOrderToDatabase(userId: string, orderData: any) {
  // This would save the order to the database
  // For now, return mock data
  return {
    id: 'order_' + Date.now(),
    userId,
    ...orderData
  };
}

async function updateUserPortfolio(userId: string, order: any) {
  // This would update the user's portfolio in the database
  console.log(`Updating portfolio for user ${userId} with order:`, order);
}

async function getUserPortfolio(userId: string) {
  // This would fetch the user's portfolio from the database
  // For now, return mock data
  return [
    {
      symbol: 'BTCUSDT',
      quantity: 0.001,
      averagePrice: 114000,
      totalValue: 114.00,
      unrealizedPnL: 5.00
    }
  ];
}

function calculatePortfolioValue(portfolio: any[]) {
  return portfolio.reduce((total, position) => total + position.totalValue, 0);
}

function calculateTotalPnL(portfolio: any[]) {
  return portfolio.reduce((total, position) => total + position.unrealizedPnL, 0);
}

async function getTradingHistory(userId: string, limit: number, offset: number) {
  // This would fetch trading history from the database
  return [];
}

async function getTradingHistoryCount(userId: string) {
  // This would get the total count of trading history
  return 0;
}

async function createAIStrategy(userId: string, config: AIStrategyConfig) {
  // This would create an AI strategy in the database
  return {
    id: 'strategy_' + Date.now(),
    userId,
    ...config,
    status: 'active',
    createdAt: Date.now()
  };
}

async function getUserAIStrategies(userId: string) {
  // This would fetch user's AI strategies from the database
  return [];
}

async function updateAIStrategy(userId: string, strategyId: string, updates: any) {
  // This would update an AI strategy in the database
  return null;
}

async function deleteAIStrategy(userId: string, strategyId: string) {
  // This would delete an AI strategy from the database
  return false;
}

async function setTradingEnabled(userId: string, enabled: boolean) {
  // This would update the user's trading status in the database
  console.log(`Setting trading ${enabled ? 'enabled' : 'disabled'} for user ${userId}`);
}

async function getUserExchangeStatus(userId: string) {
  // This would fetch the user's exchange connection status
  return {
    binance: { enabled: false, connected: false },
    kraken: { enabled: false, connected: false },
    coinbase: { enabled: false, connected: false }
  };
}

export default router;
