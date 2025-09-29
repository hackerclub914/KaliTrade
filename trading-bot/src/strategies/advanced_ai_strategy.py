"""
Advanced AI Strategy with DataFrame fixes
"""

import asyncio
import logging
import pandas as pd
import numpy as np
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from enum import Enum

from ..services.ai_service import AIService
from ..services.market_data_service import MarketDataService
from ..services.risk_manager import RiskManager

logger = logging.getLogger(__name__)

class SignalType(Enum):
    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"

@dataclass
class TradingSignal:
    signal_type: SignalType
    confidence: float
    reasoning: str
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    position_size: Optional[float] = None

@dataclass
class MarketCondition:
    trend: str
    volatility: float
    volume_profile: str
    sentiment: float
    macro_conditions: str

class AdvancedAIStrategy:
    """Advanced AI-powered trading strategy using ensemble methods"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.ai_service = AIService(config)
        self.market_data_service = None
        self.risk_manager = None
        
        # Strategy parameters
        self.min_confidence = config.get('min_confidence', 0.6)
        self.max_position_size = config.get('max_position_size', 0.1)  # 10% of portfolio
        self.stop_loss_pct = config.get('stop_loss_pct', 0.05)  # 5% stop loss
        self.take_profit_pct = config.get('take_profit_pct', 0.15)  # 15% take profit
        
        # Model ensemble weights
        self.ensemble_weights = {
            'sentiment': 0.25,
            'technical': 0.35,
            'microstructure': 0.20,
            'macro': 0.20
        }
        
        # Performance tracking
        self.trade_history = []
        self.current_positions = {}
        self.performance_metrics = {
            'total_trades': 0,
            'winning_trades': 0,
            'total_profit': 0.0,
            'max_drawdown': 0.0,
            'sharpe_ratio': 0.0
        }
        
        self.is_running = False
    
    async def start(self):
        """Start the AI strategy"""
        try:
            logger.info("Starting Advanced AI Strategy...")
            
            # Initialize AI service
            await self.ai_service.start()
            
            # Initialize market data service
            self.market_data_service = MarketDataService(self.config)
            await self.market_data_service.start()
            
            # Initialize risk manager
            self.risk_manager = RiskManager(self.config)
            await self.risk_manager.start()
            
            # Train models if we have historical data
            await self._train_models_if_needed()
            
            self.is_running = True
            logger.info("Advanced AI Strategy started successfully")
            
        except Exception as e:
            logger.error(f"Failed to start Advanced AI Strategy: {e}")
            raise
    
    async def stop(self):
        """Stop the AI strategy"""
        try:
            logger.info("Stopping Advanced AI Strategy...")
            
            self.is_running = False
            
            if self.market_data_service:
                await self.market_data_service.stop()
            
            if self.risk_manager:
                await self.risk_manager.stop()
            
            logger.info("Advanced AI Strategy stopped")
            
        except Exception as e:
            logger.error(f"Error stopping Advanced AI Strategy: {e}")
    
    async def analyze_market(self, symbol: str) -> MarketCondition:
        """
        Analyze current market conditions for a symbol
        """
        try:
            # Get market data
            market_data = await self.market_data_service.get_market_data(symbol)
            
            # Fixed: Check if DataFrame is empty using .empty instead of truth value
            if market_data is None or (hasattr(market_data, 'empty') and market_data.empty):
                raise ValueError(f"No market data available for {symbol}")
            
            # Analyze trend
            trend = self._analyze_trend(market_data)
            
            # Calculate volatility
            volatility = self._calculate_volatility(market_data)
            
            # Analyze volume profile
            volume_profile = self._analyze_volume_profile(market_data)
            
            # Get sentiment analysis
            sentiment_result = await self.ai_service.analyze_sentiment(symbol)
            sentiment = sentiment_result['score']
            
            # Get macro conditions
            macro_result = await self.ai_service.analyze_macro_conditions()
            macro_conditions = macro_result['market_regime']
            
            return MarketCondition(
                trend=trend,
                volatility=volatility,
                volume_profile=volume_profile,
                sentiment=sentiment,
                macro_conditions=macro_conditions
            )
            
        except Exception as e:
            logger.error(f"Error analyzing market for {symbol}: {e}")
            return MarketCondition(
                trend='sideways',
                volatility=0.02,
                volume_profile='medium',
                sentiment=0.5,
                macro_conditions='neutral'
            )
    
    async def generate_signal(self, symbol: str) -> TradingSignal:
        """
        Generate trading signal using AI ensemble
        """
        try:
            logger.info(f"Generating signal for {symbol}")
            
            # Get market condition
            market_condition = await self.analyze_market(symbol)
            
            # Get market data for feature extraction
            market_data = await self.market_data_service.get_market_data(symbol)
            
            # Fixed: Check if DataFrame is empty using .empty instead of truth value
            if market_data is None or (hasattr(market_data, 'empty') and market_data.empty):
                return self._create_hold_signal("No market data available")
            
            # Extract features for ML models
            features = self._extract_features(market_data)
            
            # Get AI predictions
            sentiment_result = await self.ai_service.analyze_sentiment(symbol)
            price_prediction = await self.ai_service.predict_price_movement(features)
            macro_result = await self.ai_service.analyze_macro_conditions()
            
            # Generate individual model signals
            signals = {
                'sentiment': self._generate_sentiment_signal(sentiment_result, market_condition),
                'technical': self._generate_technical_signal(market_data, features),
                'microstructure': self._generate_microstructure_signal(market_data),
                'macro': self._generate_macro_signal(macro_result, market_condition)
            }
            
            # Combine signals using ensemble approach
            final_signal = self._combine_signals(signals, market_condition)
            
            # Apply risk management
            final_signal = await self._apply_risk_management(final_signal, symbol, market_data)
            
            logger.info(f"Generated signal for {symbol}: {final_signal.signal_type.value} "
                       f"(confidence: {final_signal.confidence:.2f})")
            
            return final_signal
            
        except Exception as e:
            logger.error(f"Error generating signal for {symbol}: {e}")
            return self._create_hold_signal(f"Error in signal generation: {str(e)}")
    
    def _analyze_trend(self, market_data: pd.DataFrame) -> str:
        """Analyze price trend"""
        try:
            if len(market_data) < 20:
                return 'sideways'
            
            # Use close prices for trend analysis
            if 'close' in market_data.columns:
                prices = market_data['close']
            else:
                prices = market_data.iloc[:, -1]  # Last column is usually close price
            
            # Calculate moving averages
            ma_20 = prices.rolling(window=20).mean()
            ma_50 = prices.rolling(window=50).mean()
            
            # Determine trend
            if ma_20.iloc[-1] > ma_50.iloc[-1]:
                return 'bullish'
            elif ma_20.iloc[-1] < ma_50.iloc[-1]:
                return 'bearish'
            else:
                return 'sideways'
                
        except Exception as e:
            logger.error(f"Error analyzing trend: {e}")
            return 'sideways'
    
    def _calculate_volatility(self, market_data: pd.DataFrame) -> float:
        """Calculate price volatility"""
        try:
            if len(market_data) < 2:
                return 0.02
            
            # Use close prices for volatility calculation
            if 'close' in market_data.columns:
                prices = market_data['close']
            else:
                prices = market_data.iloc[:, -1]
            
            # Calculate returns
            returns = prices.pct_change().dropna()
            
            # Calculate volatility (annualized)
            volatility = returns.std() * np.sqrt(252)
            
            return float(volatility)
            
        except Exception as e:
            logger.error(f"Error calculating volatility: {e}")
            return 0.02
    
    def _analyze_volume_profile(self, market_data: pd.DataFrame) -> str:
        """Analyze volume profile"""
        try:
            if 'volume' not in market_data.columns or len(market_data) < 20:
                return 'medium'
            
            volume = market_data['volume']
            avg_volume = volume.rolling(window=20).mean()
            current_volume = volume.iloc[-1]
            avg_volume_value = avg_volume.iloc[-1]
            
            if current_volume > avg_volume_value * 1.5:
                return 'high'
            elif current_volume < avg_volume_value * 0.5:
                return 'low'
            else:
                return 'medium'
                
        except Exception as e:
            logger.error(f"Error analyzing volume profile: {e}")
            return 'medium'
    
    def _extract_features(self, market_data: pd.DataFrame) -> Dict[str, float]:
        """Extract features for ML models"""
        try:
            features = {}
            
            if 'close' in market_data.columns:
                prices = market_data['close']
            else:
                prices = market_data.iloc[:, -1]
            
            # Price-based features
            features['price_change_1h'] = prices.pct_change(1).iloc[-1] if len(prices) > 1 else 0
            features['price_change_4h'] = prices.pct_change(4).iloc[-1] if len(prices) > 4 else 0
            features['price_change_24h'] = prices.pct_change(24).iloc[-1] if len(prices) > 24 else 0
            
            # Technical indicators
            features['rsi'] = self._calculate_rsi(prices)
            features['macd'] = self._calculate_macd(prices)
            features['bollinger_position'] = self._calculate_bollinger_position(prices)
            
            # Volume features
            if 'volume' in market_data.columns:
                volume = market_data['volume']
                features['volume_ratio'] = volume.iloc[-1] / volume.rolling(20).mean().iloc[-1] if len(volume) > 20 else 1
            else:
                features['volume_ratio'] = 1
            
            return features
            
        except Exception as e:
            logger.error(f"Error extracting features: {e}")
            return {}
    
    def _calculate_rsi(self, prices: pd.Series, period: int = 14) -> float:
        """Calculate RSI indicator"""
        try:
            if len(prices) < period + 1:
                return 50.0
            
            delta = prices.diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
            
            rs = gain / loss
            rsi = 100 - (100 / (1 + rs))
            
            return float(rsi.iloc[-1])
            
        except Exception as e:
            logger.error(f"Error calculating RSI: {e}")
            return 50.0
    
    def _calculate_macd(self, prices: pd.Series) -> float:
        """Calculate MACD indicator"""
        try:
            if len(prices) < 26:
                return 0.0
            
            ema_12 = prices.ewm(span=12).mean()
            ema_26 = prices.ewm(span=26).mean()
            macd = ema_12 - ema_26
            
            return float(macd.iloc[-1])
            
        except Exception as e:
            logger.error(f"Error calculating MACD: {e}")
            return 0.0
    
    def _calculate_bollinger_position(self, prices: pd.Series, period: int = 20) -> float:
        """Calculate position within Bollinger Bands"""
        try:
            if len(prices) < period:
                return 0.5
            
            sma = prices.rolling(window=period).mean()
            std = prices.rolling(window=period).std()
            upper_band = sma + (std * 2)
            lower_band = sma - (std * 2)
            
            current_price = prices.iloc[-1]
            upper = upper_band.iloc[-1]
            lower = lower_band.iloc[-1]
            
            if upper == lower:
                return 0.5
            
            position = (current_price - lower) / (upper - lower)
            return float(position)
            
        except Exception as e:
            logger.error(f"Error calculating Bollinger position: {e}")
            return 0.5
    
    def _generate_sentiment_signal(self, sentiment_result: Dict, market_condition: MarketCondition) -> TradingSignal:
        """Generate signal based on sentiment analysis"""
        try:
            score = sentiment_result.get('score', 0.5)
            confidence = sentiment_result.get('confidence', 0.5)
            
            if score > 0.6 and confidence > 0.7:
                signal_type = SignalType.BUY
            elif score < 0.4 and confidence > 0.7:
                signal_type = SignalType.SELL
            else:
                signal_type = SignalType.HOLD
            
            return TradingSignal(
                signal_type=signal_type,
                confidence=confidence,
                reasoning=f"Sentiment: {score:.2f} (confidence: {confidence:.2f})"
            )
            
        except Exception as e:
            logger.error(f"Error generating sentiment signal: {e}")
            return self._create_hold_signal(f"Sentiment error: {str(e)}")
    
    def _generate_technical_signal(self, market_data: pd.DataFrame, features: Dict[str, float]) -> TradingSignal:
        """Generate signal based on technical analysis"""
        try:
            buy_signals = 0
            sell_signals = 0
            confidence_factors = []
            
            # RSI signals
            rsi = features.get('rsi', 50)
            if rsi < 30:
                buy_signals += 1
                confidence_factors.append(0.8)
            elif rsi > 70:
                sell_signals += 1
                confidence_factors.append(0.8)
            
            # MACD signals
            macd = features.get('macd', 0)
            if macd > 0:
                buy_signals += 1
                confidence_factors.append(0.6)
            elif macd < 0:
                sell_signals += 1
                confidence_factors.append(0.6)
            
            # Bollinger Bands signals
            bb_position = features.get('bollinger_position', 0.5)
            if bb_position < 0.2:
                buy_signals += 1
                confidence_factors.append(0.7)
            elif bb_position > 0.8:
                sell_signals += 1
                confidence_factors.append(0.7)
            
            # Determine final signal
            if buy_signals > sell_signals:
                signal_type = SignalType.BUY
                confidence = np.mean(confidence_factors) if confidence_factors else 0.5
            elif sell_signals > buy_signals:
                signal_type = SignalType.SELL
                confidence = np.mean(confidence_factors) if confidence_factors else 0.5
            else:
                signal_type = SignalType.HOLD
                confidence = 0.3
            
            return TradingSignal(
                signal_type=signal_type,
                confidence=confidence,
                reasoning=f"Technical: {buy_signals} buy, {sell_signals} sell signals"
            )
            
        except Exception as e:
            logger.error(f"Error generating technical signal: {e}")
            return self._create_hold_signal(f"Technical error: {str(e)}")
    
    def _generate_microstructure_signal(self, market_data: pd.DataFrame) -> TradingSignal:
        """Generate signal based on market microstructure"""
        try:
            # This is a simplified implementation
            # In a real system, this would analyze order book, trade flow, etc.
            
            if 'volume' in market_data.columns and len(market_data) > 10:
                recent_volume = market_data['volume'].tail(10).mean()
                historical_volume = market_data['volume'].mean()
                
                if recent_volume > historical_volume * 1.2:
                    return TradingSignal(
                        signal_type=SignalType.BUY,
                        confidence=0.6,
                        reasoning="High volume activity detected"
                    )
                elif recent_volume < historical_volume * 0.8:
                    return TradingSignal(
                        signal_type=SignalType.SELL,
                        confidence=0.6,
                        reasoning="Low volume activity detected"
                    )
            
            return self._create_hold_signal("Normal microstructure conditions")
            
        except Exception as e:
            logger.error(f"Error generating microstructure signal: {e}")
            return self._create_hold_signal(f"Microstructure error: {str(e)}")
    
    def _generate_macro_signal(self, macro_result: Dict, market_condition: MarketCondition) -> TradingSignal:
        """Generate signal based on macroeconomic conditions"""
        try:
            market_regime = macro_result.get('market_regime', 'neutral')
            confidence = macro_result.get('confidence', 0.5)
            
            if market_regime == 'bull' and confidence > 0.7:
                signal_type = SignalType.BUY
            elif market_regime == 'bear' and confidence > 0.7:
                signal_type = SignalType.SELL
            else:
                signal_type = SignalType.HOLD
            
            return TradingSignal(
                signal_type=signal_type,
                confidence=confidence,
                reasoning=f"Macro regime: {market_regime} (confidence: {confidence:.2f})"
            )
            
        except Exception as e:
            logger.error(f"Error generating macro signal: {e}")
            return self._create_hold_signal(f"Macro error: {str(e)}")
    
    def _combine_signals(self, signals: Dict[str, TradingSignal], market_condition: MarketCondition) -> TradingSignal:
        """Combine individual signals using ensemble approach"""
        try:
            buy_weight = 0
            sell_weight = 0
            total_confidence = 0
            reasoning_parts = []
            
            for signal_name, signal in signals.items():
                weight = self.ensemble_weights.get(signal_name, 0.25)
                
                if signal.signal_type == SignalType.BUY:
                    buy_weight += weight * signal.confidence
                elif signal.signal_type == SignalType.SELL:
                    sell_weight += weight * signal.confidence
                
                total_confidence += weight * signal.confidence
                reasoning_parts.append(f"{signal_name}: {signal.reasoning}")
            
            # Determine final signal
            if buy_weight > sell_weight and buy_weight > self.min_confidence:
                signal_type = SignalType.BUY
                confidence = buy_weight
            elif sell_weight > buy_weight and sell_weight > self.min_confidence:
                signal_type = SignalType.SELL
                confidence = sell_weight
            else:
                signal_type = SignalType.HOLD
                confidence = total_confidence * 0.5
            
            return TradingSignal(
                signal_type=signal_type,
                confidence=confidence,
                reasoning=" | ".join(reasoning_parts)
            )
            
        except Exception as e:
            logger.error(f"Error combining signals: {e}")
            return self._create_hold_signal(f"Signal combination error: {str(e)}")
    
    async def _apply_risk_management(self, signal: TradingSignal, symbol: str, market_data: pd.DataFrame) -> TradingSignal:
        """Apply risk management to the signal"""
        try:
            if signal.signal_type == SignalType.HOLD:
                return signal
            
            # Calculate position size based on risk
            volatility = self._calculate_volatility(market_data)
            risk_adjusted_size = min(
                self.max_position_size,
                self.max_position_size * (0.02 / volatility)  # Adjust for volatility
            )
            
            # Calculate stop loss and take profit levels
            if 'close' in market_data.columns:
                current_price = market_data['close'].iloc[-1]
            else:
                current_price = market_data.iloc[-1, -1]
            
            if signal.signal_type == SignalType.BUY:
                stop_loss = current_price * (1 - self.stop_loss_pct)
                take_profit = current_price * (1 + self.take_profit_pct)
            else:  # SELL
                stop_loss = current_price * (1 + self.stop_loss_pct)
                take_profit = current_price * (1 - self.take_profit_pct)
            
            return TradingSignal(
                signal_type=signal.signal_type,
                confidence=signal.confidence,
                reasoning=signal.reasoning,
                stop_loss=stop_loss,
                take_profit=take_profit,
                position_size=risk_adjusted_size
            )
            
        except Exception as e:
            logger.error(f"Error applying risk management: {e}")
            return signal
    
    def _create_hold_signal(self, reasoning: str) -> TradingSignal:
        """Create a HOLD signal with given reasoning"""
        return TradingSignal(
            signal_type=SignalType.HOLD,
            confidence=0.5,
            reasoning=reasoning
        )
    
    async def _train_models_if_needed(self):
        """Train ML models if we have sufficient historical data"""
        try:
            logger.info("Training AI models...")
            
            # This would implement model training in a real system
            # For now, we'll just log that training would happen
            
            logger.info("AI models training completed")
            
        except Exception as e:
            logger.error(f"Error training models: {e}")
    
    def get_performance_metrics(self) -> Dict[str, Any]:
        """Get current performance metrics"""
        return self.performance_metrics.copy()
    
    def update_performance(self, trade_result: Dict[str, Any]):
        """Update performance metrics with trade result"""
        try:
            self.performance_metrics['total_trades'] += 1
            
            if trade_result.get('profit', 0) > 0:
                self.performance_metrics['winning_trades'] += 1
            
            self.performance_metrics['total_profit'] += trade_result.get('profit', 0)
            
            # Update win rate
            if self.performance_metrics['total_trades'] > 0:
                win_rate = self.performance_metrics['winning_trades'] / self.performance_metrics['total_trades']
                self.performance_metrics['win_rate'] = win_rate
            
        except Exception as e:
            logger.error(f"Error updating performance: {e}")
