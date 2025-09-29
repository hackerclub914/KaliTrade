import { AdvancedOrderService } from '../../services/AdvancedOrderService';
import { PrismaClient } from '@prisma/client';
import { ExchangeOAuthService } from '../../services/ExchangeOAuthService';
import { RealTimeMarketDataService } from '../../services/RealTimeMarketDataService';

// Mock dependencies
jest.mock('@prisma/client');
jest.mock('../../services/ExchangeOAuthService');
jest.mock('../../services/RealTimeMarketDataService');

describe('AdvancedOrderService', () => {
  let orderService: AdvancedOrderService;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockExchangeOAuth: jest.Mocked<ExchangeOAuthService>;
  let mockMarketData: jest.Mocked<RealTimeMarketDataService>;

  beforeEach(() => {
    mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    mockExchangeOAuth = new ExchangeOAuthService() as jest.Mocked<ExchangeOAuthService>;
    mockMarketData = new RealTimeMarketDataService(null as any, mockPrisma) as jest.Mocked<RealTimeMarketDataService>;
    
    orderService = new AdvancedOrderService(mockPrisma, mockExchangeOAuth, mockMarketData);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('placeOrder', () => {
    it('should place a basic market order successfully', async () => {
      // Arrange
      const orderRequest = {
        userId: 'user123',
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        side: 'BUY' as const,
        type: 'MARKET' as const,
        quantity: 0.001,
      };

      mockPrisma.exchangeConnection.findFirst.mockResolvedValue({
        id: 'conn123',
        userId: 'user123',
        exchangeName: 'binance',
        isActive: true,
      } as any);

      mockMarketData.getLatestMarketData.mockResolvedValue([
        { symbol: 'BTC/USDT', price: 45000, volume: 1000, change: 100, changePercent: 0.5, high24h: 46000, low24h: 44000, timestamp: Date.now() }
      ]);

      mockExchangeOAuth.placeOrder.mockResolvedValue({
        orderId: 'order123',
        status: 'PENDING',
      });

      mockPrisma.order.create.mockResolvedValue({
        id: 'db-order123',
        userId: 'user123',
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        side: 'BUY',
        type: 'MARKET',
        quantity: 0.001,
        status: 'PENDING',
      } as any);

      // Act
      const result = await orderService.placeOrder(orderRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.orderId).toBe('db-order123');
      expect(mockExchangeOAuth.placeOrder).toHaveBeenCalledWith(
        'binance',
        'user123',
        expect.objectContaining({
          symbol: 'BTC/USDT',
          side: 'BUY',
          type: 'MARKET',
          quantity: 0.001,
        })
      );
    });

    it('should reject order when user has no active exchange connection', async () => {
      // Arrange
      const orderRequest = {
        userId: 'user123',
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        side: 'BUY' as const,
        type: 'MARKET' as const,
        quantity: 0.001,
      };

      mockPrisma.exchangeConnection.findFirst.mockResolvedValue(null);

      // Act
      const result = await orderService.placeOrder(orderRequest);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('No active connection to exchange');
    });

    it('should reject order with invalid quantity', async () => {
      // Arrange
      const orderRequest = {
        userId: 'user123',
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        side: 'BUY' as const,
        type: 'MARKET' as const,
        quantity: -0.001, // Invalid negative quantity
      };

      // Act
      const result = await orderService.placeOrder(orderRequest);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Quantity must be greater than 0');
    });

    it('should place order with advanced configuration (stop-loss and take-profit)', async () => {
      // Arrange
      const orderRequest = {
        userId: 'user123',
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        side: 'BUY' as const,
        type: 'LIMIT' as const,
        quantity: 0.001,
        price: 45000,
      };

      const advancedConfig = {
        stopLoss: {
          enabled: true,
          price: 43000,
        },
        takeProfit: {
          enabled: true,
          price: 47000,
        },
      };

      mockPrisma.exchangeConnection.findFirst.mockResolvedValue({
        id: 'conn123',
        userId: 'user123',
        exchangeName: 'binance',
        isActive: true,
      } as any);

      mockMarketData.getLatestMarketData.mockResolvedValue([
        { symbol: 'BTC/USDT', price: 45000, volume: 1000, change: 100, changePercent: 0.5, high24h: 46000, low24h: 44000, timestamp: Date.now() }
      ]);

      mockExchangeOAuth.placeOrder
        .mockResolvedValueOnce({ orderId: 'main-order123', status: 'PENDING' }) // Main order
        .mockResolvedValueOnce({ orderId: 'stop-order123', status: 'PENDING' }) // Stop-loss order
        .mockResolvedValueOnce({ orderId: 'profit-order123', status: 'PENDING' }); // Take-profit order

      mockPrisma.order.create
        .mockResolvedValueOnce({ id: 'main-db-order123' } as any) // Main order
        .mockResolvedValueOnce({ id: 'stop-db-order123' } as any) // Stop-loss order
        .mockResolvedValueOnce({ id: 'profit-db-order123' } as any); // Take-profit order

      // Act
      const result = await orderService.placeOrder(orderRequest, advancedConfig);

      // Assert
      expect(result.success).toBe(true);
      expect(result.orders).toHaveLength(3); // Main order + stop-loss + take-profit
      expect(mockExchangeOAuth.placeOrder).toHaveBeenCalledTimes(3);
    });
  });

  describe('cancelOrder', () => {
    it('should cancel order successfully', async () => {
      // Arrange
      const userId = 'user123';
      const orderId = 'order123';

      mockPrisma.order.findFirst.mockResolvedValue({
        id: orderId,
        userId,
        exchangeName: 'binance',
        exchangeOrderId: 'exchange-order123',
        symbol: 'BTC/USDT',
      } as any);

      mockPrisma.order.update.mockResolvedValue({
        id: orderId,
        status: 'CANCELLED',
      } as any);

      // Act
      const result = await orderService.cancelOrder(userId, orderId);

      // Assert
      expect(result.success).toBe(true);
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });
    });

    it('should return error when order not found', async () => {
      // Arrange
      const userId = 'user123';
      const orderId = 'nonexistent-order';

      mockPrisma.order.findFirst.mockResolvedValue(null);

      // Act
      const result = await orderService.cancelOrder(userId, orderId);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Order not found');
    });
  });

  describe('getOrderHistory', () => {
    it('should return order history with filters', async () => {
      // Arrange
      const userId = 'user123';
      const filters = {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        limit: 10,
        offset: 0,
      };

      const mockOrders = [
        {
          id: 'order1',
          userId: 'user123',
          exchangeName: 'binance',
          symbol: 'BTC/USDT',
          side: 'BUY',
          status: 'FILLED',
        },
        {
          id: 'order2',
          userId: 'user123',
          exchangeName: 'binance',
          symbol: 'BTC/USDT',
          side: 'SELL',
          status: 'FILLED',
        },
      ];

      mockPrisma.order.findMany.mockResolvedValue(mockOrders as any);

      // Act
      const result = await orderService.getOrderHistory(userId, filters);

      // Assert
      expect(result).toHaveLength(2);
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user123',
          exchangeName: 'binance',
          symbol: 'BTC/USDT',
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        skip: 0,
      });
    });
  });

  describe('getOrderStatistics', () => {
    it('should calculate order statistics correctly', async () => {
      // Arrange
      const userId = 'user123';
      const mockOrders = [
        { side: 'BUY', status: 'FILLED', quantity: 0.001, price: 45000, filledQuantity: 0.001, averagePrice: 45000 },
        { side: 'SELL', status: 'FILLED', quantity: 0.001, price: 46000, filledQuantity: 0.001, averagePrice: 46000 },
        { side: 'BUY', status: 'CANCELLED', quantity: 0.002, price: 44000, filledQuantity: 0, averagePrice: null },
      ];

      mockPrisma.order.findMany.mockResolvedValue(mockOrders as any);

      // Act
      const result = await orderService.getOrderStatistics(userId);

      // Assert
      expect(result.totalOrders).toBe(3);
      expect(result.filledOrders).toBe(2);
      expect(result.cancelledOrders).toBe(1);
      expect(result.buyOrders).toBe(2);
      expect(result.sellOrders).toBe(1);
      expect(result.totalVolume).toBe(0.002); // Sum of filled quantities
      expect(result.averageOrderSize).toBeCloseTo(0.00133, 5); // Average of all quantities
    });
  });
});
