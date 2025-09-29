import { Server } from 'socket.io';

export class NotificationService {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  async sendNotification(userId: string, type: string, title: string, message: string, data?: any): Promise<void> {
    // Send real-time notification via Socket.IO
    this.io.to(`user-${userId}`).emit('notification', {
      type,
      title,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  async sendTradeAlert(userId: string, tradeData: any): Promise<void> {
    await this.sendNotification(
      userId,
      'trade_executed',
      'Trade Executed',
      `Your ${tradeData.side} order for ${tradeData.symbol} has been executed`,
      tradeData
    );
  }

  async sendRiskAlert(userId: string, alertData: any): Promise<void> {
    await this.sendNotification(
      userId,
      'risk_warning',
      'Risk Alert',
      alertData.message,
      alertData
    );
  }

  async sendStrategyAlert(userId: string, strategyData: any): Promise<void> {
    await this.sendNotification(
      userId,
      'strategy_alert',
      'Strategy Alert',
      strategyData.message,
      strategyData
    );
  }
}
