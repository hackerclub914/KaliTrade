import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface PerformanceMetrics {
  requestCount: number;
  averageResponseTime: number;
  errorRate: number;
  memoryUsage: NodeJS.MemoryUsage;
  uptime: number;
  activeConnections: number;
}

interface RequestMetrics {
  method: string;
  url: string;
  statusCode: number;
  responseTime: number;
  timestamp: Date;
  userAgent?: string;
  ip?: string;
}

// In-memory metrics store (in production, use Redis or database)
const metricsStore = {
  requests: [] as RequestMetrics[],
  startTime: Date.now(),
  requestCount: 0,
  errorCount: 0,
};

// Performance monitoring middleware
export const performanceMonitor = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];

  // Increment request count
  metricsStore.requestCount++;

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    
    // Record request metrics
    const requestMetric: RequestMetrics = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime,
      timestamp: new Date(),
      userAgent,
      ip: clientIP,
    };

    metricsStore.requests.push(requestMetric);

    // Keep only last 1000 requests to prevent memory overflow
    if (metricsStore.requests.length > 1000) {
      metricsStore.requests = metricsStore.requests.slice(-1000);
    }

    // Increment error count for 4xx and 5xx responses
    if (res.statusCode >= 400) {
      metricsStore.errorCount++;
    }

    // Log slow requests
    if (responseTime > 5000) {
      console.warn(`Slow request detected: ${req.method} ${req.url} - ${responseTime}ms`);
    }

    // Log high error rate
    const recentRequests = metricsStore.requests.filter(
      r => Date.now() - r.timestamp.getTime() < 60000 // Last minute
    );
    const recentErrors = recentRequests.filter(r => r.statusCode >= 400);
    const errorRate = recentRequests.length > 0 ? (recentErrors.length / recentRequests.length) * 100 : 0;

    if (errorRate > 10 && recentRequests.length > 10) {
      console.warn(`High error rate detected: ${errorRate.toFixed(2)}% in the last minute`);
    }
  });

  next();
};

// Get performance metrics
export const getPerformanceMetrics = (): PerformanceMetrics => {
  const now = Date.now();
  const uptime = now - metricsStore.startTime;
  
  // Calculate average response time from recent requests
  const recentRequests = metricsStore.requests.filter(
    r => now - r.timestamp.getTime() < 300000 // Last 5 minutes
  );
  
  const averageResponseTime = recentRequests.length > 0
    ? recentRequests.reduce((sum, r) => sum + r.responseTime, 0) / recentRequests.length
    : 0;

  // Calculate error rate
  const recentErrors = recentRequests.filter(r => r.statusCode >= 400);
  const errorRate = recentRequests.length > 0 ? (recentErrors.length / recentRequests.length) * 100 : 0;

  // Get memory usage
  const memoryUsage = process.memoryUsage();

  return {
    requestCount: metricsStore.requestCount,
    averageResponseTime: Math.round(averageResponseTime),
    errorRate: Math.round(errorRate * 100) / 100,
    memoryUsage,
    uptime,
    activeConnections: metricsStore.requests.filter(
      r => now - r.timestamp.getTime() < 30000 // Last 30 seconds
    ).length,
  };
};

// Health check middleware
export const healthCheck = (req: Request, res: Response, next: NextFunction) => {
  const metrics = getPerformanceMetrics();
  
  // Determine health status
  let status = 'healthy';
  const issues: string[] = [];

  // Check memory usage
  const memoryUsagePercent = (metrics.memoryUsage.heapUsed / metrics.memoryUsage.heapTotal) * 100;
  if (memoryUsagePercent > 90) {
    status = 'unhealthy';
    issues.push('High memory usage');
  }

  // Check error rate
  if (metrics.errorRate > 20) {
    status = 'unhealthy';
    issues.push('High error rate');
  }

  // Check average response time
  if (metrics.averageResponseTime > 5000) {
    status = 'degraded';
    issues.push('Slow response times');
  }

  res.status(status === 'healthy' ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    uptime: metrics.uptime,
    metrics: {
      requestCount: metrics.requestCount,
      averageResponseTime: metrics.averageResponseTime,
      errorRate: metrics.errorRate,
      memoryUsage: {
        heapUsed: metrics.memoryUsage.heapUsed,
        heapTotal: metrics.memoryUsage.heapTotal,
        external: metrics.memoryUsage.external,
        rss: metrics.memoryUsage.rss,
      },
      activeConnections: metrics.activeConnections,
    },
    issues,
  });
};

// Database health check
export const databaseHealthCheck = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Simple database query to check connectivity
    await prisma.$queryRaw`SELECT 1`;
    
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: 'Database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
};

// API endpoint metrics
export const getApiMetrics = (req: Request, res: Response, next: NextFunction) => {
  const now = Date.now();
  
  // Group requests by endpoint
  const endpointMetrics = metricsStore.requests.reduce((acc, request) => {
    const key = `${request.method} ${request.url.split('?')[0]}`;
    
    if (!acc[key]) {
      acc[key] = {
        endpoint: key,
        count: 0,
        averageResponseTime: 0,
        errorCount: 0,
        lastRequest: request.timestamp,
      };
    }
    
    acc[key].count++;
    acc[key].averageResponseTime += request.responseTime;
    acc[key].errorCount += request.statusCode >= 400 ? 1 : 0;
    acc[key].lastRequest = request.timestamp > acc[key].lastRequest ? request.timestamp : acc[key].lastRequest;
    
    return acc;
  }, {} as Record<string, any>);

  // Calculate averages
  Object.values(endpointMetrics).forEach((metric: any) => {
    metric.averageResponseTime = Math.round(metric.averageResponseTime / metric.count);
    metric.errorRate = Math.round((metric.errorCount / metric.count) * 100 * 100) / 100;
  });

  // Sort by request count
  const sortedMetrics = Object.values(endpointMetrics).sort((a: any, b: any) => b.count - a.count);

  res.json({
    timestamp: new Date().toISOString(),
    period: 'last 1000 requests',
    endpoints: sortedMetrics,
  });
};

// Real-time metrics WebSocket handler
export const setupMetricsWebSocket = (io: any) => {
  // Send metrics every 30 seconds to connected clients
  setInterval(() => {
    const metrics = getPerformanceMetrics();
    io.emit('metrics', metrics);
  }, 30000);
};

// Request logging for debugging
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  
  console.log(`[${timestamp}] ${req.method} ${req.url} - ${req.ip}`);
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
};

// Memory usage monitoring
export const memoryMonitor = () => {
  setInterval(() => {
    const memoryUsage = process.memoryUsage();
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    
    console.log(`Memory Usage: ${memoryUsagePercent.toFixed(2)}% (${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB)`);
    
    // Force garbage collection if memory usage is high
    if (memoryUsagePercent > 85 && global.gc) {
      console.log('Forcing garbage collection due to high memory usage');
      global.gc();
    }
  }, 60000); // Check every minute
};

// Error tracking middleware
export const errorTracker = (error: any, req: Request, res: Response, next: NextFunction) => {
  // Log error details
  console.error('Error occurred:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
  });

  // Increment error count
  metricsStore.errorCount++;

  // Send error response
  res.status(error.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
  });
};

// Cleanup old metrics
export const cleanupMetrics = () => {
  setInterval(() => {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    metricsStore.requests = metricsStore.requests.filter(
      r => r.timestamp.getTime() > cutoff
    );
  }, 60 * 60 * 1000); // Run every hour
};
