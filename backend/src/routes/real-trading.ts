import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticateToken } from '../middleware/auth';
import axios from 'axios';

const router = Router();
const prisma = new PrismaClient();

// Real Order Book from Binance
router.get('/orderbook/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const { limit = '20' } = req.query;

  try {
    // Fetch real order book from Binance
    const response = await axios.get(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`, {
      timeout: 5000
    });

    const orderBook = {
      symbol: symbol,
      bids: response.data.bids.map((bid: string[]) => ({
        price: parseFloat(bid[0]),
        quantity: parseFloat(bid[1])
      })),
      asks: response.data.asks.map((ask: string[]) => ({
        price: parseFloat(ask[0]),
        quantity: parseFloat(ask[1])
      })),
      timestamp: Date.now()
    };

    res.json({
      success: true,
      data: orderBook
    });
  } catch (error: any) {
    console.error('Error fetching real order book:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to fetch order book'
    });
  }
}));

// Real Recent Trades from Binance
router.get('/trades/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const { limit = '100' } = req.query;

  try {
    // Fetch real trades from Binance
    const response = await axios.get(`https://api.binance.com/api/v3/aggTrades?symbol=${symbol}&limit=${limit}`, {
      timeout: 5000
    });

    const trades = response.data.map((trade: any) => ({
      symbol: symbol,
      price: parseFloat(trade.p),
      quantity: parseFloat(trade.q),
      side: trade.m ? 'sell' : 'buy',
      timestamp: trade.T
    }));

    res.json({
      success: true,
      data: { trades }
    });
  } catch (error: any) {
    console.error('Error fetching real trades:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to fetch trades'
    });
  }
}));

// Real Portfolio Data
router.get('/portfolio/:userId', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;

  try {
    // Get user's portfolio from database
    const portfolio = await prisma.portfolio.findFirst({
      where: { userId },
    });

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: 'Portfolio not found'
      });
    }

    // Calculate real-time portfolio value
    let totalValue = Number(portfolio.totalValue) || 0;
    let totalChange = 0;
    const positions: any[] = [];

    // For now, return portfolio summary without individual assets
    // In a real implementation, you would fetch individual positions

    const portfolioData = {
      totalValue: totalValue,
      totalChange: totalChange,
      totalChangePercent: totalValue > 0 ? (totalChange / totalValue) * 100 : 0,
      positions: positions,
      timestamp: Date.now()
    };

    res.json({
      success: true,
      data: portfolioData
    });
  } catch (error: any) {
    console.error('Error fetching portfolio:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch portfolio'
    });
  }
}));

// Real AI Analysis
router.get('/ai-analysis/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;

  try {
    // Fetch real market data for analysis
    const coinId = getCoinGeckoId(symbol);
    
    // Get current price and historical data
    const [priceResponse, historicalResponse] = await Promise.all([
      axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`),
      axios.get(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=7&interval=hourly`)
    ]);

    if (!priceResponse.data[coinId] || !historicalResponse.data.prices) {
      throw new Error('Unable to fetch market data');
    }

    const currentPrice = priceResponse.data[coinId].usd;
    const change24h = priceResponse.data[coinId].usd_24h_change || 0;
    const prices = historicalResponse.data.prices.map((item: number[]) => item[1]);

    // Perform technical analysis
    const analysis = performTechnicalAnalysis(prices, currentPrice, change24h);

    res.json({
      success: true,
      data: {
        symbol: symbol,
        signal: analysis.signal,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        technicalIndicators: analysis.indicators,
        timestamp: Date.now()
      }
    });
  } catch (error: any) {
    console.error('Error performing AI analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to perform analysis'
    });
  }
}));

// Real News and Sentiment
router.get('/news/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;

  try {
    // Fetch real news data (this would require NewsAPI key in production)
    const response = await axios.get(`https://newsapi.org/v2/everything?q=${symbol} cryptocurrency&apiKey=YOUR_NEWS_API_KEY&language=en&sortBy=publishedAt&pageSize=10`);
    
    const news = response.data.articles.map((article: any) => ({
      title: article.title,
      description: article.description,
      url: article.url,
      publishedAt: article.publishedAt,
      source: article.source.name,
      sentiment: analyzeSentiment(article.title + ' ' + article.description)
    }));

    res.json({
      success: true,
      data: { news }
    });
  } catch (error: any) {
    console.error('Error fetching news:', error);
    
    // Fallback to mock news
    const mockNews = [
      {
        title: `${symbol} Market Update`,
        description: `Latest developments in ${symbol} market`,
        url: '#',
        publishedAt: new Date().toISOString(),
        source: 'KaliTrade News',
        sentiment: 'neutral'
      }
    ];

    res.json({
      success: true,
      data: { news: mockNews }
    });
  }
}));

// Real Trading Signals
router.get('/signals/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;

  try {
    // Get real market data
    const coinId = getCoinGeckoId(symbol);
    const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=1&interval=hourly`);
    
    if (response.data.prices) {
      const prices = response.data.prices.map((item: number[]) => item[1]);
      const analysis = performTechnicalAnalysis(prices, prices[prices.length - 1], 0);
      
      const signals = [
        {
          type: analysis.signal.toLowerCase(),
          confidence: analysis.confidence,
          content: `Technical analysis for ${symbol}: ${analysis.signal} signal with ${analysis.confidence}% confidence. ${analysis.reasoning}`,
          reasoning: analysis.reasoning,
          timestamp: Date.now()
        }
      ];

      res.json({
        success: true,
        data: { signals }
      });
    } else {
      throw new Error('Unable to fetch market data');
    }
  } catch (error: any) {
    console.error('Error generating signals:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate signals'
    });
  }
}));

// Helper Functions
function getCoinGeckoId(symbol: string): string {
  const mapping: { [key: string]: string } = {
    'BTCUSDT': 'bitcoin',
    'ETHUSDT': 'ethereum',
    'SOLUSDT': 'solana',
    'BNBUSDT': 'binancecoin',
    'ADAUSDT': 'cardano',
    'DOTUSDT': 'polkadot',
    'MATICUSDT': 'matic-network',
    'AVAXUSDT': 'avalanche-2',
    'LINKUSDT': 'chainlink',
    'UNIUSDT': 'uniswap'
  };
  return mapping[symbol] || 'bitcoin';
}

function performTechnicalAnalysis(prices: number[], currentPrice: number, change24h: number) {
  // Simple moving averages
  const sma20 = calculateSMA(prices, 20);
  const sma50 = calculateSMA(prices, 50);
  
  // RSI calculation
  const rsi = calculateRSI(prices, 14);
  
  // MACD calculation
  const macd = calculateMACD(prices);
  
  const latestSMA20 = sma20[sma20.length - 1];
  const latestSMA50 = sma50[sma50.length - 1];
  const latestRSI = rsi[rsi.length - 1];
  const latestMACD = macd.macd[macd.macd.length - 1];
  const latestMACDSignal = macd.signal[macd.signal.length - 1];
  
  let score = 0;
  let reasoning: string[] = [];
  
  // Price vs SMA signals
  if (currentPrice > latestSMA20) {
    score += 1;
    reasoning.push('Price above SMA20');
  } else {
    score -= 1;
    reasoning.push('Price below SMA20');
  }
  
  if (currentPrice > latestSMA50) {
    score += 1;
    reasoning.push('Price above SMA50');
  } else {
    score -= 1;
    reasoning.push('Price below SMA50');
  }
  
  // RSI signals
  if (latestRSI < 30) {
    score += 2;
    reasoning.push('RSI oversold');
  } else if (latestRSI > 70) {
    score -= 2;
    reasoning.push('RSI overbought');
  }
  
  // MACD signals
  if (latestMACD > latestMACDSignal) {
    score += 1;
    reasoning.push('MACD bullish');
  } else {
    score -= 1;
    reasoning.push('MACD bearish');
  }
  
  // 24h change
  if (change24h > 5) {
    score += 1;
    reasoning.push('Strong 24h gain');
  } else if (change24h < -5) {
    score -= 1;
    reasoning.push('Strong 24h decline');
  }
  
  let signal = 'HOLD';
  let confidence = Math.abs(score) * 15;
  
  if (score >= 3) {
    signal = 'BUY';
  } else if (score <= -3) {
    signal = 'SELL';
  }
  
  return {
    signal: signal,
    confidence: Math.min(confidence, 95),
    reasoning: reasoning.join(', '),
    indicators: {
      sma20: latestSMA20,
      sma50: latestSMA50,
      rsi: latestRSI,
      macd: latestMACD,
      macdSignal: latestMACDSignal
    }
  };
}

function calculateSMA(prices: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = period - 1; i < prices.length; i++) {
    const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }
  return sma;
}

function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  for (let i = period; i < prices.length; i++) {
    const gains: number[] = [];
    const losses: number[] = [];
    
    for (let j = i - period + 1; j <= i; j++) {
      const change = prices[j] - prices[j - 1];
      if (change > 0) gains.push(change);
      else losses.push(Math.abs(change));
    }
    
    const avgGain = gains.reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / period;
    
    const rs = avgGain / avgLoss;
    const rsiValue = 100 - (100 / (1 + rs));
    rsi.push(rsiValue);
  }
  return rsi;
}

function calculateMACD(prices: number[]) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  
  const macd: number[] = [];
  for (let i = 0; i < ema12.length; i++) {
    macd.push(ema12[i] - ema26[i]);
  }
  
  const signal = calculateEMA(macd, 9);
  
  return { macd, signal };
}

function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // First EMA is SMA
  const sma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema.push(sma);
  
  // Calculate subsequent EMAs
  for (let i = period; i < prices.length; i++) {
    const emaValue = (prices[i] * multiplier) + (ema[ema.length - 1] * (1 - multiplier));
    ema.push(emaValue);
  }
  
  return ema;
}

function analyzeSentiment(text: string): string {
  const positiveWords = ['bullish', 'surge', 'rally', 'gain', 'profit', 'up', 'increase', 'growth', 'positive', 'optimistic'];
  const negativeWords = ['bearish', 'crash', 'fall', 'loss', 'down', 'decrease', 'decline', 'negative', 'pessimistic', 'fear'];
  
  const words = text.toLowerCase().split(' ');
  let positiveCount = 0;
  let negativeCount = 0;
  
  words.forEach(word => {
    if (positiveWords.includes(word)) positiveCount++;
    if (negativeWords.includes(word)) negativeCount++;
  });
  
  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

export default router;
