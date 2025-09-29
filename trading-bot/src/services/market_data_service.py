"""
Market Data Service for KaliTrade
Handles real-time market data collection and processing
"""

import asyncio
import logging
import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import ccxt
import websocket
import json

logger = logging.getLogger(__name__)

class MarketDataService:
    """
    Service for collecting and processing market data
    """
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.exchanges = {}
        self.data_cache = {}
        self.is_running = False
        
        # Initialize exchanges
        self._initialize_exchanges()
    
    def _initialize_exchanges(self):
        """Initialize exchange connections"""
        try:
            # Initialize CCXT exchanges
            exchange_configs = self.config.get('exchanges', {})
            
            for exchange_name, exchange_config in exchange_configs.items():
                try:
                    exchange_class = getattr(ccxt, exchange_name)
                    exchange = exchange_class({
                        'apiKey': exchange_config.get('api_key'),
                        'secret': exchange_config.get('secret'),
                        'sandbox': exchange_config.get('sandbox', False),
                        'enableRateLimit': True,
                    })
                    
                    self.exchanges[exchange_name] = exchange
                    logger.info(f"Initialized {exchange_name} exchange")
                    
                except Exception as e:
                    logger.error(f"Failed to initialize {exchange_name}: {e}")
            
            # Add public exchanges for market data
            public_exchanges = ['binance', 'coinbase', 'kraken']
            for exchange_name in public_exchanges:
                if exchange_name not in self.exchanges:
                    try:
                        exchange_class = getattr(ccxt, exchange_name)
                        exchange = exchange_class({
                            'enableRateLimit': True,
                        })
                        self.exchanges[exchange_name] = exchange
                        logger.info(f"Initialized public {exchange_name} exchange")
                    except Exception as e:
                        logger.warning(f"Failed to initialize public {exchange_name}: {e}")
        
        except Exception as e:
            logger.error(f"Error initializing exchanges: {e}")
    
    async def start(self):
        """Start the market data service"""
        try:
            logger.info("Starting Market Data Service...")
            
            # Test exchange connections
            await self._test_connections()
            
            # Start data collection tasks
            asyncio.create_task(self._collect_market_data())
            
            self.is_running = True
            logger.info("Market Data Service started successfully")
            
        except Exception as e:
            logger.error(f"Failed to start Market Data Service: {e}")
            raise
    
    async def stop(self):
        """Stop the market data service"""
        try:
            logger.info("Stopping Market Data Service...")
            
            self.is_running = False
            
            # Close exchange connections
            for exchange in self.exchanges.values():
                try:
                    await exchange.close()
                except:
                    pass
            
            logger.info("Market Data Service stopped")
            
        except Exception as e:
            logger.error(f"Error stopping Market Data Service: {e}")
    
    async def _test_connections(self):
        """Test exchange connections"""
        try:
            for exchange_name, exchange in self.exchanges.items():
                try:
                    # Test connection by fetching ticker
                    ticker = await self._fetch_ticker_safe(exchange, 'BTC/USDT')
                    if ticker:
                        logger.info(f"Connection to {exchange_name} successful")
                    else:
                        logger.warning(f"Connection to {exchange_name} failed")
                except Exception as e:
                    logger.warning(f"Connection test failed for {exchange_name}: {e}")
        
        except Exception as e:
            logger.error(f"Error testing connections: {e}")
    
    async def _fetch_ticker_safe(self, exchange, symbol: str) -> Optional[Dict]:
        """Safely fetch ticker data"""
        try:
            return await asyncio.get_event_loop().run_in_executor(
                None, exchange.fetch_ticker, symbol
            )
        except Exception as e:
            logger.debug(f"Error fetching ticker for {symbol}: {e}")
            return None
    
    async def _collect_market_data(self):
        """Continuously collect market data"""
        while self.is_running:
            try:
                # Collect data for major symbols
                symbols = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'ADA/USDT', 'SOL/USDT']
                
                for symbol in symbols:
                    await self._update_market_data(symbol)
                
                # Wait before next collection cycle
                await asyncio.sleep(5)  # 5-second intervals
                
            except Exception as e:
                logger.error(f"Error in market data collection: {e}")
                await asyncio.sleep(10)  # Wait longer on error
    
    async def _update_market_data(self, symbol: str):
        """Update market data for a symbol"""
        try:
            # Try to get data from the best available exchange
            for exchange_name, exchange in self.exchanges.items():
                try:
                    # Fetch OHLCV data
                    ohlcv = await self._fetch_ohlcv_safe(exchange, symbol, '1h', 100)
                    
                    if ohlcv and len(ohlcv) > 0:
                        # Convert to DataFrame
                        df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
                        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
                        df.set_index('timestamp', inplace=True)
                        
                        # Cache the data
                        self.data_cache[symbol] = {
                            'data': df,
                            'exchange': exchange_name,
                            'last_updated': datetime.now()
                        }
                        
                        logger.debug(f"Updated market data for {symbol} from {exchange_name}")
                        break
                        
                except Exception as e:
                    logger.debug(f"Failed to get data for {symbol} from {exchange_name}: {e}")
                    continue
        
        except Exception as e:
            logger.error(f"Error updating market data for {symbol}: {e}")
    
    async def _fetch_ohlcv_safe(self, exchange, symbol: str, timeframe: str = '1h', limit: int = 100) -> Optional[List]:
        """Safely fetch OHLCV data"""
        try:
            return await asyncio.get_event_loop().run_in_executor(
                None, exchange.fetch_ohlcv, symbol, timeframe, None, limit
            )
        except Exception as e:
            logger.debug(f"Error fetching OHLCV for {symbol}: {e}")
            return None
    
    async def get_market_data(self, symbol: str, timeframe: str = '1h', limit: int = 100) -> Optional[pd.DataFrame]:
        """
        Get market data for a symbol
        """
        try:
            # Check cache first
            if symbol in self.data_cache:
                cached_data = self.data_cache[symbol]
                if datetime.now() - cached_data['last_updated'] < timedelta(minutes=5):
                    return cached_data['data'].tail(limit)
            
            # Fetch fresh data
            await self._update_market_data(symbol)
            
            if symbol in self.data_cache:
                return self.data_cache[symbol]['data'].tail(limit)
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting market data for {symbol}: {e}")
            return None
    
    async def get_current_price(self, symbol: str) -> Optional[float]:
        """Get current price for a symbol"""
        try:
            # Try to get from cache first
            if symbol in self.data_cache:
                df = self.data_cache[symbol]['data']
                if len(df) > 0:
                    return float(df['close'].iloc[-1])
            
            # Fetch fresh data
            for exchange_name, exchange in self.exchanges.items():
                try:
                    ticker = await self._fetch_ticker_safe(exchange, symbol)
                    if ticker and 'last' in ticker:
                        return float(ticker['last'])
                except Exception as e:
                    logger.debug(f"Failed to get price for {symbol} from {exchange_name}: {e}")
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting current price for {symbol}: {e}")
            return None
    
    async def get_orderbook(self, symbol: str, limit: int = 20) -> Optional[Dict[str, List]]:
        """Get orderbook for a symbol"""
        try:
            for exchange_name, exchange in self.exchanges.items():
                try:
                    orderbook = await asyncio.get_event_loop().run_in_executor(
                        None, exchange.fetch_order_book, symbol, limit
                    )
                    
                    if orderbook and 'bids' in orderbook and 'asks' in orderbook:
                        return orderbook
                        
                except Exception as e:
                    logger.debug(f"Failed to get orderbook for {symbol} from {exchange_name}: {e}")
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting orderbook for {symbol}: {e}")
            return None
    
    async def get_recent_trades(self, symbol: str, limit: int = 100) -> Optional[List[Dict]]:
        """Get recent trades for a symbol"""
        try:
            for exchange_name, exchange in self.exchanges.items():
                try:
                    trades = await asyncio.get_event_loop().run_in_executor(
                        None, exchange.fetch_trades, symbol, None, limit
                    )
                    
                    if trades and len(trades) > 0:
                        return trades
                        
                except Exception as e:
                    logger.debug(f"Failed to get trades for {symbol} from {exchange_name}: {e}")
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting recent trades for {symbol}: {e}")
            return None
    
    async def get_24h_stats(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get 24-hour statistics for a symbol"""
        try:
            for exchange_name, exchange in self.exchanges.items():
                try:
                    ticker = await self._fetch_ticker_safe(exchange, symbol)
                    
                    if ticker:
                        return {
                            'symbol': symbol,
                            'last_price': ticker.get('last'),
                            'bid': ticker.get('bid'),
                            'ask': ticker.get('ask'),
                            'high': ticker.get('high'),
                            'low': ticker.get('low'),
                            'volume': ticker.get('baseVolume'),
                            'quote_volume': ticker.get('quoteVolume'),
                            'price_change': ticker.get('change'),
                            'price_change_percent': ticker.get('percentage'),
                            'timestamp': ticker.get('timestamp')
                        }
                        
                except Exception as e:
                    logger.debug(f"Failed to get 24h stats for {symbol} from {exchange_name}: {e}")
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting 24h stats for {symbol}: {e}")
            return None
    
    def get_available_symbols(self) -> List[str]:
        """Get list of available trading symbols"""
        try:
            symbols = set()
            
            for exchange in self.exchanges.values():
                try:
                    markets = exchange.load_markets()
                    for symbol in markets.keys():
                        if '/USDT' in symbol or '/BTC' in symbol or '/ETH' in symbol:
                            symbols.add(symbol)
                except Exception as e:
                    logger.debug(f"Error loading markets from {exchange.id}: {e}")
                    continue
            
            return sorted(list(symbols))
            
        except Exception as e:
            logger.error(f"Error getting available symbols: {e}")
            return []
    
    def is_running(self) -> bool:
        """Check if service is running"""
        return self.is_running
    
    def get_cache_status(self) -> Dict[str, Any]:
        """Get cache status information"""
        try:
            status = {}
            
            for symbol, data in self.data_cache.items():
                status[symbol] = {
                    'exchange': data['exchange'],
                    'last_updated': data['last_updated'].isoformat(),
                    'data_points': len(data['data']),
                    'age_minutes': (datetime.now() - data['last_updated']).total_seconds() / 60
                }
            
            return status
            
        except Exception as e:
            logger.error(f"Error getting cache status: {e}")
            return {}
