import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';

export class TradingBotService {
  private prisma: PrismaClient;
  private io: Server;
  private isRunning: boolean = false;
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(prisma: PrismaClient, io: Server) {
    this.prisma = prisma;
    this.io = io;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    console.log('Starting Trading Bot Service...');
    this.isRunning = true;

    // Start periodic status updates instead of continuous processing
    this.startStatusUpdates();
    
    console.log('Trading Bot Service started successfully');
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('Stopping Trading Bot Service...');
    this.isRunning = false;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    console.log('Trading Bot Service stopped');
  }

  private startStatusUpdates(): void {
    // Update status every 60 seconds
    this.updateInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.updateBotStatus();
      } catch (error) {
        console.error('Error updating bot status:', error);
      }
    }, 60000); // 60 seconds

    // Initial status update
    this.updateBotStatus();
  }

  private async updateBotStatus(): Promise<void> {
    try {
      const status = {
        isActive: true,
        timestamp: new Date().toISOString(),
        message: 'Trading bot is running in monitoring mode'
      };

      // Broadcast status to connected clients
      this.io.emit('botStatusUpdate', status);
      
      console.log('Trading bot status updated:', status.message);
    } catch (error) {
      console.error('Error updating bot status:', error);
    }
  }

  public async executeTrade(userId: string, tradeData: any): Promise<any> {
    try {
      console.log(`Executing trade for user ${userId}:`, tradeData);
      
      // Simulate trade execution
      const tradeResult = {
        id: `trade_${Date.now()}`,
        userId,
        symbol: tradeData.symbol,
        side: tradeData.side,
        quantity: tradeData.quantity,
        price: tradeData.price,
        status: 'executed',
        timestamp: new Date().toISOString()
      };

      // Store trade in database
      await this.prisma.trade.create({
        data: {
          userId,
          symbol: tradeData.symbol,
          side: tradeData.side as any,
          type: 'MARKET' as any,
          amount: parseFloat(tradeData.quantity),
          price: parseFloat(tradeData.price),
          status: 'FILLED' as any,
          exchangeName: 'binance',
          executedAt: new Date()
        }
      });

      // Notify user
      this.io.to(`user-${userId}`).emit('tradeExecuted', tradeResult);

      return tradeResult;
    } catch (error) {
      console.error('Error executing trade:', error);
      throw error;
    }
  }

  public async getBotPerformance(userId: string): Promise<any> {
    try {
      const trades = await this.prisma.trade.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100
      });

      const totalTrades = trades.length;
      const profitableTrades = trades.filter(trade => 
        trade.side === 'SELL' && Number(trade.price) > 0
      ).length;

      return {
        totalTrades,
        profitableTrades,
        winRate: totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0,
        totalVolume: trades.reduce((sum, trade) => sum + Number(trade.amount), 0),
        lastUpdate: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting bot performance:', error);
      return {
        totalTrades: 0,
        profitableTrades: 0,
        winRate: 0,
        totalVolume: 0,
        lastUpdate: new Date().toISOString()
      };
    }
  }
}