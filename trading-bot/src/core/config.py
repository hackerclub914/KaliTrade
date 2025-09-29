"""
Configuration management for KaliTrade Bot
"""

import os
from typing import Dict, List, Optional
from dataclasses import dataclass
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

@dataclass
class Config:
    """Configuration class for KaliTrade Bot"""
    
    # Application settings
    DEBUG: bool = os.getenv('DEBUG', 'false').lower() == 'true'
    NODE_ENV: str = os.getenv('NODE_ENV', 'development')
    
    # API settings
    API_HOST: str = os.getenv('TRADING_BOT_HOST', '0.0.0.0')
    API_PORT: int = int(os.getenv('TRADING_BOT_PORT', '8000'))
    
    # Database settings
    DATABASE_URL: str = os.getenv('DATABASE_URL', 'postgresql://localhost:5432/kalitrade')
    REDIS_URL: str = os.getenv('REDIS_URL', 'redis://localhost:6379')
    
    # Exchange API settings
    BINANCE_API_URL: str = os.getenv('BINANCE_API_URL', 'https://api.binance.com')
    BINANCE_OAUTH_CLIENT_ID: str = os.getenv('BINANCE_OAUTH_CLIENT_ID', '')
    BINANCE_OAUTH_CLIENT_SECRET: str = os.getenv('BINANCE_OAUTH_CLIENT_SECRET', '')
    
    COINBASE_API_URL: str = os.getenv('COINBASE_API_URL', 'https://api.pro.coinbase.com')
    COINBASE_OAUTH_CLIENT_ID: str = os.getenv('COINBASE_OAUTH_CLIENT_ID', '')
    COINBASE_OAUTH_CLIENT_SECRET: str = os.getenv('COINBASE_OAUTH_CLIENT_SECRET', '')
    
    KRAKEN_API_URL: str = os.getenv('KRAKEN_API_URL', 'https://api.kraken.com')
    KRAKEN_OAUTH_CLIENT_ID: str = os.getenv('KRAKEN_OAUTH_CLIENT_ID', '')
    KRAKEN_OAUTH_CLIENT_SECRET: str = os.getenv('KRAKEN_OAUTH_CLIENT_SECRET', '')
    
    # Market data APIs
    COINGECKO_API_KEY: str = os.getenv('COINGECKO_API_KEY', '')
    COINMARKETCAP_API_KEY: str = os.getenv('COINMARKETCAP_API_KEY', '')
    ALPHA_VANTAGE_API_KEY: str = os.getenv('ALPHA_VANTAGE_API_KEY', '')
    
    # AI Services
    OPENAI_API_KEY: str = os.getenv('OPENAI_API_KEY', '')
    HUGGINGFACE_API_KEY: str = os.getenv('HUGGINGFACE_API_KEY', '')
    ANTHROPIC_API_KEY: str = os.getenv('ANTHROPIC_API_KEY', '')
    
    # Trading settings
    MAX_POSITION_SIZE: float = float(os.getenv('MAX_POSITION_SIZE', '0.1'))
    DEFAULT_LEVERAGE: float = float(os.getenv('DEFAULT_LEVERAGE', '1.0'))
    RISK_TOLERANCE: str = os.getenv('RISK_TOLERANCE', 'medium')
    
    # Security
    ENCRYPTION_KEY: str = os.getenv('ENCRYPTION_KEY', '')
    RATE_LIMIT_REQUESTS: int = int(os.getenv('RATE_LIMIT_REQUESTS', '100'))
    RATE_LIMIT_WINDOW: int = int(os.getenv('RATE_LIMIT_WINDOW', '900000'))  # 15 minutes
    
    # Logging
    LOG_LEVEL: str = os.getenv('LOG_LEVEL', 'info')
    LOG_FILE_PATH: str = os.getenv('LOG_FILE_PATH', './logs/kalitrade.log')
    
    # Development flags
    ENABLE_MOCK_DATA: bool = os.getenv('ENABLE_MOCK_DATA', 'false').lower() == 'true'
    ENABLE_PAPER_TRADING: bool = os.getenv('ENABLE_PAPER_TRADING', 'true').lower() == 'true'
    ENABLE_BACKTESTING: bool = os.getenv('ENABLE_BACKTESTING', 'true').lower() == 'true'
    
    # Trading bot specific settings
    DEFAULT_SYMBOLS: List[str] = None
    SUPPORTED_EXCHANGES: List[str] = None
    DEFAULT_STRATEGIES: List[str] = None
    
    # Risk management
    MAX_DAILY_LOSS: float = 0.05  # 5% of portfolio
    MAX_DRAWDOWN: float = 0.10    # 10% maximum drawdown
    STOP_LOSS_PERCENTAGE: float = 0.02  # 2% stop loss
    
    # AI Model settings
    MODEL_UPDATE_INTERVAL: int = 3600  # Update models every hour
    PREDICTION_CONFIDENCE_THRESHOLD: float = 0.7
    SENTIMENT_ANALYSIS_INTERVAL: int = 300  # 5 minutes
    
    def __post_init__(self):
        """Initialize default lists"""
        if self.DEFAULT_SYMBOLS is None:
            self.DEFAULT_SYMBOLS = [
                'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'ADA/USDT', 'SOL/USDT',
                'XRP/USDT', 'DOT/USDT', 'MATIC/USDT', 'AVAX/USDT', 'LINK/USDT'
            ]
        
        if self.SUPPORTED_EXCHANGES is None:
            self.SUPPORTED_EXCHANGES = [
                'binance', 'coinbase', 'kraken', 'kucoin', 'gateio'
            ]
        
        if self.DEFAULT_STRATEGIES is None:
            self.DEFAULT_STRATEGIES = [
                'moving_average_crossover',
                'rsi_divergence',
                'bollinger_bands',
                'macd_signal',
                'grid_trading',
                'dca',
                'arbitrage',
                'market_making',
                'custom_ai',
                'sentiment_analysis'
            ]
    
    def get_exchange_config(self, exchange: str) -> Dict[str, str]:
        """Get configuration for a specific exchange"""
        config_map = {
            'binance': {
                'url': self.BINANCE_API_URL,
                'client_id': self.BINANCE_OAUTH_CLIENT_ID,
                'client_secret': self.BINANCE_OAUTH_CLIENT_SECRET
            },
            'coinbase': {
                'url': self.COINBASE_API_URL,
                'client_id': self.COINBASE_OAUTH_CLIENT_ID,
                'client_secret': self.COINBASE_OAUTH_CLIENT_SECRET
            },
            'kraken': {
                'url': self.KRAKEN_API_URL,
                'client_id': self.KRAKEN_OAUTH_CLIENT_ID,
                'client_secret': self.KRAKEN_OAUTH_CLIENT_SECRET
            }
        }
        return config_map.get(exchange, {})
    
    def is_production(self) -> bool:
        """Check if running in production mode"""
        return self.NODE_ENV.lower() == 'production'
    
    def is_development(self) -> bool:
        """Check if running in development mode"""
        return self.NODE_ENV.lower() == 'development'
    
    def validate_config(self) -> bool:
        """Validate configuration settings"""
        required_fields = [
            'DATABASE_URL',
            'REDIS_URL'
        ]
        
        for field in required_fields:
            if not getattr(self, field):
                raise ValueError(f"Required configuration field {field} is not set")
        
        return True

# Global config instance
config = Config()
