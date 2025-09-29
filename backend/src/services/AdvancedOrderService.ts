import { PrismaClient, TradeSide, TradeType } from '@prisma/client';
import { ExchangeOAuthService } from './ExchangeOAuthService';
import { RealTimeMarketDataService } from './RealTimeMarketDataService';

interface OrderRequest {
  userId: string;
  exchangeName: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT' | 'TAKE_PROFIT' | 'TAKE_PROFIT_LIMIT';
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  reduceOnly?: boolean;
  postOnly?: boolean;
}

interface AdvancedOrderConfig {
  stopLoss?: {
    enabled: boolean;
    price: number;
    percentage?: number;
  };
  takeProfit?: {
    enabled: boolean;
    price: number;
    percentage?: number;
  };
  trailingStop?: {
    enabled: boolean;
    distance: number;
    percentage?: boolean;
  };
  dcaConfig?: {
    enabled: boolean;
    levels: number;
    stepSize: number;
    stepPercentage?: number;
  };
}

interface OrderExecutionResult {
  success: boolean;
  orderId?: string;
  error?: string;
  orders?: any[];
}

export class AdvancedOrderService {
  private prisma: PrismaClient;
  private exchangeOAuthService: ExchangeOAuthService;
  private marketDataService: RealTimeMarketDataService;

  constructor(
    prisma: PrismaClient,
    exchangeOAuthService: ExchangeOAuthService,
    marketDataService: RealTimeMarketDataService
  ) {
    this.prisma = prisma;
    this.exchangeOAuthService = exchangeOAuthService;
    this.marketDataService = marketDataService;
  }

  /**
   * Place a basic order with advanced configuration
   */
  async placeOrder(orderRequest: OrderRequest, config?: AdvancedOrderConfig): Promise<OrderExecutionResult> {
    try {
      const { userId, exchangeName, symbol, side, type, quantity, price, stopPrice } = orderRequest;

      // Validate order request
      const validation = await this.validateOrder(orderRequest);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Get current market price for market orders
      let executionPrice = price;
      if (type === 'MARKET') {
        const marketData = await this.marketDataService.getLatestMarketData([symbol]);
        if (marketData.length > 0) {
          executionPrice = marketData[0].price;
        }
      }

      // Place the main order
      const mainOrder = await this.exchangeOAuthService.placeOrder(exchangeName, userId, {
        symbol,
        side,
        type,
        quantity,
        price: executionPrice,
        stopPrice,
        timeInForce: orderRequest.timeInForce || 'GTC',
        reduceOnly: orderRequest.reduceOnly || false,
        postOnly: orderRequest.postOnly || false,
      });

      // Store order in database
      const dbOrder = await this.prisma.order.create({
        data: {
          userId,
          exchangeName,
          exchangeOrderId: mainOrder.orderId || mainOrder.id,
          symbol,
          side: side.toUpperCase() as TradeSide,
          type: type.toUpperCase() as TradeType,
          quantity,
          price: executionPrice,
          status: 'PENDING',
          filledQuantity: 0,
          averagePrice: null,
          exchangeData: mainOrder,
          config: (config || {}) as any,
        },
      });

      // Place advanced orders if configured
      const advancedOrders = await this.placeAdvancedOrders(userId, exchangeName, symbol, side, quantity, config);

      return {
        success: true,
        orderId: dbOrder.id,
        orders: [dbOrder, ...advancedOrders],
      };
    } catch (error: any) {
      console.error('Error placing order:', error);
      return {
        success: false,
        error: error.message || 'Failed to place order',
      };
    }
  }

  /**
   * Place advanced orders (stop-loss, take-profit, etc.)
   */
  private async placeAdvancedOrders(
    userId: string,
    exchangeName: string,
    symbol: string,
    side: string,
    quantity: number,
    config?: AdvancedOrderConfig
  ): Promise<any[]> {
    const advancedOrders: any[] = [];

    try {
      // Place stop-loss order if configured
      if (config?.stopLoss?.enabled) {
        const stopLossOrder = await this.placeStopLossOrder(
          userId,
          exchangeName,
          symbol,
          side,
          quantity,
          config.stopLoss
        );
        if (stopLossOrder) advancedOrders.push(stopLossOrder);
      }

      // Place take-profit order if configured
      if (config?.takeProfit?.enabled) {
        const takeProfitOrder = await this.placeTakeProfitOrder(
          userId,
          exchangeName,
          symbol,
          side,
          quantity,
          config.takeProfit
        );
        if (takeProfitOrder) advancedOrders.push(takeProfitOrder);
      }

      // Place trailing stop order if configured
      if (config?.trailingStop?.enabled) {
        const trailingStopOrder = await this.placeTrailingStopOrder(
          userId,
          exchangeName,
          symbol,
          side,
          quantity,
          config.trailingStop
        );
        if (trailingStopOrder) advancedOrders.push(trailingStopOrder);
      }

      // Place DCA orders if configured
      if (config?.dcaConfig?.enabled) {
        const dcaOrders = await this.placeDCAOrders(
          userId,
          exchangeName,
          symbol,
          side,
          quantity,
          config.dcaConfig
        );
        advancedOrders.push(...dcaOrders);
      }
    } catch (error) {
      console.error('Error placing advanced orders:', error);
    }

    return advancedOrders;
  }

  /**
   * Place stop-loss order
   */
  private async placeStopLossOrder(
    userId: string,
    exchangeName: string,
    symbol: string,
    side: string,
    quantity: number,
    stopLossConfig: { price: number; percentage?: number }
  ): Promise<any | null> {
    try {
      const stopLossSide = side === 'BUY' ? 'SELL' : 'BUY';
      const stopLossPrice = stopLossConfig.price;

      const stopLossOrder = await this.exchangeOAuthService.placeOrder(exchangeName, userId, {
        symbol,
        side: stopLossSide,
        type: 'STOP_LIMIT',
        quantity,
        price: stopLossPrice,
        stopPrice: stopLossPrice,
        timeInForce: 'GTC',
      });

      // Store in database
      const dbOrder = await this.prisma.order.create({
        data: {
          userId,
          exchangeName,
          exchangeOrderId: stopLossOrder.orderId || stopLossOrder.id,
          symbol,
          side: stopLossSide.toUpperCase() as TradeSide,
          type: 'STOP_LIMIT',
          quantity,
          price: stopLossPrice,
          status: 'PENDING',
          filledQuantity: 0,
          averagePrice: null,
          exchangeData: stopLossOrder,
          config: { type: 'stop_loss', config: stopLossConfig } as any,
        },
      });

      return dbOrder;
    } catch (error) {
      console.error('Error placing stop-loss order:', error);
      return null;
    }
  }

  /**
   * Place take-profit order
   */
  private async placeTakeProfitOrder(
    userId: string,
    exchangeName: string,
    symbol: string,
    side: string,
    quantity: number,
    takeProfitConfig: { price: number; percentage?: number }
  ): Promise<any | null> {
    try {
      const takeProfitSide = side === 'BUY' ? 'SELL' : 'BUY';
      const takeProfitPrice = takeProfitConfig.price;

      const takeProfitOrder = await this.exchangeOAuthService.placeOrder(exchangeName, userId, {
        symbol,
        side: takeProfitSide,
        type: 'LIMIT',
        quantity,
        price: takeProfitPrice,
        timeInForce: 'GTC',
      });

      // Store in database
      const dbOrder = await this.prisma.order.create({
        data: {
          userId,
          exchangeName,
          exchangeOrderId: takeProfitOrder.orderId || takeProfitOrder.id,
          symbol,
          side: takeProfitSide.toUpperCase() as TradeSide,
          type: 'LIMIT',
          quantity,
          price: takeProfitPrice,
          status: 'PENDING',
          filledQuantity: 0,
          averagePrice: null,
          exchangeData: takeProfitOrder,
          config: { type: 'take_profit', config: takeProfitConfig } as any,
        },
      });

      return dbOrder;
    } catch (error) {
      console.error('Error placing take-profit order:', error);
      return null;
    }
  }

  /**
   * Place trailing stop order
   */
  private async placeTrailingStopOrder(
    userId: string,
    exchangeName: string,
    symbol: string,
    side: string,
    quantity: number,
    trailingStopConfig: { distance: number; percentage?: boolean }
  ): Promise<any | null> {
    try {
      // Note: Trailing stops are complex and may not be supported by all exchanges
      // This is a simplified implementation
      const trailingStopSide = side === 'BUY' ? 'SELL' : 'BUY';
      
      // For now, create a regular stop order that will be updated dynamically
      // In a real implementation, this would use exchange-specific trailing stop APIs
      
      const dbOrder = await this.prisma.order.create({
        data: {
          userId,
          exchangeName,
          exchangeOrderId: `trailing_${Date.now()}`,
          symbol,
          side: trailingStopSide.toUpperCase() as TradeSide,
          type: 'STOP',
          quantity,
          price: 0, // Will be updated dynamically
          status: 'PENDING',
          filledQuantity: 0,
          averagePrice: null,
          exchangeData: {},
          config: { type: 'trailing_stop', config: trailingStopConfig } as any,
        },
      });

      return dbOrder;
    } catch (error) {
      console.error('Error placing trailing stop order:', error);
      return null;
    }
  }

  /**
   * Place DCA (Dollar Cost Averaging) orders
   */
  private async placeDCAOrders(
    userId: string,
    exchangeName: string,
    symbol: string,
    side: string,
    totalQuantity: number,
    dcaConfig: { levels: number; stepSize: number; stepPercentage?: number }
  ): Promise<any[]> {
    const dcaOrders: any[] = [];
    const { levels, stepSize, stepPercentage } = dcaConfig;

    try {
      // Get current market price
      const marketData = await this.marketDataService.getLatestMarketData([symbol]);
      if (marketData.length === 0) {
        throw new Error('Unable to get market data for DCA calculation');
      }

      const currentPrice = marketData[0].price;
      const quantityPerLevel = totalQuantity / levels;

      for (let i = 1; i <= levels; i++) {
        let orderPrice;
        
        if (stepPercentage) {
          const priceStep = currentPrice * (stepPercentage / 100) * i;
          orderPrice = side === 'BUY' 
            ? currentPrice - priceStep 
            : currentPrice + priceStep;
        } else {
          const priceStep = stepSize * i;
          orderPrice = side === 'BUY' 
            ? currentPrice - priceStep 
            : currentPrice + priceStep;
        }

        const dcaOrder = await this.exchangeOAuthService.placeOrder(exchangeName, userId, {
          symbol,
          side,
          type: 'LIMIT',
          quantity: quantityPerLevel,
          price: orderPrice,
          timeInForce: 'GTC',
        });

        // Store in database
        const dbOrder = await this.prisma.order.create({
          data: {
            userId,
            exchangeName,
            exchangeOrderId: dcaOrder.orderId || dcaOrder.id,
            symbol,
            side: side.toUpperCase() as TradeSide,
            type: 'LIMIT',
            quantity: quantityPerLevel,
            price: orderPrice,
            status: 'PENDING',
            filledQuantity: 0,
            averagePrice: null,
            exchangeData: dcaOrder,
            config: { type: 'dca', level: i, totalLevels: levels, config: dcaConfig } as any,
          },
        });

        dcaOrders.push(dbOrder);
      }
    } catch (error) {
      console.error('Error placing DCA orders:', error);
    }

    return dcaOrders;
  }

  /**
   * Validate order request
   */
  private async validateOrder(orderRequest: OrderRequest): Promise<{ valid: boolean; error?: string }> {
    try {
      const { userId, exchangeName, symbol, side, type, quantity, price } = orderRequest;

      // Check if user has active exchange connection
      const connection = await this.prisma.exchangeConnection.findFirst({
        where: { userId, exchangeName, isActive: true },
      });

      if (!connection) {
        return { valid: false, error: 'No active connection to exchange' };
      }

      // Validate quantity
      if (quantity <= 0) {
        return { valid: false, error: 'Quantity must be greater than 0' };
      }

      // Validate price for limit orders
      if ((type === 'LIMIT' || type === 'STOP_LIMIT') && (!price || price <= 0)) {
        return { valid: false, error: 'Price is required for limit orders' };
      }

      // Check if symbol is supported
      const marketData = await this.marketDataService.getLatestMarketData([symbol]);
      if (marketData.length === 0) {
        return { valid: false, error: 'Symbol not supported or not found' };
      }

      // Check user balance (simplified)
      const balance = await this.exchangeOAuthService.getAccountBalance(exchangeName, userId);
      // This would need more sophisticated balance checking in production

      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: error.message || 'Validation failed' };
    }
  }

  /**
   * Cancel order and all related advanced orders
   */
  async cancelOrder(userId: string, orderId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const order = await this.prisma.order.findFirst({
        where: { id: orderId, userId },
      });

      if (!order) {
        return { success: false, error: 'Order not found' };
      }

      // Cancel order on exchange (placeholder - would need to implement in ExchangeOAuthService)
      // await this.exchangeOAuthService.cancelOrder(order.exchangeName, userId, order.exchangeOrderId);

      // Update order status in database
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });

      // Cancel related advanced orders
      if (order.config && typeof order.config === 'object') {
        const config = order.config as any;
        if (config.type) {
          // Find and cancel related orders
          const relatedOrders = await this.prisma.order.findMany({
            where: {
              userId,
              symbol: order.symbol,
              config: {
                path: ['type'],
                equals: config.type,
              },
            },
          });

          for (const relatedOrder of relatedOrders) {
            await this.cancelOrder(userId, relatedOrder.id);
          }
        }
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      return { success: false, error: error.message || 'Failed to cancel order' };
    }
  }

  /**
   * Get order execution history
   */
  async getOrderHistory(
    userId: string,
    filters?: {
      exchangeName?: string;
      symbol?: string;
      status?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<any[]> {
    try {
      const where: any = { userId };

      if (filters?.exchangeName) {
        where.exchangeName = filters.exchangeName;
      }

      if (filters?.symbol) {
        where.symbol = filters.symbol;
      }

      if (filters?.status) {
        where.status = filters.status;
      }

      if (filters?.startDate || filters?.endDate) {
        where.createdAt = {};
        if (filters.startDate) {
          where.createdAt.gte = filters.startDate;
        }
        if (filters.endDate) {
          where.createdAt.lte = filters.endDate;
        }
      }

      const orders = await this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
      });

      return orders;
    } catch (error) {
      console.error('Error getting order history:', error);
      return [];
    }
  }

  /**
   * Update order status from exchange
   */
  async updateOrderStatus(userId: string, orderId: string): Promise<{ success: boolean; order?: any }> {
    try {
      const order = await this.prisma.order.findFirst({
        where: { id: orderId, userId },
      });

      if (!order) {
        return { success: false };
      }

      // Get order status from exchange
      const exchangeStatus = await this.exchangeOAuthService.getOrderStatus(
        order.exchangeName,
        userId,
        order.exchangeOrderId
      );

      // Update order in database
      const updatedOrder = await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: exchangeStatus.status,
          filledQuantity: exchangeStatus.filledQuantity || 0,
          averagePrice: exchangeStatus.averagePrice || null,
          exchangeData: exchangeStatus,
          updatedAt: new Date(),
        },
      });

      return { success: true, order: updatedOrder };
    } catch (error: any) {
      console.error('Error updating order status:', error);
      return { success: false };
    }
  }

  /**
   * Calculate order statistics
   */
  async getOrderStatistics(userId: string, period?: { startDate: Date; endDate: Date }): Promise<any> {
    try {
      const where: any = { userId };
      
      if (period) {
        where.createdAt = {
          gte: period.startDate,
          lte: period.endDate,
        };
      }

      const orders = await this.prisma.order.findMany({
        where,
        select: {
          side: true,
          status: true,
          quantity: true,
          price: true,
          filledQuantity: true,
          averagePrice: true,
          createdAt: true,
        },
      });

      const stats = {
        totalOrders: orders.length,
        filledOrders: orders.filter(o => o.status === 'FILLED').length,
        cancelledOrders: orders.filter(o => o.status === 'CANCELLED').length,
        pendingOrders: orders.filter(o => o.status === 'PENDING').length,
        buyOrders: orders.filter(o => o.side === 'BUY').length,
        sellOrders: orders.filter(o => o.side === 'SELL').length,
        totalVolume: orders.reduce((sum, o) => sum + Number(o.filledQuantity || 0), 0),
        averageOrderSize: orders.length > 0 ? orders.reduce((sum, o) => sum + Number(o.quantity), 0) / orders.length : 0,
        winRate: 0, // This would need more sophisticated calculation
        totalProfit: 0, // This would need P&L calculation
      };

      return stats;
    } catch (error) {
      console.error('Error calculating order statistics:', error);
      return {};
    }
  }
}
