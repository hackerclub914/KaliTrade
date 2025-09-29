import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string[];
  authUrl: string;
  tokenUrl: string;
  apiBaseUrl: string;
}

interface OAuth2Tokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  scope?: string;
}

interface ExchangeUserInfo {
  id: string;
  email?: string;
  username?: string;
  verified: boolean;
  permissions: string[];
}

export class ExchangeOAuthService {
  private configs: Map<string, OAuth2Config>;
  private apiClients: Map<string, AxiosInstance>;

  constructor() {
    this.configs = new Map();
    this.apiClients = new Map();
    this.initializeExchangeConfigs();
  }

  private initializeExchangeConfigs() {
    // Binance OAuth2 Configuration
    this.configs.set('binance', {
      clientId: process.env.BINANCE_OAUTH_CLIENT_ID || '',
      clientSecret: process.env.BINANCE_OAUTH_CLIENT_SECRET || '',
      redirectUri: `${process.env.FRONTEND_URL}/exchange/callback/binance`,
      scope: ['read', 'trading'],
      authUrl: 'https://accounts.binance.com/oauth/authorize',
      tokenUrl: 'https://api.binance.com/oauth/token',
      apiBaseUrl: 'https://api.binance.com'
    });

    // Coinbase Pro OAuth2 Configuration
    this.configs.set('coinbase', {
      clientId: process.env.COINBASE_OAUTH_CLIENT_ID || '',
      clientSecret: process.env.COINBASE_OAUTH_CLIENT_SECRET || '',
      redirectUri: `${process.env.FRONTEND_URL}/exchange/callback/coinbase`,
      scope: ['wallet:accounts:read', 'wallet:transactions:read', 'wallet:orders:read', 'wallet:orders:create'],
      authUrl: 'https://www.coinbase.com/oauth/authorize',
      tokenUrl: 'https://api.coinbase.com/oauth/token',
      apiBaseUrl: 'https://api.pro.coinbase.com'
    });

    // Kraken OAuth2 Configuration (Note: Kraken doesn't have OAuth2, using API keys instead)
    this.configs.set('kraken', {
      clientId: process.env.KRAKEN_API_KEY || '',
      clientSecret: process.env.KRAKEN_API_SECRET || '',
      redirectUri: `${process.env.FRONTEND_URL}/exchange/callback/kraken`,
      scope: ['read', 'trade'],
      authUrl: 'https://auth.kraken.com/connect/authorize',
      tokenUrl: 'https://api.kraken.com/0/private/GetWebSocketsToken',
      apiBaseUrl: 'https://api.kraken.com'
    });

    // Initialize API clients
    this.initializeApiClients();
  }

  private initializeApiClients() {
    this.configs.forEach((config, exchange) => {
      const client = axios.create({
        baseURL: config.apiBaseUrl,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Add request interceptor for authentication
      client.interceptors.request.use(async (config) => {
        const token = await this.getValidAccessToken(exchange);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      });

      this.apiClients.set(exchange, client);
    });
  }

  /**
   * Generate OAuth2 authorization URL for a specific exchange
   */
  generateAuthUrl(exchange: string, userId: string): string {
    const config = this.configs.get(exchange);
    if (!config) {
      throw new Error(`Exchange ${exchange} not supported`);
    }

    const state = this.generateState(userId, exchange);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scope.join(' '),
      state: state,
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeCodeForTokens(exchange: string, code: string, state: string): Promise<OAuth2Tokens> {
    const config = this.configs.get(exchange);
    if (!config) {
      throw new Error(`Exchange ${exchange} not supported`);
    }

    // Verify state parameter
    const stateData = this.verifyState(state);
    if (!stateData) {
      throw new Error('Invalid state parameter');
    }

    try {
      let tokenResponse;
      
      if (exchange === 'binance') {
        tokenResponse = await this.exchangeBinanceTokens(code, config);
      } else if (exchange === 'coinbase') {
        tokenResponse = await this.exchangeCoinbaseTokens(code, config);
      } else if (exchange === 'kraken') {
        // Kraken uses API keys, not OAuth2
        tokenResponse = await this.handleKrakenAuth(config);
      } else {
        throw new Error(`OAuth2 not implemented for ${exchange}`);
      }

      // Store tokens in database
      await this.storeTokens(stateData.userId, exchange, tokenResponse);

      return tokenResponse;
    } catch (error) {
      console.error(`Error exchanging tokens for ${exchange}:`, error);
      throw new Error(`Failed to authenticate with ${exchange}`);
    }
  }

  private async exchangeBinanceTokens(code: string, config: OAuth2Config): Promise<OAuth2Tokens> {
    const params = {
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    };

    const response = await axios.post(config.tokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
      tokenType: response.data.token_type,
      scope: response.data.scope,
    };
  }

  private async exchangeCoinbaseTokens(code: string, config: OAuth2Config): Promise<OAuth2Tokens> {
    const params = {
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    };

    const response = await axios.post(config.tokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
      tokenType: response.data.token_type,
    };
  }

  private async handleKrakenAuth(config: OAuth2Config): Promise<OAuth2Tokens> {
    // Kraken doesn't use OAuth2, so we'll create a mock token for API key authentication
    return {
      accessToken: config.clientId, // API Key
      refreshToken: config.clientSecret, // API Secret
      expiresIn: 3600, // 1 hour
      tokenType: 'Bearer',
    };
  }

  /**
   * Get user information from exchange
   */
  async getExchangeUserInfo(exchange: string, userId: string): Promise<ExchangeUserInfo> {
    const accessToken = await this.getValidAccessToken(exchange);
    if (!accessToken) {
      throw new Error(`No valid access token for ${exchange}`);
    }

    try {
      if (exchange === 'binance') {
        return await this.getBinanceUserInfo(accessToken);
      } else if (exchange === 'coinbase') {
        return await this.getCoinbaseUserInfo(accessToken);
      } else if (exchange === 'kraken') {
        return await this.getKrakenUserInfo(accessToken);
      } else {
        throw new Error(`User info not implemented for ${exchange}`);
      }
    } catch (error) {
      console.error(`Error getting user info from ${exchange}:`, error);
      throw new Error(`Failed to get user info from ${exchange}`);
    }
  }

  private async getBinanceUserInfo(accessToken: string): Promise<ExchangeUserInfo> {
    const response = await axios.get('https://api.binance.com/api/v3/account', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    return {
      id: response.data.accountType,
      verified: response.data.accountType === 'SPOT',
      permissions: ['read', 'trading'],
    };
  }

  private async getCoinbaseUserInfo(accessToken: string): Promise<ExchangeUserInfo> {
    const response = await axios.get('https://api.coinbase.com/v2/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    return {
      id: response.data.data.id,
      email: response.data.data.email,
      username: response.data.data.name,
      verified: response.data.data.verified,
      permissions: ['read', 'trading'],
    };
  }

  private async getKrakenUserInfo(apiKey: string): Promise<ExchangeUserInfo> {
    // Kraken doesn't provide user info endpoint, return mock data
    return {
      id: 'kraken_user',
      verified: true,
      permissions: ['read', 'trading'],
    };
  }

  /**
   * Get account balance from exchange
   */
  async getAccountBalance(exchange: string, userId: string): Promise<any> {
    const accessToken = await this.getValidAccessToken(exchange);
    if (!accessToken) {
      throw new Error(`No valid access token for ${exchange}`);
    }

    try {
      if (exchange === 'binance') {
        return await this.getBinanceBalance(accessToken);
      } else if (exchange === 'coinbase') {
        return await this.getCoinbaseBalance(accessToken);
      } else if (exchange === 'kraken') {
        return await this.getKrakenBalance(accessToken);
      } else {
        throw new Error(`Balance retrieval not implemented for ${exchange}`);
      }
    } catch (error) {
      console.error(`Error getting balance from ${exchange}:`, error);
      throw new Error(`Failed to get balance from ${exchange}`);
    }
  }

  private async getBinanceBalance(accessToken: string): Promise<any> {
    const response = await axios.get('https://api.binance.com/api/v3/account', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    return response.data.balances.filter((balance: any) => parseFloat(balance.free) > 0);
  }

  private async getCoinbaseBalance(accessToken: string): Promise<any> {
    const response = await axios.get('https://api.coinbase.com/v2/accounts', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    return response.data.data;
  }

  private async getKrakenBalance(apiKey: string): Promise<any> {
    // Kraken balance retrieval would require signed requests
    // For now, return mock data
    return [
      { asset: 'BTC', free: '0.001', locked: '0.000' },
      { asset: 'ETH', free: '0.01', locked: '0.00' },
    ];
  }

  /**
   * Place an order on the exchange
   */
  async placeOrder(exchange: string, userId: string, orderData: any): Promise<any> {
    const accessToken = await this.getValidAccessToken(exchange);
    if (!accessToken) {
      throw new Error(`No valid access token for ${exchange}`);
    }

    try {
      if (exchange === 'binance') {
        return await this.placeBinanceOrder(accessToken, orderData);
      } else if (exchange === 'coinbase') {
        return await this.placeCoinbaseOrder(accessToken, orderData);
      } else if (exchange === 'kraken') {
        return await this.placeKrakenOrder(accessToken, orderData);
      } else {
        throw new Error(`Order placement not implemented for ${exchange}`);
      }
    } catch (error) {
      console.error(`Error placing order on ${exchange}:`, error);
      throw new Error(`Failed to place order on ${exchange}`);
    }
  }

  private async placeBinanceOrder(accessToken: string, orderData: any): Promise<any> {
    const params = {
      symbol: orderData.symbol,
      side: orderData.side.toUpperCase(),
      type: orderData.type.toUpperCase(),
      quantity: orderData.quantity,
      price: orderData.price,
      timeInForce: 'GTC',
    };

    const response = await axios.post('https://api.binance.com/api/v3/order', params, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    return response.data;
  }

  private async placeCoinbaseOrder(accessToken: string, orderData: any): Promise<any> {
    const params = {
      product_id: orderData.symbol,
      side: orderData.side,
      type: orderData.type,
      size: orderData.quantity,
      price: orderData.price,
    };

    const response = await axios.post('https://api.pro.coinbase.com/orders', params, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    return response.data;
  }

  private async placeKrakenOrder(apiKey: string, orderData: any): Promise<any> {
    // Kraken order placement would require signed requests
    // For now, return mock data
    return {
      orderId: `kraken_${Date.now()}`,
      status: 'pending',
      symbol: orderData.symbol,
      side: orderData.side,
      quantity: orderData.quantity,
      price: orderData.price,
    };
  }

  /**
   * Get order status from exchange
   */
  async getOrderStatus(exchange: string, userId: string, orderId: string): Promise<any> {
    const accessToken = await this.getValidAccessToken(exchange);
    if (!accessToken) {
      throw new Error(`No valid access token for ${exchange}`);
    }

    try {
      if (exchange === 'binance') {
        return await this.getBinanceOrderStatus(accessToken, orderId);
      } else if (exchange === 'coinbase') {
        return await this.getCoinbaseOrderStatus(accessToken, orderId);
      } else if (exchange === 'kraken') {
        return await this.getKrakenOrderStatus(accessToken, orderId);
      } else {
        throw new Error(`Order status retrieval not implemented for ${exchange}`);
      }
    } catch (error) {
      console.error(`Error getting order status from ${exchange}:`, error);
      throw new Error(`Failed to get order status from ${exchange}`);
    }
  }

  private async getBinanceOrderStatus(accessToken: string, orderId: string): Promise<any> {
    const response = await axios.get(`https://api.binance.com/api/v3/order?orderId=${orderId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    return response.data;
  }

  private async getCoinbaseOrderStatus(accessToken: string, orderId: string): Promise<any> {
    const response = await axios.get(`https://api.pro.coinbase.com/orders/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    return response.data;
  }

  private async getKrakenOrderStatus(apiKey: string, orderId: string): Promise<any> {
    // Kraken order status would require signed requests
    // For now, return mock data
    return {
      orderId: orderId,
      status: 'filled',
      symbol: 'BTC/USDT',
      side: 'buy',
      quantity: '0.001',
      price: '45000',
    };
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(exchange: string, userId: string): Promise<OAuth2Tokens> {
    const connection = await prisma.exchangeConnection.findFirst({
      where: { userId, exchangeName: exchange },
    });

    if (!connection || !connection.refreshToken) {
      throw new Error(`No refresh token available for ${exchange}`);
    }

    const config = this.configs.get(exchange);
    if (!config) {
      throw new Error(`Exchange ${exchange} not supported`);
    }

    try {
      let tokenResponse;

      if (exchange === 'binance') {
        tokenResponse = await this.refreshBinanceToken(connection.refreshToken, config);
      } else if (exchange === 'coinbase') {
        tokenResponse = await this.refreshCoinbaseToken(connection.refreshToken, config);
      } else {
        throw new Error(`Token refresh not implemented for ${exchange}`);
      }

      // Update tokens in database
      await prisma.exchangeConnection.update({
        where: { id: connection.id },
        data: {
          accessToken: tokenResponse.accessToken,
          refreshToken: tokenResponse.refreshToken || connection.refreshToken,
          expiresAt: new Date(Date.now() + tokenResponse.expiresIn * 1000),
        },
      });

      return tokenResponse;
    } catch (error) {
      console.error(`Error refreshing token for ${exchange}:`, error);
      throw new Error(`Failed to refresh token for ${exchange}`);
    }
  }

  private async refreshBinanceToken(refreshToken: string, config: OAuth2Config): Promise<OAuth2Tokens> {
    const params = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    };

    const response = await axios.post(config.tokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
      tokenType: response.data.token_type,
    };
  }

  private async refreshCoinbaseToken(refreshToken: string, config: OAuth2Config): Promise<OAuth2Tokens> {
    const params = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    };

    const response = await axios.post(config.tokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
      tokenType: response.data.token_type,
    };
  }

  /**
   * Store tokens in database
   */
  private async storeTokens(userId: string, exchange: string, tokens: OAuth2Tokens): Promise<void> {
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

    await prisma.exchangeConnection.upsert({
      where: { userId_exchangeName: { userId, exchangeName: exchange } },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: expiresAt,
        isActive: true,
      },
      create: {
        userId,
        exchangeName: exchange,
        exchangeId: `user_${userId}_${exchange}`,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: expiresAt,
        permissions: tokens.scope ? tokens.scope.split(' ') : ['read'],
        isActive: true,
      },
    });
  }

  /**
   * Get valid access token from database
   */
  private async getValidAccessToken(exchange: string, userId?: string): Promise<string | null> {
    const connection = await prisma.exchangeConnection.findFirst({
      where: { 
        exchangeName: exchange,
        ...(userId && { userId }),
        isActive: true,
      },
    });

    if (!connection) {
      return null;
    }

    // Check if token is expired
    if (connection.expiresAt && connection.expiresAt < new Date()) {
      // Try to refresh token
      try {
        await this.refreshAccessToken(exchange, connection.userId);
        // Fetch updated connection
        const updatedConnection = await prisma.exchangeConnection.findFirst({
          where: { id: connection.id },
        });
        return updatedConnection?.accessToken || null;
      } catch (error) {
        console.error(`Failed to refresh token for ${exchange}:`, error);
        return null;
      }
    }

    return connection.accessToken;
  }

  /**
   * Generate state parameter for OAuth2 flow
   */
  private generateState(userId: string, exchange: string): string {
    const stateData = {
      userId,
      exchange,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex'),
    };

    const state = Buffer.from(JSON.stringify(stateData)).toString('base64');
    
    // Store state in database for verification
    prisma.oAuthState.create({
      data: {
        state,
        userId,
        exchange,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    }).catch(console.error);

    return state;
  }

  /**
   * Verify state parameter
   */
  private verifyState(state: string): { userId: string; exchange: string } | null {
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      
      // Verify state exists in database and is not expired
      // For now, we'll do basic validation
      if (stateData.userId && stateData.exchange && stateData.timestamp) {
        const age = Date.now() - stateData.timestamp;
        if (age < 10 * 60 * 1000) { // 10 minutes
          return {
            userId: stateData.userId,
            exchange: stateData.exchange,
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error verifying state:', error);
      return null;
    }
  }

  /**
   * Disconnect exchange account
   */
  async disconnectExchange(userId: string, exchange: string): Promise<void> {
    await prisma.exchangeConnection.updateMany({
      where: { userId, exchangeName: exchange },
      data: { isActive: false },
    });
  }

  /**
   * Get supported exchanges
   */
  getSupportedExchanges(): string[] {
    return Array.from(this.configs.keys());
  }
}
