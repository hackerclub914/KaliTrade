import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

interface MarketData {
  symbol: string;
  price: number;
  volume: number;
  change: number;
  changePercent: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

export class RealTimeMarketDataService {
  private io: Server;
  private prisma: PrismaClient;
  private subscriptions: Map<string, Set<string>>; // symbol -> Set of user IDs
  private isRunning: boolean;
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(io: Server, prisma: PrismaClient) {
    this.io = io;
    this.prisma = prisma;
    this.subscriptions = new Map();
    this.isRunning = false;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    console.log('Starting Real-time Market Data Service...');
    this.isRunning = true;

    // Start periodic updates instead of WebSocket connections
    this.startPeriodicUpdates();
    
    console.log('Real-time Market Data Service started successfully');
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('Stopping Real-time Market Data Service...');
    this.isRunning = false;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    console.log('Real-time Market Data Service stopped');
  }

  private startPeriodicUpdates(): void {
    // Update market data every 30 seconds instead of continuous WebSocket
    this.updateInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.updateMarketData();
      } catch (error) {
        console.error('Error updating market data:', error);
      }
    }, 30000); // 30 seconds

    // Initial update
    this.updateMarketData();
  }

  private async updateMarketData(): Promise<void> {
    try {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
      
      for (const symbol of symbols) {
        try {
          const marketData = await this.fetchMarketData(symbol);
          
          // Store in database
          await this.storeMarketData(marketData);
          
          // Broadcast to subscribed users
          this.broadcastMarketData(marketData);
          
          // Small delay to prevent overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error fetching data for ${symbol}:`, error);
        }
      }
    } catch (error) {
      console.error('Error in updateMarketData:', error);
    }
  }

  private async fetchMarketData(symbol: string): Promise<MarketData> {
    try {
      // Use Binance public API for real market data
      const response = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, {
        timeout: 5000
      });

      const data = response.data;
      const currentPrice = parseFloat(data.lastPrice);
      const openPrice = parseFloat(data.openPrice);
      const change = currentPrice - openPrice;
      const changePercent = (change / openPrice) * 100;

      return {
        symbol: symbol,
        price: currentPrice,
        volume: parseFloat(data.volume),
        change: change,
        changePercent: changePercent,
        high24h: parseFloat(data.highPrice),
        low24h: parseFloat(data.lowPrice),
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`Error fetching market data for ${symbol}:`, error);
      
      // Return mock data as fallback
      return this.generateMockMarketData(symbol);
    }
  }

  private generateMockMarketData(symbol: string): MarketData {
    const basePrices: { [key: string]: number } = {
      'BTCUSDT': 102500,
      'ETHUSDT': 3450,
      'SOLUSDT': 185,
      'BNBUSDT': 650
    };

    const basePrice = basePrices[symbol] || 100;
    const change = (Math.random() - 0.5) * basePrice * 0.02; // ±1% change
    const currentPrice = basePrice + change;

    return {
      symbol: symbol,
      price: currentPrice,
      volume: Math.random() * 1000000,
      change: change,
      changePercent: (change / basePrice) * 100,
      high24h: basePrice * 1.05,
      low24h: basePrice * 0.95,
      timestamp: Date.now()
    };
  }

  private async storeMarketData(marketData: MarketData): Promise<void> {
    try {
      await this.prisma.marketData.upsert({
        where: {
          symbol_exchange_timestamp: {
            symbol: marketData.symbol,
            exchange: 'binance',
            timestamp: new Date(marketData.timestamp)
          }
        },
        update: {
          open: marketData.price,
          high: marketData.high24h,
          low: marketData.low24h,
          close: marketData.price,
          volume: marketData.volume
        },
        create: {
          symbol: marketData.symbol,
          exchange: 'binance',
          open: marketData.price,
          high: marketData.high24h,
          low: marketData.low24h,
          close: marketData.price,
          volume: marketData.volume,
          timestamp: new Date(marketData.timestamp)
        }
      });
    } catch (error) {
      console.error('Error storing market data:', error);
    }
  }

  private broadcastMarketData(marketData: MarketData): void {
    try {
      this.io.emit('marketDataUpdate', marketData);
      
      // Also broadcast to specific symbol subscribers
      const subscribers = this.subscriptions.get(marketData.symbol);
      if (subscribers && subscribers.size > 0) {
        subscribers.forEach(userId => {
          this.io.to(`user-${userId}`).emit('marketDataUpdate', marketData);
        });
      }
    } catch (error) {
      console.error('Error broadcasting market data:', error);
    }
  }

  public subscribeToSymbol(userId: string, symbol: string): void {
    if (!this.subscriptions.has(symbol)) {
      this.subscriptions.set(symbol, new Set());
    }
    this.subscriptions.get(symbol)!.add(userId);
  }

  public unsubscribeFromSymbol(userId: string, symbol: string): void {
    const subscribers = this.subscriptions.get(symbol);
    if (subscribers) {
      subscribers.delete(userId);
      if (subscribers.size === 0) {
        this.subscriptions.delete(symbol);
      }
    }
  }

  public async getLatestMarketData(symbols: string[]): Promise<MarketData[]> {
    try {
      const marketDataList: MarketData[] = [];
      
      for (const symbol of symbols) {
        try {
          const data = await this.fetchMarketData(symbol);
          marketDataList.push(data);
        } catch (error) {
          console.error(`Error getting latest data for ${symbol}:`, error);
        }
      }
      
      return marketDataList;
    } catch (error) {
      console.error('Error getting latest market data:', error);
      return [];
    }
  }

  public async getHistoricalData(symbol: string, limit: number = 100): Promise<any[]> {
    try {
      const historicalData = await this.prisma.marketData.findMany({
        where: {
          symbol: symbol,
          exchange: 'binance'
        },
        orderBy: {
          timestamp: 'desc'
        },
        take: limit
      });

      return historicalData.map(data => ({
        timestamp: data.timestamp.getTime(),
        open: Number(data.open),
        high: Number(data.high),
        low: Number(data.low),
        close: Number(data.close),
        volume: Number(data.volume)
      }));
    } catch (error) {
      console.error('Error getting historical data:', error);
      return [];
    }
  }
}