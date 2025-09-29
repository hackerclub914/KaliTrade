import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Rate limiting configurations
export const createRateLimit = (windowMs: number, max: number, message: string) => {
  return rateLimit({
    windowMs,
    max,
    message: { success: false, error: message },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// General API rate limit
export const apiRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests per window
  'Too many requests from this IP, please try again later.'
);

// Authentication rate limit (stricter)
export const authRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  5, // 5 login attempts per window
  'Too many authentication attempts, please try again later.'
);

// Trading operations rate limit
export const tradingRateLimit = createRateLimit(
  60 * 1000, // 1 minute
  10, // 10 trading operations per minute
  'Too many trading requests, please slow down.'
);

// Exchange API rate limit
export const exchangeRateLimit = createRateLimit(
  60 * 1000, // 1 minute
  20, // 20 exchange API calls per minute
  'Too many exchange API requests, please slow down.'
);

// Security headers middleware
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "https:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// IP whitelist middleware
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP as string)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied from this IP address',
      });
    }
    
    next();
  };
};

// Request size limit middleware
export const requestSizeLimit = (limit: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    const limitBytes = parseInt(limit.replace(/[^0-9]/g, '')) * (limit.includes('mb') ? 1024 * 1024 : 1024);
    
    if (contentLength > limitBytes) {
      return res.status(413).json({
        success: false,
        error: 'Request entity too large',
      });
    }
    
    next();
  };
};

// SQL injection protection middleware
export const sqlInjectionProtection = (req: Request, res: Response, next: NextFunction) => {
  const sqlInjectionPatterns = [
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
    /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
    /((\%27)|(\'))union/i,
    /exec(\s|\+)+(s|x)p\w+/i,
  ];

  const checkForSqlInjection = (obj: any): boolean => {
    if (typeof obj === 'string') {
      return sqlInjectionPatterns.some(pattern => pattern.test(obj));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      return Object.values(obj).some(checkForSqlInjection);
    }
    
    return false;
  };

  if (checkForSqlInjection(req.body) || checkForSqlInjection(req.query) || checkForSqlInjection(req.params)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request data detected',
    });
  }
  
  next();
};

// XSS protection middleware
export const xssProtection = (req: Request, res: Response, next: NextFunction) => {
  const xssPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<[^>]*>/gi,
  ];

  const sanitizeInput = (obj: any): any => {
    if (typeof obj === 'string') {
      let sanitized = obj;
      xssPatterns.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '');
      });
      return sanitized;
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const sanitized: any = {};
      Object.keys(obj).forEach(key => {
        sanitized[key] = sanitizeInput(obj[key]);
      });
      return sanitized;
    }
    
    return obj;
  };

  req.body = sanitizeInput(req.body);
  req.query = sanitizeInput(req.query);
  req.params = sanitizeInput(req.params);
  
  next();
};

// API key validation middleware
export const validateApiKey = async (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required',
    });
  }

  try {
    const keyRecord = await prisma.apiKey.findFirst({
      where: {
        key: apiKey,
        isActive: true,
      },
    });

    if (!keyRecord) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
      });
    }

    // Check if key has expired (if expiration is implemented)
    if (keyRecord.createdAt && keyRecord.createdAt < new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)) {
      return res.status(401).json({
        success: false,
        error: 'API key expired',
      });
    }

    // Attach key info to request for later use
    (req as any).apiKey = keyRecord;
    next();
  } catch (error) {
    console.error('API key validation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

// Request logging middleware for security monitoring
export const securityLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'Unknown';
  
  // Log suspicious activities
  const suspiciousPatterns = [
    /admin/i,
    /script/i,
    /union/i,
    /select/i,
    /drop/i,
    /delete/i,
    /insert/i,
    /update/i,
    /exec/i,
    /cmd/i,
    /\.\.\//i,
  ];

  const requestData = JSON.stringify({ ...req.body, ...req.query, ...req.params });
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(requestData));

  if (isSuspicious) {
    console.warn(`Suspicious request detected:`, {
      ip: clientIP,
      method: req.method,
      url: req.url,
      userAgent,
      timestamp: new Date().toISOString(),
      data: requestData,
    });
  }

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // Log failed requests or slow requests
    if (res.statusCode >= 400 || duration > 5000) {
      console.warn(`Security event:`, {
        ip: clientIP,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        userAgent,
        timestamp: new Date().toISOString(),
      });
    }
  });

  next();
};

// CORS configuration for security
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
};

// Session security middleware
export const sessionSecurity = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (token) {
    try {
      // Check session validity
      const session = await prisma.session.findFirst({
        where: {
          token,
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      if (!session) {
        return res.status(401).json({
          success: false,
          error: 'Session expired or invalid',
        });
      }

      // Check for concurrent sessions (optional security measure)
      const userSessions = await prisma.session.findMany({
        where: {
          userId: session.userId,
          expiresAt: {
            gt: new Date(),
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // If user has more than 5 active sessions, invalidate oldest ones
      if (userSessions.length > 5) {
        const sessionsToDelete = userSessions.slice(5);
        await prisma.session.deleteMany({
          where: {
            id: {
              in: sessionsToDelete.map(s => s.id),
            },
          },
        });
      }
    } catch (error) {
      console.error('Session security check error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
  
  next();
};
