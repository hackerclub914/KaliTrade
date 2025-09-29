#!/usr/bin/env python3
"""
KaliTrade Advanced AI Trading Bot - Simplified Version
Main entry point for the trading bot engine
"""

import asyncio
import logging
import sys
from pathlib import Path
from typing import Dict, Any

# Add src to path
sys.path.append(str(Path(__file__).parent / "src"))

from src.core.config import Config
from src.services.ai_service import AIService
from src.services.market_data_service import MarketDataService
from src.services.risk_manager import RiskManager
from src.strategies.advanced_ai_strategy import AdvancedAIStrategy

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('trading_bot.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

class KaliTradeBot:
    """
    Main KaliTrade trading bot class
    """
    
    def __init__(self):
        self.config = None
        self.ai_strategy = None
        self.is_running = False
        self.trading_symbols = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'ADA/USDT', 'SOL/USDT']
        
    async def start(self):
        """Start the trading bot"""
        try:
            logger.info("🚀 Starting KaliTrade Advanced Crypto Trading Bot...")
            
            # Load configuration
            self.config = Config()
            logger.info("✅ Configuration loaded successfully")
            
            # Initialize and start AI strategy
            strategy_config = {
                'min_confidence': 0.6,
                'max_position_size': 0.1,
                'stop_loss_pct': 0.05,
                'take_profit_pct': 0.15,
                'exchanges': {
                    'binance': {
                        'api_key': '',
                        'secret': '',
                        'sandbox': True
                    }
                }
            }
            
            self.ai_strategy = AdvancedAIStrategy(strategy_config)
            await self.ai_strategy.start()
            logger.info("✅ AI Strategy initialized successfully")
            
            self.is_running = True
            
            # Start main trading loop
            await self._run_trading_loop()
            
        except Exception as e:
            logger.error(f"❌ Failed to start trading bot: {e}")
            raise
    
    async def stop(self):
        """Stop the trading bot"""
        try:
            logger.info("🛑 Stopping KaliTrade Trading Bot...")
            
            self.is_running = False
            
            if self.ai_strategy:
                await self.ai_strategy.stop()
            
            logger.info("✅ KaliTrade Trading Bot stopped successfully")
            
        except Exception as e:
            logger.error(f"❌ Error stopping trading bot: {e}")
    
    async def _run_trading_loop(self):
        """Main trading loop"""
        try:
            logger.info("🔄 Starting main trading loop...")
            
            while self.is_running:
                try:
                    # Analyze each trading symbol
                    for symbol in self.trading_symbols:
                        await self._analyze_and_trade(symbol)
                    
                    # Wait before next analysis cycle
                    await asyncio.sleep(300)  # 5-minute intervals
                    
                except Exception as e:
                    logger.error(f"❌ Error in trading loop: {e}")
                    await asyncio.sleep(60)  # Wait longer on error
            
        except Exception as e:
            logger.error(f"❌ Fatal error in trading loop: {e}")
            raise
    
    async def _analyze_and_trade(self, symbol: str):
        """Analyze market and generate trading signals"""
        try:
            logger.info(f"📊 Analyzing {symbol}...")
            
            # Generate trading signal
            signal = await self.ai_strategy.generate_signal(symbol)
            
            # Log signal details
            logger.info(f"🎯 {symbol} Signal: {signal.signal_type.value.upper()} "
                       f"(Confidence: {signal.confidence:.2f})")
            logger.info(f"💭 Reasoning: {signal.reasoning}")
            
            # Execute trade if signal is strong enough
            if signal.confidence > 0.7:
                await self._execute_trade(symbol, signal)
            else:
                logger.info(f"⏸️ Signal confidence too low for {symbol}, holding position")
            
        except Exception as e:
            logger.error(f"❌ Error analyzing {symbol}: {e}")
    
    async def _execute_trade(self, symbol: str, signal):
        """Execute a trade based on signal"""
        try:
            logger.info(f"💰 Executing {signal.signal_type.value} trade for {symbol}...")
            
            # In a real implementation, this would:
            # 1. Place orders on exchanges
            # 2. Update position tracking
            # 3. Set stop losses and take profits
            # 4. Log trade details
            
            # For now, just log the trade
            logger.info(f"✅ Trade executed: {signal.signal_type.value} {symbol} "
                       f"at confidence {signal.confidence:.2f}")
            
            if signal.price_target:
                logger.info(f"🎯 Price target: {signal.price_target}")
            if signal.stop_loss:
                logger.info(f"🛡️ Stop loss: {signal.stop_loss}")
            
        except Exception as e:
            logger.error(f"❌ Error executing trade for {symbol}: {e}")
    
    def get_performance_metrics(self) -> Dict[str, Any]:
        """Get current performance metrics"""
        if self.ai_strategy:
            return self.ai_strategy.get_performance_metrics()
        return {}
    
    def get_current_positions(self) -> Dict[str, Any]:
        """Get current positions"""
        if self.ai_strategy:
            return self.ai_strategy.get_current_positions()
        return {}

async def main():
    """Main entry point"""
    bot = KaliTradeBot()
    
    try:
        await bot.start()
        
    except KeyboardInterrupt:
        logger.info("🛑 Received shutdown signal")
        
    except Exception as e:
        logger.error(f"❌ Unexpected error: {e}")
        
    finally:
        await bot.stop()
        logger.info("👋 KaliTrade Trading Bot shutdown complete")

if __name__ == "__main__":
    asyncio.run(main())
