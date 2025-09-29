"""
Advanced AI Service for KaliTrade
Integrates multiple AI models for comprehensive market analysis
"""

import asyncio
import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
import requests
import json

# AI/ML imports
from transformers import pipeline, AutoTokenizer, AutoModel
import torch
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import openai
from huggingface_hub import hf_hub_download

logger = logging.getLogger(__name__)

class AIService:
    """
    Advanced AI Service that combines multiple AI models for trading decisions
    """
    
    def __init__(self, config):
        self.config = config
        self.is_ready = False
        
        # Initialize AI models
        self.sentiment_analyzer = None
        self.price_predictor = None
        self.volatility_predictor = None
        self.scaler = StandardScaler()
        
        # Model weights for ensemble
        self.model_weights = {
            'sentiment': 0.25,
            'technical': 0.35,
            'microstructure': 0.20,
            'macro': 0.20
        }
        
        # Cache for model predictions
        self.prediction_cache = {}
        self.cache_ttl = 300  # 5 minutes
        
    async def start(self):
        """Initialize all AI models"""
        try:
            logger.info("Initializing AI Service...")
            
            # Initialize sentiment analysis model
            await self._initialize_sentiment_analyzer()
            
            # Initialize price prediction models
            await self._initialize_price_predictor()
            
            # Initialize volatility predictor
            await self._initialize_volatility_predictor()
            
            self.is_ready = True
            logger.info("AI Service initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize AI Service: {e}")
            raise
    
    async def _initialize_sentiment_analyzer(self):
        """Initialize sentiment analysis model"""
        try:
            # Use a lightweight sentiment analysis model
            self.sentiment_analyzer = pipeline(
                "sentiment-analysis",
                model="cardiffnlp/twitter-roberta-base-sentiment-latest",
                device=0 if torch.cuda.is_available() else -1
            )
            logger.info("Sentiment analyzer initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize sentiment analyzer: {e}")
            # Fallback to a simple rule-based sentiment analysis
            self.sentiment_analyzer = None
    
    async def _initialize_price_predictor(self):
        """Initialize price prediction models"""
        try:
            # Initialize Random Forest for price prediction
            self.price_predictor = RandomForestRegressor(
                n_estimators=100,
                max_depth=10,
                random_state=42,
                n_jobs=-1
            )
            logger.info("Price predictor initialized")
        except Exception as e:
            logger.error(f"Failed to initialize price predictor: {e}")
            raise
    
    async def _initialize_volatility_predictor(self):
        """Initialize volatility prediction model"""
        try:
            self.volatility_predictor = RandomForestRegressor(
                n_estimators=50,
                max_depth=8,
                random_state=42,
                n_jobs=-1
            )
            logger.info("Volatility predictor initialized")
        except Exception as e:
            logger.error(f"Failed to initialize volatility predictor: {e}")
            raise
    
    def is_ready(self) -> bool:
        """Check if AI service is ready"""
        return self.is_ready
    
    async def analyze_sentiment(self, symbol: str) -> Dict[str, Any]:
        """
        Analyze market sentiment for a given symbol
        """
        try:
            # Get recent news and social media data
            news_data = await self._get_news_data(symbol)
            social_data = await self._get_social_data(symbol)
            
            # Analyze sentiment
            sentiment_score = 0.5  # Neutral baseline
            confidence = 0.5
            
            if self.sentiment_analyzer and (news_data or social_data):
                # Analyze news sentiment
                if news_data:
                    news_sentiment = await self._analyze_text_sentiment(news_data)
                    sentiment_score = (sentiment_score + news_sentiment) / 2
                    confidence = max(confidence, 0.7)
                
                # Analyze social sentiment
                if social_data:
                    social_sentiment = await self._analyze_text_sentiment(social_data)
                    sentiment_score = (sentiment_score + social_sentiment) / 2
                    confidence = max(confidence, 0.6)
            else:
                # Fallback: simple rule-based sentiment
                sentiment_score = await self._rule_based_sentiment(symbol)
                confidence = 0.4
            
            return {
                'score': sentiment_score,
                'confidence': confidence,
                'sources': ['news', 'social_media'],
                'reasoning': f'Sentiment analysis based on {len(news_data) if news_data else 0} news articles and social media data'
            }
            
        except Exception as e:
            logger.error(f"Error in sentiment analysis: {e}")
            return {
                'score': 0.5,
                'confidence': 0.3,
                'sources': [],
                'reasoning': f'Error in sentiment analysis: {str(e)}'
            }
    
    async def predict_price_movement(self, features: Dict[str, Any]) -> Dict[str, Any]:
        """
        Predict price movement using ML models
        """
        try:
            # Convert features to numpy array
            feature_vector = self._extract_features(features)
            
            if len(feature_vector) == 0:
                return {
                    'price_prediction': 0.0,
                    'volatility_prediction': 0.02,
                    'confidence': 0.3
                }
            
            # Normalize features
            feature_vector_scaled = self.scaler.fit_transform([feature_vector])
            
            # Make predictions
            price_prediction = self.price_predictor.predict(feature_vector_scaled)[0]
            volatility_prediction = self.volatility_predictor.predict(feature_vector_scaled)[0]
            
            # Calculate confidence based on feature quality
            confidence = self._calculate_prediction_confidence(features)
            
            return {
                'price_prediction': float(price_prediction),
                'volatility_prediction': float(volatility_prediction),
                'confidence': confidence
            }
            
        except Exception as e:
            logger.error(f"Error in price prediction: {e}")
            return {
                'price_prediction': 0.0,
                'volatility_prediction': 0.02,
                'confidence': 0.3
            }
    
    async def analyze_macro_conditions(self) -> Dict[str, Any]:
        """
        Analyze macro economic conditions
        """
        try:
            # Get macro economic data
            macro_data = await self._get_macro_data()
            
            # Analyze correlation with crypto markets
            crypto_correlation = self._calculate_crypto_correlation(macro_data)
            
            # Determine market regime
            market_regime = self._determine_market_regime(macro_data)
            
            # Calculate risk appetite
            risk_appetite = self._calculate_risk_appetite(macro_data)
            
            return {
                'crypto_correlation': crypto_correlation,
                'market_regime': market_regime,
                'risk_appetite': risk_appetite,
                'confidence': 0.7
            }
            
        except Exception as e:
            logger.error(f"Error in macro analysis: {e}")
            return {
                'crypto_correlation': 0.5,
                'market_regime': 'neutral',
                'risk_appetite': 0.5,
                'confidence': 0.3
            }
    
    async def _get_news_data(self, symbol: str) -> List[str]:
        """Get news data for sentiment analysis"""
        try:
            # TODO: Implement actual news API integration
            # For now, return mock data
            return [
                f"{symbol} shows strong bullish momentum",
                f"Technical analysis suggests {symbol} may continue upward trend",
                f"Market experts optimistic about {symbol} prospects"
            ]
        except Exception as e:
            logger.error(f"Error getting news data: {e}")
            return []
    
    async def _get_social_data(self, symbol: str) -> List[str]:
        """Get social media data for sentiment analysis"""
        try:
            # TODO: Implement actual social media API integration
            # For now, return mock data
            return [
                f"#{symbol} looking good today!",
                f"Bullish on {symbol}",
                f"{symbol} to the moon!"
            ]
        except Exception as e:
            logger.error(f"Error getting social data: {e}")
            return []
    
    async def _analyze_text_sentiment(self, texts: List[str]) -> float:
        """Analyze sentiment of text data"""
        try:
            if not self.sentiment_analyzer or not texts:
                return 0.5
            
            # Analyze sentiment for each text
            sentiments = []
            for text in texts:
                result = self.sentiment_analyzer(text[:512])  # Limit text length
                
                # Convert sentiment to 0-1 scale
                if result[0]['label'] == 'LABEL_0':  # Negative
                    sentiment = 0.0
                elif result[0]['label'] == 'LABEL_1':  # Neutral
                    sentiment = 0.5
                else:  # Positive
                    sentiment = 1.0
                
                # Weight by confidence
                weighted_sentiment = sentiment * result[0]['score']
                sentiments.append(weighted_sentiment)
            
            return np.mean(sentiments) if sentiments else 0.5
            
        except Exception as e:
            logger.error(f"Error analyzing text sentiment: {e}")
            return 0.5
    
    async def _rule_based_sentiment(self, symbol: str) -> float:
        """Fallback rule-based sentiment analysis"""
        try:
            # Simple rule-based sentiment based on recent price action
            # This is a placeholder - in production, you'd use more sophisticated rules
            
            # Get recent price data (mock)
            recent_prices = [100, 102, 101, 103, 105]  # Mock data
            
            if len(recent_prices) < 2:
                return 0.5
            
            # Calculate recent trend
            price_change = (recent_prices[-1] - recent_prices[0]) / recent_prices[0]
            
            # Convert to sentiment score
            if price_change > 0.05:  # 5% increase
                return 0.8
            elif price_change > 0.02:  # 2% increase
                return 0.7
            elif price_change > -0.02:  # Within 2%
                return 0.5
            elif price_change > -0.05:  # 2-5% decrease
                return 0.3
            else:  # More than 5% decrease
                return 0.2
                
        except Exception as e:
            logger.error(f"Error in rule-based sentiment: {e}")
            return 0.5
    
    def _extract_features(self, features: Dict[str, Any]) -> np.ndarray:
        """Extract and normalize features for ML models"""
        try:
            feature_list = []
            
            # Price features
            feature_list.extend([
                features.get('price_change_1h', 0),
                features.get('price_change_4h', 0),
                features.get('price_change_24h', 0)
            ])
            
            # Volume features
            feature_list.extend([
                features.get('volume_ratio', 1.0),
                features.get('volume_trend', 0)
            ])
            
            # Volatility features
            feature_list.extend([
                features.get('volatility_1h', 0.02),
                features.get('volatility_24h', 0.02)
            ])
            
            # Technical indicators
            feature_list.extend([
                features.get('rsi', 50) / 100,  # Normalize RSI
                features.get('macd', 0),
                features.get('bollinger_position', 0.5)
            ])
            
            return np.array(feature_list)
            
        except Exception as e:
            logger.error(f"Error extracting features: {e}")
            return np.array([])
    
    def _calculate_prediction_confidence(self, features: Dict[str, Any]) -> float:
        """Calculate confidence in prediction based on feature quality"""
        try:
            confidence = 0.5
            
            # Check if we have recent data
            if features.get('price_change_1h') is not None:
                confidence += 0.1
            if features.get('volume_ratio') is not None:
                confidence += 0.1
            if features.get('rsi') is not None:
                confidence += 0.1
            
            # Check data quality
            if features.get('volatility_24h', 0) > 0:
                confidence += 0.1
            
            return min(confidence, 1.0)
            
        except Exception as e:
            logger.error(f"Error calculating confidence: {e}")
            return 0.5
    
    async def _get_macro_data(self) -> Dict[str, Any]:
        """Get macro economic data"""
        try:
            # TODO: Implement actual macro data API integration
            # For now, return mock data
            return {
                'dollar_index': 103.5,
                'gold_price': 1950.0,
                'vix': 18.5,
                'treasury_yield': 4.5,
                'inflation_rate': 3.2
            }
        except Exception as e:
            logger.error(f"Error getting macro data: {e}")
            return {}
    
    def _calculate_crypto_correlation(self, macro_data: Dict[str, Any]) -> float:
        """Calculate correlation between crypto and macro conditions"""
        try:
            # Simple correlation calculation based on macro indicators
            # In production, this would be more sophisticated
            
            dollar_strength = macro_data.get('dollar_index', 100) / 100
            risk_appetite = 1.0 - (macro_data.get('vix', 20) / 100)
            
            # Crypto typically has negative correlation with dollar strength
            # and positive correlation with risk appetite
            correlation = (risk_appetite - dollar_strength) / 2 + 0.5
            
            return max(0.0, min(1.0, correlation))
            
        except Exception as e:
            logger.error(f"Error calculating crypto correlation: {e}")
            return 0.5
    
    def _determine_market_regime(self, macro_data: Dict[str, Any]) -> str:
        """Determine current market regime"""
        try:
            vix = macro_data.get('vix', 20)
            treasury_yield = macro_data.get('treasury_yield', 4.0)
            
            if vix < 15 and treasury_yield < 3.0:
                return 'bull'
            elif vix > 25 and treasury_yield > 5.0:
                return 'bear'
            else:
                return 'neutral'
                
        except Exception as e:
            logger.error(f"Error determining market regime: {e}")
            return 'neutral'
    
    def _calculate_risk_appetite(self, macro_data: Dict[str, Any]) -> float:
        """Calculate overall risk appetite"""
        try:
            vix = macro_data.get('vix', 20)
            treasury_yield = macro_data.get('treasury_yield', 4.0)
            
            # Risk appetite is inversely related to VIX and Treasury yields
            risk_appetite = 1.0 - (vix / 50.0) - (treasury_yield / 20.0)
            
            return max(0.0, min(1.0, risk_appetite))
            
        except Exception as e:
            logger.error(f"Error calculating risk appetite: {e}")
            return 0.5
    
    async def train_models(self, historical_data: pd.DataFrame):
        """Train ML models with historical data"""
        try:
            logger.info("Training AI models with historical data...")
            
            if len(historical_data) < 100:
                logger.warning("Insufficient data for training")
                return
            
            # Prepare features and targets
            features = self._prepare_training_features(historical_data)
            price_targets = self._prepare_price_targets(historical_data)
            volatility_targets = self._prepare_volatility_targets(historical_data)
            
            # Train price predictor
            if len(features) > 0 and len(price_targets) > 0:
                X_train, X_test, y_train, y_test = train_test_split(
                    features, price_targets, test_size=0.2, random_state=42
                )
                
                self.price_predictor.fit(X_train, y_train)
                logger.info("Price predictor trained successfully")
            
            # Train volatility predictor
            if len(features) > 0 and len(volatility_targets) > 0:
                X_train, X_test, y_train, y_test = train_test_split(
                    features, volatility_targets, test_size=0.2, random_state=42
                )
                
                self.volatility_predictor.fit(X_train, y_train)
                logger.info("Volatility predictor trained successfully")
            
            logger.info("AI models training completed")
            
        except Exception as e:
            logger.error(f"Error training models: {e}")
    
    def _prepare_training_features(self, data: pd.DataFrame) -> np.ndarray:
        """Prepare features for training"""
        try:
            features = []
            
            for i in range(24, len(data)):  # Need 24 hours of history
                feature_vector = []
                
                # Price features
                feature_vector.extend([
                    data['close'].pct_change().iloc[i-1],  # 1h change
                    data['close'].pct_change(4).iloc[i],   # 4h change
                    data['close'].pct_change(24).iloc[i]   # 24h change
                ])
                
                # Volume features
                feature_vector.extend([
                    data['volume'].iloc[i] / data['volume'].rolling(24).mean().iloc[i],
                    data['volume'].pct_change().iloc[i]
                ])
                
                # Volatility features
                feature_vector.extend([
                    data['close'].pct_change().rolling(24).std().iloc[i],
                    data['close'].pct_change().rolling(168).std().iloc[i]
                ])
                
                # Technical indicators
                feature_vector.extend([
                    self._calculate_rsi(data['close'].iloc[i-14:i+1]),
                    self._calculate_macd(data['close'].iloc[i-26:i+1]),
                    self._calculate_bollinger_position(data.iloc[i-20:i+1])
                ])
                
                features.append(feature_vector)
            
            return np.array(features)
            
        except Exception as e:
            logger.error(f"Error preparing training features: {e}")
            return np.array([])
    
    def _prepare_price_targets(self, data: pd.DataFrame) -> np.ndarray:
        """Prepare price movement targets"""
        try:
            targets = []
            
            for i in range(24, len(data)):
                # Predict next hour price change
                current_price = data['close'].iloc[i]
                future_price = data['close'].iloc[i+1] if i+1 < len(data) else current_price
                
                price_change = (future_price - current_price) / current_price
                targets.append(price_change)
            
            return np.array(targets)
            
        except Exception as e:
            logger.error(f"Error preparing price targets: {e}")
            return np.array([])
    
    def _prepare_volatility_targets(self, data: pd.DataFrame) -> np.ndarray:
        """Prepare volatility targets"""
        try:
            targets = []
            
            for i in range(24, len(data)):
                # Predict next hour volatility
                future_volatility = data['close'].pct_change().rolling(24).std().iloc[i+1] if i+1 < len(data) else 0.02
                targets.append(future_volatility)
            
            return np.array(targets)
            
        except Exception as e:
            logger.error(f"Error preparing volatility targets: {e}")
            return np.array([])
    
    def _calculate_rsi(self, prices: pd.Series) -> float:
        """Calculate RSI indicator"""
        try:
            if len(prices) < 14:
                return 50.0
            
            delta = prices.diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
            
            rs = gain / loss
            rsi = 100 - (100 / (1 + rs))
            
            return rsi.iloc[-1] if not pd.isna(rsi.iloc[-1]) else 50.0
            
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
            
            return macd.iloc[-1] if not pd.isna(macd.iloc[-1]) else 0.0
            
        except Exception as e:
            logger.error(f"Error calculating MACD: {e}")
            return 0.0
    
    def _calculate_bollinger_position(self, data: pd.DataFrame) -> float:
        """Calculate position within Bollinger Bands"""
        try:
            if len(data) < 20:
                return 0.5
            
            close = data['close']
            sma = close.rolling(window=20).mean()
            std_dev = close.rolling(window=20).std()
            
            upper_band = sma + (std_dev * 2)
            lower_band = sma - (std_dev * 2)
            
            current_price = close.iloc[-1]
            upper = upper_band.iloc[-1]
            lower = lower_band.iloc[-1]
            
            if pd.isna(upper) or pd.isna(lower) or upper == lower:
                return 0.5
            
            return (current_price - lower) / (upper - lower)
            
        except Exception as e:
            logger.error(f"Error calculating Bollinger position: {e}")
            return 0.5
