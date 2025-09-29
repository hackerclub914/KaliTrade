import { PrismaClient } from '@prisma/client';
import { ExchangeOAuthService } from './ExchangeOAuthService';
import { RealTimeMarketDataService } from './RealTimeMarketDataService';

interface PortfolioPosition {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  exchangeName: string;
}

interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalPnL: number;
  totalPnLPercent: number;
  dayChange: number;
  dayChangePercent: number;
  positions: PortfolioPosition[];
  exchanges: { [exchangeName: string]: number };
}

interface PortfolioAllocation {
  symbol: string;
  percentage: number;
  value: number;
  quantity: number;
}

export class PortfolioService {
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
   * Get comprehensive portfolio summary for a user
   */
  async getPortfolioSummary(userId: string): Promise<PortfolioSummary | null> {
    try {
      // Get all active exchange connections
      const connections = await this.prisma.exchangeConnection.findMany({
        where: { userId, isActive: true },
      });

      if (connections.length === 0) {
        return {
          totalValue: 0,
          totalCost: 0,
          totalPnL: 0,
          totalPnLPercent: 0,
          dayChange: 0,
          dayChangePercent: 0,
          positions: [],
          exchanges: {},
        };
      }

      // Get balances from all exchanges
      const allPositions: PortfolioPosition[] = [];
      const exchangeValues: { [exchangeName: string]: number } = {};

      for (const connection of connections) {
        try {
          const balances = await this.exchangeOAuthService.getAccountBalance(
            connection.exchangeName,
            userId
          );

          const exchangePositions = await this.processExchangeBalances(
            connection.exchangeName,
            balances,
            userId
          );

          allPositions.push(...exchangePositions);
          
          // Calculate exchange total value
          exchangeValues[connection.exchangeName] = exchangePositions.reduce(
            (sum, pos) => sum + pos.marketValue,
            0
          );
        } catch (error) {
          console.error(`Error getting balance from ${connection.exchangeName}:`, error);
        }
      }

      // Calculate portfolio summary
      const totalValue = allPositions.reduce((sum, pos) => sum + pos.marketValue, 0);
      const totalCost = allPositions.reduce((sum, pos) => sum + (pos.quantity * pos.averagePrice), 0);
      const totalPnL = totalValue - totalCost;
      const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

      // Calculate day change (simplified - would need historical data)
      const dayChange = 0; // Placeholder
      const dayChangePercent = 0; // Placeholder

      return {
        totalValue,
        totalCost,
        totalPnL,
        totalPnLPercent,
        dayChange,
        dayChangePercent,
        positions: allPositions,
        exchanges: exchangeValues,
      };
    } catch (error) {
      console.error('Error getting portfolio summary:', error);
      return null;
    }
  }

  /**
   * Process exchange balances into portfolio positions
   */
  private async processExchangeBalances(
    exchangeName: string,
    balances: any[],
    userId: string
  ): Promise<PortfolioPosition[]> {
    const positions: PortfolioPosition[] = [];

    for (const balance of balances) {
      const symbol = this.formatSymbol(balance.asset || balance.currency);
      const quantity = parseFloat(balance.free || balance.available || balance.balance || '0');

      if (quantity > 0) {
        // Get current market price
        const marketData = await this.marketDataService.getLatestMarketData([symbol]);
        const currentPrice = marketData.length > 0 ? marketData[0].price : 0;

        // Calculate average price from trade history
        const averagePrice = await this.calculateAveragePrice(userId, exchangeName, symbol);

        const marketValue = quantity * currentPrice;
        const costBasis = quantity * averagePrice;
        const unrealizedPnL = marketValue - costBasis;
        const unrealizedPnLPercent = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;

        positions.push({
          symbol,
          quantity,
          averagePrice,
          currentPrice,
          marketValue,
          unrealizedPnL,
          unrealizedPnLPercent,
          exchangeName,
        });
      }
    }

    return positions;
  }

  /**
   * Calculate average price for a position
   */
  private async calculateAveragePrice(userId: string, exchangeName: string, symbol: string): Promise<number> {
    try {
      // Get filled buy orders for this symbol
      const buyOrders = await this.prisma.order.findMany({
        where: {
          userId,
          exchangeName,
          symbol,
          side: 'BUY',
          status: 'FILLED',
        },
        orderBy: { createdAt: 'asc' },
      });

      if (buyOrders.length === 0) {
        return 0;
      }

      let totalQuantity = 0;
      let totalCost = 0;

      for (const order of buyOrders) {
        const filledQuantity = order.filledQuantity || order.quantity;
        const avgPrice = order.averagePrice || order.price || 0;
        
        totalQuantity += Number(filledQuantity);
        totalCost += Number(filledQuantity) * Number(avgPrice);
      }

      return totalQuantity > 0 ? totalCost / totalQuantity : 0;
    } catch (error) {
      console.error('Error calculating average price:', error);
      return 0;
    }
  }

  /**
   * Format symbol for market data API
   */
  private formatSymbol(asset: string): string {
    // Convert exchange-specific symbols to standard format
    if (asset === 'USDT' || asset === 'USD') {
      return 'USDT/USD'; // Base quote pair
    }
    
    // Add common quote currencies
    const quoteCurrencies = ['USDT', 'USD', 'BTC', 'ETH'];
    for (const quote of quoteCurrencies) {
      if (asset.endsWith(quote)) {
        const base = asset.replace(quote, '');
        return `${base}/${quote}`;
      }
    }

    return `${asset}/USDT`; // Default to USDT
  }

  /**
   * Get portfolio allocation breakdown
   */
  async getPortfolioAllocation(userId: string): Promise<PortfolioAllocation[]> {
    try {
      const portfolio = await this.getPortfolioSummary(userId);
      
      if (!portfolio || portfolio.positions.length === 0) {
        return [];
      }

      const allocations: PortfolioAllocation[] = portfolio.positions.map(position => ({
        symbol: position.symbol,
        percentage: (position.marketValue / portfolio.totalValue) * 100,
        value: position.marketValue,
        quantity: position.quantity,
      }));

      // Sort by percentage descending
      return allocations.sort((a, b) => b.percentage - a.percentage);
    } catch (error) {
      console.error('Error getting portfolio allocation:', error);
      return [];
    }
  }

  /**
   * Get portfolio performance metrics
   */
  async getPortfolioPerformance(userId: string, period: '1D' | '7D' | '30D' | '90D' | '1Y' = '30D'): Promise<any> {
    try {
      const portfolio = await this.getPortfolioSummary(userId);
      
      if (!portfolio) {
        return null;
      }

      // Calculate period-based metrics
      const endDate = new Date();
      const startDate = this.getStartDate(period);

      // Get historical portfolio values (simplified)
      const historicalData = await this.getHistoricalPortfolioData(userId, startDate, endDate);
      
      const performance = {
        currentValue: portfolio.totalValue,
        periodStartValue: historicalData.length > 0 ? historicalData[0].value : portfolio.totalValue,
        periodReturn: 0,
        periodReturnPercent: 0,
        volatility: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        winRate: 0,
        totalTrades: 0,
        profitableTrades: 0,
      };

      if (historicalData.length > 0) {
        performance.periodReturn = portfolio.totalValue - historicalData[0].value;
        performance.periodReturnPercent = (performance.periodReturn / historicalData[0].value) * 100;
        
        // Calculate volatility
        const returns = this.calculateReturns(historicalData);
        performance.volatility = this.calculateVolatility(returns);
        
        // Calculate max drawdown
        performance.maxDrawdown = this.calculateMaxDrawdown(historicalData);
      }

      // Get trade statistics
      const tradeStats = await this.getTradeStatistics(userId, startDate, endDate);
      performance.totalTrades = tradeStats.totalTrades;
      performance.profitableTrades = tradeStats.profitableTrades;
      performance.winRate = tradeStats.totalTrades > 0 ? (tradeStats.profitableTrades / tradeStats.totalTrades) * 100 : 0;

      return performance;
    } catch (error) {
      console.error('Error getting portfolio performance:', error);
      return null;
    }
  }

  /**
   * Get historical portfolio data
   */
  private async getHistoricalPortfolioData(userId: string, startDate: Date, endDate: Date): Promise<{ date: Date; value: number }[]> {
    try {
      // This would typically fetch from a time-series database
      // For now, we'll return mock data
      const data: { date: Date; value: number }[] = [];
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      for (let i = 0; i <= days; i++) {
        const date = new Date(startDate.getTime() + (i * 24 * 60 * 60 * 1000));
        // Mock historical value with some random variation
        const baseValue = 10000;
        const variation = (Math.random() - 0.5) * 0.1; // ±5% variation
        const value = baseValue * (1 + variation);
        
        data.push({ date, value });
      }
      
      return data;
    } catch (error) {
      console.error('Error getting historical portfolio data:', error);
      return [];
    }
  }

  /**
   * Calculate returns from historical data
   */
  private calculateReturns(historicalData: { date: Date; value: number }[]): number[] {
    const returns: number[] = [];
    
    for (let i = 1; i < historicalData.length; i++) {
      const previousValue = historicalData[i - 1].value;
      const currentValue = historicalData[i].value;
      const returnValue = (currentValue - previousValue) / previousValue;
      returns.push(returnValue);
    }
    
    return returns;
  }

  /**
   * Calculate volatility from returns
   */
  private calculateVolatility(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Calculate maximum drawdown
   */
  private calculateMaxDrawdown(historicalData: { date: Date; value: number }[]): number {
    let maxValue = 0;
    let maxDrawdown = 0;
    
    for (const dataPoint of historicalData) {
      if (dataPoint.value > maxValue) {
        maxValue = dataPoint.value;
      }
      
      const drawdown = (maxValue - dataPoint.value) / maxValue;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    return maxDrawdown * 100; // Return as percentage
  }

  /**
   * Get trade statistics for a period
   */
  private async getTradeStatistics(userId: string, startDate: Date, endDate: Date): Promise<{ totalTrades: number; profitableTrades: number }> {
    try {
      const trades = await this.prisma.trade.findMany({
        where: {
          userId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          status: 'FILLED',
        },
      });

      const totalTrades = trades.length;
      const profitableTrades = trades.filter(trade => {
        const profit = (trade as any).realizedPnL || 0;
        return profit > 0;
      }).length;

      return { totalTrades, profitableTrades };
    } catch (error) {
      console.error('Error getting trade statistics:', error);
      return { totalTrades: 0, profitableTrades: 0 };
    }
  }

  /**
   * Get start date for performance period
   */
  private getStartDate(period: string): Date {
    const now = new Date();
    
    switch (period) {
      case '1D':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7D':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30D':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90D':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case '1Y':
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Rebalance portfolio to target allocation
   */
  async rebalancePortfolio(userId: string, targetAllocation: { [symbol: string]: number }): Promise<{ success: boolean; orders: any[] }> {
    try {
      const currentPortfolio = await this.getPortfolioSummary(userId);
      
      if (!currentPortfolio) {
        return { success: false, orders: [] };
      }

      const totalValue = currentPortfolio.totalValue;
      const orders: any[] = [];

      // Calculate required trades
      for (const [symbol, targetPercent] of Object.entries(targetAllocation)) {
        const targetValue = totalValue * (targetPercent / 100);
        const currentPosition = currentPortfolio.positions.find(p => p.symbol === symbol);
        const currentValue = currentPosition ? currentPosition.marketValue : 0;
        
        const difference = targetValue - currentValue;
        
        if (Math.abs(difference) > totalValue * 0.01) { // 1% threshold
          // Determine if we need to buy or sell
          const side = difference > 0 ? 'BUY' : 'SELL';
          const quantity = Math.abs(difference) / (currentPosition?.currentPrice || 1);
          
          // Get the primary exchange for this symbol
          const exchangeName = currentPosition?.exchangeName || 'binance';
          
          // Create rebalance order
          const order = {
            userId,
            exchangeName,
            symbol,
            side,
            type: 'MARKET' as const,
            quantity,
            config: {
              rebalance: true,
              targetAllocation: targetPercent,
            },
          };
          
          orders.push(order);
        }
      }

      return { success: true, orders };
    } catch (error) {
      console.error('Error rebalancing portfolio:', error);
      return { success: false, orders: [] };
    }
  }

  /**
   * Get risk metrics for portfolio
   */
  async getPortfolioRiskMetrics(userId: string): Promise<any> {
    try {
      const portfolio = await this.getPortfolioSummary(userId);
      
      if (!portfolio) {
        return null;
      }

      // Calculate risk metrics
      const riskMetrics = {
        valueAtRisk95: 0, // 95% VaR
        valueAtRisk99: 0, // 99% VaR
        expectedShortfall: 0,
        beta: 1.0, // Market beta
        correlation: 0.5, // Average correlation with market
        diversificationRatio: 1.0,
        concentrationRisk: 0,
      };

      // Calculate concentration risk (Herfindahl index)
      const allocations = await this.getPortfolioAllocation(userId);
      const concentrationRisk = allocations.reduce((sum, allocation) => {
        return sum + Math.pow(allocation.percentage / 100, 2);
      }, 0);
      
      riskMetrics.concentrationRisk = concentrationRisk;

      // Calculate diversification ratio
      const individualVolatilities = portfolio.positions.map(pos => 0.05); // Simplified
      const portfolioVolatility = 0.03; // Simplified
      riskMetrics.diversificationRatio = individualVolatilities.reduce((sum, vol) => sum + vol, 0) / portfolioVolatility;

      return riskMetrics;
    } catch (error) {
      console.error('Error getting portfolio risk metrics:', error);
      return null;
    }
  }
}
