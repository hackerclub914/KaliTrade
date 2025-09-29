"""
Risk Manager for KaliTrade
Handles position sizing, risk limits, and portfolio risk management
"""

import asyncio
import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class RiskLevel(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    EXTREME = "extreme"

@dataclass
class RiskMetrics:
    """Risk metrics for a position or portfolio"""
    var_95: float  # Value at Risk (95% confidence)
    max_drawdown: float
    sharpe_ratio: float
    volatility: float
    beta: float
    correlation: float

@dataclass
class PositionRisk:
    """Risk assessment for a position"""
    symbol: str
    position_size: float
    risk_level: RiskLevel
    stop_loss: float
    take_profit: float
    max_loss: float
    risk_reward_ratio: float

class RiskManager:
    """
    Advanced risk management system
    """
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        
        # Risk parameters
        self.max_portfolio_risk = config.get('max_portfolio_risk', 0.02)  # 2% max portfolio risk
        self.max_position_risk = config.get('max_position_risk', 0.005)  # 0.5% max position risk
        self.max_correlation = config.get('max_correlation', 0.7)  # Max correlation between positions
        self.max_drawdown = config.get('max_drawdown', 0.15)  # 15% max drawdown
        
        # Position sizing parameters
        self.kelly_fraction = config.get('kelly_fraction', 0.25)  # Kelly criterion fraction
        self.min_position_size = config.get('min_position_size', 0.01)  # 1% min position
        self.max_position_size = config.get('max_position_size', 0.1)  # 10% max position
        
        # Risk monitoring
        self.current_positions = {}
        self.portfolio_value = 0.0
        self.risk_metrics = {}
        self.risk_alerts = []
        
        self.is_running = False
    
    async def start(self):
        """Start the risk manager"""
        try:
            logger.info("Starting Risk Manager...")
            
            # Initialize risk monitoring
            asyncio.create_task(self._monitor_risk())
            
            self.is_running = True
            logger.info("Risk Manager started successfully")
            
        except Exception as e:
            logger.error(f"Failed to start Risk Manager: {e}")
            raise
    
    async def stop(self):
        """Stop the risk manager"""
        try:
            logger.info("Stopping Risk Manager...")
            
            self.is_running = False
            logger.info("Risk Manager stopped")
            
        except Exception as e:
            logger.error(f"Error stopping Risk Manager: {e}")
    
    async def calculate_position_size(self, symbol: str, confidence: float, 
                                    current_price: float, portfolio_value: float) -> float:
        """
        Calculate optimal position size using Kelly criterion and risk management
        """
        try:
            # Update portfolio value
            self.portfolio_value = portfolio_value
            
            # Get current positions for correlation analysis
            current_positions = self.current_positions.copy()
            
            # Calculate base position size using Kelly criterion
            win_rate = confidence  # Use confidence as proxy for win rate
            avg_win = 0.15  # 15% average win (take profit)
            avg_loss = 0.05  # 5% average loss (stop loss)
            
            kelly_fraction = self._calculate_kelly_fraction(win_rate, avg_win, avg_loss)
            
            # Apply risk limits
            position_size = self._apply_risk_limits(
                symbol, kelly_fraction, current_price, portfolio_value, current_positions
            )
            
            # Ensure minimum position size
            if position_size > 0 and position_size < self.min_position_size:
                position_size = self.min_position_size
            
            logger.info(f"Calculated position size for {symbol}: {position_size:.2%}")
            
            return position_size
            
        except Exception as e:
            logger.error(f"Error calculating position size for {symbol}: {e}")
            return 0.0
    
    def _calculate_kelly_fraction(self, win_rate: float, avg_win: float, avg_loss: float) -> float:
        """Calculate Kelly criterion fraction"""
        try:
            if avg_loss <= 0:
                return 0.0
            
            # Kelly formula: f = (bp - q) / b
            # where b = odds (avg_win / avg_loss), p = win_rate, q = loss_rate
            b = avg_win / avg_loss
            p = win_rate
            q = 1 - p
            
            kelly = (b * p - q) / b
            
            # Apply Kelly fraction limit
            kelly = max(0, min(kelly, self.kelly_fraction))
            
            return kelly
            
        except Exception as e:
            logger.error(f"Error calculating Kelly fraction: {e}")
            return 0.0
    
    def _apply_risk_limits(self, symbol: str, kelly_fraction: float, current_price: float,
                          portfolio_value: float, current_positions: Dict) -> float:
        """Apply risk limits to position size"""
        try:
            # Start with Kelly fraction
            position_size = kelly_fraction
            
            # Limit by maximum position size
            position_size = min(position_size, self.max_position_size)
            
            # Calculate position value and risk
            position_value = position_size * portfolio_value
            max_loss = position_value * self.max_position_risk
            
            # Adjust for stop loss
            if max_loss > 0:
                stop_loss_pct = max_loss / position_value
                # Ensure we can afford the stop loss
                position_size = min(position_size, stop_loss_pct * 2)  # 2x safety margin
            
            # Check correlation with existing positions
            position_size = self._adjust_for_correlation(symbol, position_size, current_positions)
            
            # Check portfolio risk limits
            position_size = self._adjust_for_portfolio_risk(position_size, current_positions)
            
            return max(0.0, position_size)
            
        except Exception as e:
            logger.error(f"Error applying risk limits: {e}")
            return 0.0
    
    def _adjust_for_correlation(self, symbol: str, position_size: float, 
                               current_positions: Dict) -> float:
        """Adjust position size based on correlation with existing positions"""
        try:
            if not current_positions:
                return position_size
            
            # Calculate correlation with existing positions
            total_correlated_exposure = 0.0
            
            for existing_symbol, position in current_positions.items():
                if existing_symbol != symbol:
                    # Simple correlation based on asset class
                    correlation = self._get_asset_correlation(symbol, existing_symbol)
                    if correlation > self.max_correlation:
                        total_correlated_exposure += position['size'] * correlation
            
            # Reduce position size if too much correlated exposure
            if total_correlated_exposure > self.max_position_size:
                reduction_factor = self.max_position_size / total_correlated_exposure
                position_size *= reduction_factor
            
            return position_size
            
        except Exception as e:
            logger.error(f"Error adjusting for correlation: {e}")
            return position_size
    
    def _get_asset_correlation(self, symbol1: str, symbol2: str) -> float:
        """Get correlation between two assets"""
        try:
            # Simple correlation based on asset class
            # In production, this would use historical correlation data
            
            # Major cryptocurrencies have high correlation
            major_cryptos = ['BTC', 'ETH', 'BNB', 'ADA', 'SOL', 'DOT', 'LINK']
            
            symbol1_base = symbol1.split('/')[0]
            symbol2_base = symbol2.split('/')[0]
            
            if symbol1_base in major_cryptos and symbol2_base in major_cryptos:
                return 0.8  # High correlation
            elif symbol1_base == symbol2_base:
                return 1.0  # Perfect correlation (same asset)
            else:
                return 0.3  # Low correlation
            
        except Exception as e:
            logger.error(f"Error getting asset correlation: {e}")
            return 0.5  # Default moderate correlation
    
    def _adjust_for_portfolio_risk(self, position_size: float, current_positions: Dict) -> float:
        """Adjust position size based on current portfolio risk"""
        try:
            # Calculate current portfolio risk
            current_portfolio_risk = 0.0
            
            for symbol, position in current_positions.items():
                position_risk = position['size'] * position.get('risk_percent', 0.05)
                current_portfolio_risk += position_risk
            
            # Calculate available risk budget
            available_risk = self.max_portfolio_risk - current_portfolio_risk
            
            if available_risk <= 0:
                return 0.0  # No risk budget available
            
            # Limit position size to available risk budget
            max_position_by_risk = available_risk / self.max_position_risk
            position_size = min(position_size, max_position_by_risk)
            
            return position_size
            
        except Exception as e:
            logger.error(f"Error adjusting for portfolio risk: {e}")
            return position_size
    
    async def assess_position_risk(self, symbol: str, position_size: float, 
                                  current_price: float, stop_loss: float, 
                                  take_profit: float) -> PositionRisk:
        """Assess risk for a specific position"""
        try:
            # Calculate risk metrics
            max_loss = (current_price - stop_loss) / current_price * position_size
            max_gain = (take_profit - current_price) / current_price * position_size
            risk_reward_ratio = max_gain / max_loss if max_loss > 0 else 0
            
            # Determine risk level
            risk_level = self._determine_risk_level(max_loss, position_size)
            
            return PositionRisk(
                symbol=symbol,
                position_size=position_size,
                risk_level=risk_level,
                stop_loss=stop_loss,
                take_profit=take_profit,
                max_loss=max_loss,
                risk_reward_ratio=risk_reward_ratio
            )
            
        except Exception as e:
            logger.error(f"Error assessing position risk: {e}")
            return PositionRisk(
                symbol=symbol,
                position_size=position_size,
                risk_level=RiskLevel.HIGH,
                stop_loss=stop_loss,
                take_profit=take_profit,
                max_loss=position_size,
                risk_reward_ratio=0.0
            )
    
    def _determine_risk_level(self, max_loss: float, position_size: float) -> RiskLevel:
        """Determine risk level based on potential loss"""
        try:
            loss_percent = max_loss / position_size if position_size > 0 else 1.0
            
            if loss_percent <= 0.02:  # 2%
                return RiskLevel.LOW
            elif loss_percent <= 0.05:  # 5%
                return RiskLevel.MEDIUM
            elif loss_percent <= 0.10:  # 10%
                return RiskLevel.HIGH
            else:
                return RiskLevel.EXTREME
                
        except Exception as e:
            logger.error(f"Error determining risk level: {e}")
            return RiskLevel.HIGH
    
    async def calculate_portfolio_metrics(self, positions: Dict[str, Any]) -> RiskMetrics:
        """Calculate portfolio risk metrics"""
        try:
            if not positions:
                return RiskMetrics(
                    var_95=0.0,
                    max_drawdown=0.0,
                    sharpe_ratio=0.0,
                    volatility=0.0,
                    beta=0.0,
                    correlation=0.0
                )
            
            # Calculate portfolio statistics
            position_values = [pos['size'] for pos in positions.values()]
            total_value = sum(position_values)
            
            # Calculate weighted volatility
            volatilities = []
            for symbol, position in positions.items():
                # Get asset volatility (mock for now)
                asset_vol = self._get_asset_volatility(symbol)
                weight = position['size'] / total_value
                volatilities.append(asset_vol * weight)
            
            portfolio_volatility = sum(volatilities) if volatilities else 0.02
            
            # Calculate Value at Risk (simplified)
            var_95 = 1.645 * portfolio_volatility  # 95% confidence
            
            # Calculate Sharpe ratio (mock)
            sharpe_ratio = 1.0  # Placeholder
            
            # Calculate beta (mock)
            beta = 1.0  # Placeholder
            
            # Calculate correlation
            correlation = self._calculate_portfolio_correlation(positions)
            
            return RiskMetrics(
                var_95=var_95,
                max_drawdown=0.0,  # Would be calculated from historical data
                sharpe_ratio=sharpe_ratio,
                volatility=portfolio_volatility,
                beta=beta,
                correlation=correlation
            )
            
        except Exception as e:
            logger.error(f"Error calculating portfolio metrics: {e}")
            return RiskMetrics(
                var_95=0.02,
                max_drawdown=0.0,
                sharpe_ratio=0.0,
                volatility=0.02,
                beta=1.0,
                correlation=0.5
            )
    
    def _get_asset_volatility(self, symbol: str) -> float:
        """Get asset volatility (mock implementation)"""
        try:
            # Mock volatility data - in production, this would use historical data
            volatility_map = {
                'BTC/USDT': 0.04,
                'ETH/USDT': 0.05,
                'BNB/USDT': 0.06,
                'ADA/USDT': 0.07,
                'SOL/USDT': 0.08,
            }
            
            return volatility_map.get(symbol, 0.05)  # Default 5% volatility
            
        except Exception as e:
            logger.error(f"Error getting asset volatility: {e}")
            return 0.05
    
    def _calculate_portfolio_correlation(self, positions: Dict[str, Any]) -> float:
        """Calculate average correlation in portfolio"""
        try:
            if len(positions) <= 1:
                return 0.0
            
            symbols = list(positions.keys())
            correlations = []
            
            for i in range(len(symbols)):
                for j in range(i + 1, len(symbols)):
                    corr = self._get_asset_correlation(symbols[i], symbols[j])
                    correlations.append(corr)
            
            return sum(correlations) / len(correlations) if correlations else 0.0
            
        except Exception as e:
            logger.error(f"Error calculating portfolio correlation: {e}")
            return 0.5
    
    async def check_risk_limits(self, new_position: Dict[str, Any]) -> Tuple[bool, str]:
        """Check if new position violates risk limits"""
        try:
            # Check position size limits
            if new_position['size'] > self.max_position_size:
                return False, f"Position size {new_position['size']:.2%} exceeds maximum {self.max_position_size:.2%}"
            
            if new_position['size'] < self.min_position_size:
                return False, f"Position size {new_position['size']:.2%} below minimum {self.min_position_size:.2%}"
            
            # Check portfolio risk limits
            total_risk = 0.0
            for symbol, position in self.current_positions.items():
                total_risk += position['size'] * position.get('risk_percent', 0.05)
            
            new_risk = new_position['size'] * new_position.get('risk_percent', 0.05)
            total_risk += new_risk
            
            if total_risk > self.max_portfolio_risk:
                return False, f"Total portfolio risk {total_risk:.2%} would exceed maximum {self.max_portfolio_risk:.2%}"
            
            # Check correlation limits
            for symbol, position in self.current_positions.items():
                correlation = self._get_asset_correlation(new_position['symbol'], symbol)
                if correlation > self.max_correlation:
                    return False, f"High correlation {correlation:.2f} with existing position {symbol}"
            
            return True, "Risk limits satisfied"
            
        except Exception as e:
            logger.error(f"Error checking risk limits: {e}")
            return False, f"Error checking risk limits: {str(e)}"
    
    async def _monitor_risk(self):
        """Monitor portfolio risk continuously"""
        while self.is_running:
            try:
                # Check for risk violations
                await self._check_risk_violations()
                
                # Update risk metrics
                await self._update_risk_metrics()
                
                # Wait before next check
                await asyncio.sleep(60)  # Check every minute
                
            except Exception as e:
                logger.error(f"Error in risk monitoring: {e}")
                await asyncio.sleep(60)
    
    async def _check_risk_violations(self):
        """Check for risk limit violations"""
        try:
            # Calculate current portfolio risk
            total_risk = 0.0
            for symbol, position in self.current_positions.items():
                total_risk += position['size'] * position.get('risk_percent', 0.05)
            
            # Check portfolio risk limit
            if total_risk > self.max_portfolio_risk:
                alert = {
                    'type': 'portfolio_risk_exceeded',
                    'message': f"Portfolio risk {total_risk:.2%} exceeds limit {self.max_portfolio_risk:.2%}",
                    'timestamp': datetime.now()
                }
                self.risk_alerts.append(alert)
                logger.warning(alert['message'])
            
            # Check individual position risks
            for symbol, position in self.current_positions.items():
                position_risk = position['size'] * position.get('risk_percent', 0.05)
                if position_risk > self.max_position_risk:
                    alert = {
                        'type': 'position_risk_exceeded',
                        'message': f"Position {symbol} risk {position_risk:.2%} exceeds limit {self.max_position_risk:.2%}",
                        'timestamp': datetime.now()
                    }
                    self.risk_alerts.append(alert)
                    logger.warning(alert['message'])
            
        except Exception as e:
            logger.error(f"Error checking risk violations: {e}")
    
    async def _update_risk_metrics(self):
        """Update portfolio risk metrics"""
        try:
            if self.current_positions:
                self.risk_metrics = await self.calculate_portfolio_metrics(self.current_positions)
            
        except Exception as e:
            logger.error(f"Error updating risk metrics: {e}")
    
    def add_position(self, symbol: str, position_data: Dict[str, Any]):
        """Add a position to risk tracking"""
        try:
            self.current_positions[symbol] = position_data
            logger.info(f"Added position {symbol} to risk tracking")
            
        except Exception as e:
            logger.error(f"Error adding position {symbol}: {e}")
    
    def remove_position(self, symbol: str):
        """Remove a position from risk tracking"""
        try:
            if symbol in self.current_positions:
                del self.current_positions[symbol]
                logger.info(f"Removed position {symbol} from risk tracking")
            
        except Exception as e:
            logger.error(f"Error removing position {symbol}: {e}")
    
    def get_risk_alerts(self) -> List[Dict[str, Any]]:
        """Get current risk alerts"""
        return self.risk_alerts.copy()
    
    def clear_risk_alerts(self):
        """Clear risk alerts"""
        self.risk_alerts = []
    
    def get_risk_metrics(self) -> Dict[str, Any]:
        """Get current risk metrics"""
        return self.risk_metrics.__dict__ if self.risk_metrics else {}
    
    def get_current_positions(self) -> Dict[str, Any]:
        """Get current positions being tracked"""
        return self.current_positions.copy()
    
    def is_running(self) -> bool:
        """Check if risk manager is running"""
        return self.is_running
