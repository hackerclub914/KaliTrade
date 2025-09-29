import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import exchangeRoutes from './routes/exchange';
import tradingRoutes from './routes/trading';
import realTradingRoutes from './routes/real-trading';
import tradingApiRoutes from './routes/trading-api';
import analyticsRoutes from './routes/analytics';

// Import middleware
import { authenticateToken } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { 
  securityHeaders, 
  apiRateLimit, 
  authRateLimit, 
  tradingRateLimit,
  sqlInjectionProtection,
  xssProtection,
  securityLogger 
} from './middleware/security';
import { 
  performanceMonitor, 
  healthCheck, 
  databaseHealthCheck,
  getApiMetrics,
  setupMetricsWebSocket,
  memoryMonitor,
  cleanupMetrics,
  errorTracker 
} from './middleware/monitoring';

// Import services
import { TradingBotService } from './services/TradingBotService';
import { MarketDataService } from './services/MarketDataService';
import { NotificationService } from './services/NotificationService';
import { ExchangeOAuthService } from './services/ExchangeOAuthService';
import { RealTimeMarketDataService } from './services/RealTimeMarketDataService';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env['FRONTEND_URL'] || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const prisma = new PrismaClient();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Security middleware
app.use(securityHeaders);
app.use(sqlInjectionProtection);
app.use(xssProtection);
app.use(securityLogger);
app.use(performanceMonitor);

// Rate limiting
app.use(apiRateLimit);
app.use('/api/auth', authRateLimit);
app.use('/api/trading', tradingRateLimit);

// CORS and body parsing
app.use(cors({
  origin: process.env['FRONTEND_URL'] || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Health check and monitoring endpoints
app.get('/health', healthCheck);
app.get('/health/database', databaseHealthCheck);
app.get('/metrics', getApiMetrics);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/user', authenticateToken, userRoutes);
app.use('/api/exchange', authenticateToken, exchangeRoutes);
app.use('/api/trading', authenticateToken, tradingRoutes);
app.use('/api/real-trading', realTradingRoutes);
app.use('/api/trading', tradingApiRoutes);
app.use('/api/analytics', authenticateToken, analyticsRoutes);

// Error handling middleware
app.use(errorTracker);
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', (userId: string) => {
    socket.join(`user-${userId}`);
    console.log(`User ${userId} joined their room`);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Initialize services
const tradingBotService = new TradingBotService(prisma, io);
const marketDataService = new MarketDataService(prisma);
const notificationService = new NotificationService(io);
const exchangeOAuthService = new ExchangeOAuthService();
const realTimeMarketDataService = new RealTimeMarketDataService(io, prisma);

// Start services
const startServices = async () => {
  try {
    await marketDataService.start();
    await tradingBotService.start();
    await realTimeMarketDataService.start();
    
    // Setup monitoring
    setupMetricsWebSocket(io);
    memoryMonitor();
    cleanupMetrics();
    
    console.log('All services started successfully');
  } catch (error) {
    console.error('Error starting services:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('Received shutdown signal, closing server gracefully...');
  
  server.close(async () => {
    console.log('HTTP server closed');
    
    try {
      await prisma.$disconnect();
      console.log('Database connection closed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const PORT = process.env['PORT'] || 3001;

server.listen(PORT, async () => {
  console.log(`🚀 KaliTrade Backend Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env['NODE_ENV'] || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  
  await startServices();
});

// Export for testing
export { app, server, io, prisma };
