// Advanced AI Trading Assistant
class AdvancedAIAssistant {
    constructor(dataService) {
        this.dataService = dataService;
        this.conversationHistory = [];
    }

    async generateIntelligentResponse(message, symbol, context = {}) {
        // Analyze user intent
        const intent = this.analyzeUserIntent(message);
        const entities = this.extractEntities(message);
        
        // Get real-time data
        const data = await this.gatherMarketData(symbol);
        
        // Generate context-aware response
        switch (intent.type) {
            case 'greeting':
                return this.generateGreetingResponse();
            case 'price_inquiry':
                return this.generatePriceAnalysis(symbol, data, entities);
            case 'technical_analysis':
                return this.generateTechnicalAnalysis(symbol, data, entities);
            case 'trading_recommendation':
                return this.generateTradingRecommendation(symbol, data, entities);
            case 'market_sentiment':
                return this.generateSentimentAnalysis(symbol, data, entities);
            case 'portfolio_advice':
                return this.generatePortfolioAdvice(symbol, data, entities);
            case 'risk_assessment':
                return this.generateRiskAssessment(symbol, data, entities);
            case 'strategy_advice':
                return this.generateStrategyAdvice(symbol, data, entities);
            default:
                return this.generateGeneralResponse(message, symbol, data, intent);
        }
    }

    analyzeUserIntent(message) {
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.match(/\b(hello|hi|hey)\b/)) {
            return { type: 'greeting', confidence: 0.9 };
        }
        if (lowerMessage.match(/\b(price|cost|value|worth|trading at)\b/)) {
            return { type: 'price_inquiry', confidence: 0.8 };
        }
        if (lowerMessage.match(/\b(technical|chart|indicator|rsi|macd|analysis)\b/)) {
            return { type: 'technical_analysis', confidence: 0.85 };
        }
        if (lowerMessage.match(/\b(buy|sell|hold|recommend|should i|advice)\b/)) {
            return { type: 'trading_recommendation', confidence: 0.8 };
        }
        if (lowerMessage.match(/\b(sentiment|bullish|bearish|mood)\b/)) {
            return { type: 'market_sentiment', confidence: 0.8 };
        }
        if (lowerMessage.match(/\b(portfolio|diversify|allocation|balance)\b/)) {
            return { type: 'portfolio_advice', confidence: 0.8 };
        }
        if (lowerMessage.match(/\b(risk|volatility|safe|dangerous)\b/)) {
            return { type: 'risk_assessment', confidence: 0.8 };
        }
        if (lowerMessage.match(/\b(strategy|approach|method|technique)\b/)) {
            return { type: 'strategy_advice', confidence: 0.8 };
        }
        
        return { type: 'general', confidence: 0.5 };
    }

    extractEntities(message) {
        const entities = { symbols: [], timeframes: [], indicators: [], actions: [] };
        
        // Extract crypto symbols
        const symbolPattern = /\b(btc|bitcoin|eth|ethereum|sol|solana|bnb|binance|ada|cardano|dot|polkadot|link|chainlink|matic|polygon)\b/gi;
        const symbolMatches = message.match(symbolPattern);
        if (symbolMatches) {
            entities.symbols = symbolMatches.map(s => s.toUpperCase());
        }
        
        // Extract timeframes
        const timeframePattern = /\b(1m|5m|15m|30m|1h|4h|1d|1w|daily|weekly|monthly|short term|long term)\b/gi;
        const timeframeMatches = message.match(timeframePattern);
        if (timeframeMatches) {
            entities.timeframes = timeframeMatches;
        }
        
        // Extract indicators
        const indicatorPattern = /\b(rsi|macd|sma|ema|bollinger|support|resistance|trend)\b/gi;
        const indicatorMatches = message.match(indicatorPattern);
        if (indicatorMatches) {
            entities.indicators = indicatorMatches;
        }
        
        // Extract actions
        const actionPattern = /\b(buy|sell|hold|long|short|enter|exit|trade|invest)\b/gi;
        const actionMatches = message.match(actionPattern);
        if (actionMatches) {
            entities.actions = actionMatches;
        }
        
        return entities;
    }

    async gatherMarketData(symbol) {
        try {
            const [priceData, technicalData, sentimentData] = await Promise.all([
                this.dataService.getRealTimePrice(symbol).catch(() => null),
                this.dataService.getTechnicalIndicators(symbol).catch(() => null),
                this.dataService.getMarketSentiment(symbol).catch(() => null)
            ]);
            
            return { priceData, technicalData, sentimentData };
        } catch (error) {
            console.error('Error gathering market data:', error);
            return { priceData: null, technicalData: null, sentimentData: null };
        }
    }

    generateGreetingResponse() {
        const greetings = [
            "Hello! I'm your advanced AI trading assistant with real-time market data access. I can help with technical analysis, trading strategies, risk assessment, and portfolio optimization. What would you like to know?",
            "Hi there! I provide expert-level crypto trading insights using live market data and advanced AI analysis. How can I assist you with your trading today?",
            "Greetings! I'm your intelligent trading companion with access to real-time market data and professional analysis tools. What trading question can I help you with?"
        ];
        return greetings[Math.floor(Math.random() * greetings.length)];
    }

    generatePriceAnalysis(symbol, data, entities) {
        if (!data.priceData) {
            return `I don't have current price data for ${symbol} at the moment. Please try again in a few moments.`;
        }
        
        const { price, change24h, volume } = data.priceData;
        const changeText = change24h >= 0 ? `gained ${change24h.toFixed(2)}%` : `declined ${Math.abs(change24h).toFixed(2)}%`;
        
        let analysis = `**${symbol} Price Analysis:**\n\n`;
        analysis += `💰 **Current Price:** $${price.toLocaleString()}\n`;
        analysis += `📈 **24h Change:** ${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}% (${changeText})\n`;
        analysis += `📊 **Volume:** ${volume ? volume.toLocaleString() : 'N/A'}\n\n`;
        
        // Add technical context
        if (data.technicalData) {
            const { rsi, macd, sma20 } = data.technicalData;
            analysis += `**Technical Context:**\n`;
            analysis += `• RSI: ${rsi.toFixed(2)} ${rsi > 70 ? '(Overbought)' : rsi < 30 ? '(Oversold)' : '(Neutral)'}\n`;
            analysis += `• MACD: ${macd.toFixed(4)} ${macd > 0 ? '(Bullish)' : '(Bearish)'}\n`;
            analysis += `• SMA20: $${sma20.toLocaleString()}\n\n`;
        }
        
        // Add sentiment context
        if (data.sentimentData) {
            const { sentiment, confidence } = data.sentimentData;
            const sentimentText = sentiment > 0.6 ? 'Bullish' : sentiment < 0.4 ? 'Bearish' : 'Neutral';
            analysis += `**Market Sentiment:** ${sentimentText} (${(sentiment * 100).toFixed(1)}% confidence)\n\n`;
        }
        
        // Add key levels
        const support = price * 0.95;
        const resistance = price * 1.05;
        analysis += `**Key Levels:**\n`;
        analysis += `• Support: $${support.toLocaleString()}\n`;
        analysis += `• Resistance: $${resistance.toLocaleString()}\n`;
        
        return analysis;
    }

    generateTechnicalAnalysis(symbol, data, entities) {
        if (!data.technicalData) {
            return `I don't have technical indicator data for ${symbol} at the moment. Please try again in a few moments.`;
        }
        
        const { rsi, macd, sma20 } = data.technicalData;
        
        let analysis = `**${symbol} Technical Analysis:**\n\n`;
        
        // RSI Analysis
        analysis += `**RSI (14):** ${rsi.toFixed(2)}\n`;
        if (rsi > 70) {
            analysis += `• Overbought territory - potential sell signal\n`;
            analysis += `• Consider taking profits or waiting for pullback\n`;
        } else if (rsi < 30) {
            analysis += `• Oversold territory - potential buy signal\n`;
            analysis += `• Consider accumulation or waiting for bounce\n`;
        } else {
            analysis += `• Neutral zone - no extreme signals\n`;
        }
        analysis += `\n`;
        
        // MACD Analysis
        analysis += `**MACD:** ${macd.toFixed(4)}\n`;
        if (macd > 0) {
            analysis += `• Bullish momentum - upward trend likely\n`;
            analysis += `• Consider long positions or holding\n`;
        } else {
            analysis += `• Bearish momentum - downward trend likely\n`;
            analysis += `• Consider short positions or waiting\n`;
        }
        analysis += `\n`;
        
        // Moving Averages
        analysis += `**Moving Averages:**\n`;
        analysis += `• SMA20: $${sma20.toLocaleString()}\n`;
        if (data.priceData && data.priceData.price > sma20) {
            analysis += `• Price above SMA20 - bullish trend\n`;
        } else {
            analysis += `• Price below SMA20 - bearish trend\n`;
        }
        analysis += `\n`;
        
        // Overall Technical Outlook
        let technicalScore = 0;
        if (rsi > 50) technicalScore += 1;
        if (macd > 0) technicalScore += 1;
        if (data.priceData && data.priceData.price > sma20) technicalScore += 1;
        
        analysis += `**Technical Outlook:**\n`;
        if (technicalScore >= 2) {
            analysis += `• **Bullish** - Multiple indicators suggest upward momentum\n`;
            analysis += `• Consider long positions with proper risk management\n`;
        } else if (technicalScore <= 1) {
            analysis += `• **Bearish** - Multiple indicators suggest downward momentum\n`;
            analysis += `• Consider short positions or wait for better entry\n`;
        } else {
            analysis += `• **Neutral** - Mixed signals, wait for clearer direction\n`;
            analysis += `• Consider range trading or wait for breakout\n`;
        }
        
        return analysis;
    }

    generateTradingRecommendation(symbol, data, entities) {
        if (!data.priceData) {
            return `I need more data to provide a trading recommendation for ${symbol}. Please try again in a few moments.`;
        }
        
        const { price, change24h } = data.priceData;
        
        let recommendation = `**${symbol} Trading Recommendation:**\n\n`;
        
        // Risk assessment
        const riskLevel = this.assessRiskLevel(symbol, data);
        recommendation += `**Risk Assessment:** ${riskLevel.level}\n`;
        recommendation += `**Risk Score:** ${riskLevel.score}/10\n`;
        recommendation += `**Risk Factors:** ${riskLevel.factors.join(', ')}\n\n`;
        
        // Generate recommendation based on data
        let signal = 'HOLD';
        let confidence = 0.5;
        
        if (data.technicalData) {
            const { rsi, macd } = data.technicalData;
            if (rsi < 30 && macd > 0) {
                signal = 'BUY';
                confidence = 0.7;
            } else if (rsi > 70 && macd < 0) {
                signal = 'SELL';
                confidence = 0.7;
            }
        }
        
        recommendation += `**Signal:** ${signal}\n`;
        recommendation += `**Confidence:** ${(confidence * 100).toFixed(1)}%\n\n`;
        
        // Position sizing advice
        const positionSize = this.calculatePositionSize(confidence, riskLevel.score);
        recommendation += `**Position Sizing:**\n`;
        recommendation += `• Recommended size: ${positionSize}% of portfolio\n`;
        recommendation += `• Max risk per trade: 2% of portfolio\n`;
        recommendation += `• Stop loss: ${this.calculateStopLoss(price, signal)}%\n`;
        recommendation += `• Take profit: ${this.calculateTakeProfit(price, signal)}%\n\n`;
        
        // Entry strategy
        recommendation += `**Entry Strategy:**\n`;
        if (signal === 'BUY') {
            recommendation += `• Wait for pullback to support levels\n`;
            recommendation += `• Enter in 2-3 smaller positions\n`;
            recommendation += `• Use limit orders for better execution\n`;
        } else if (signal === 'SELL') {
            recommendation += `• Wait for bounce to resistance levels\n`;
            recommendation += `• Exit in 2-3 smaller positions\n`;
            recommendation += `• Use stop orders to protect profits\n`;
        } else {
            recommendation += `• Wait for clearer directional signal\n`;
            recommendation += `• Consider range trading strategies\n`;
            recommendation += `• Monitor for breakout opportunities\n`;
        }
        
        return recommendation;
    }

    assessRiskLevel(symbol, data) {
        let riskScore = 5; // Base risk score
        const factors = [];
        
        // Volatility assessment
        if (data.priceData && Math.abs(data.priceData.change24h) > 10) {
            riskScore += 2;
            factors.push('High volatility');
        }
        
        // Technical risk
        if (data.technicalData) {
            const { rsi } = data.technicalData;
            if (rsi > 70 || rsi < 30) {
                riskScore += 1;
                factors.push('Extreme RSI levels');
            }
        }
        
        // Market sentiment risk
        if (data.sentimentData) {
            const { sentiment } = data.sentimentData;
            if (sentiment > 0.8 || sentiment < 0.2) {
                riskScore += 1;
                factors.push('Extreme sentiment');
            }
        }
        
        // Determine risk level
        let level;
        if (riskScore <= 3) level = 'Low';
        else if (riskScore <= 6) level = 'Medium';
        else if (riskScore <= 8) level = 'High';
        else level = 'Very High';
        
        return { level, score: Math.min(riskScore, 10), factors };
    }

    calculatePositionSize(confidence, riskScore) {
        const baseSize = 5; // 5% base position size
        const confidenceMultiplier = confidence * 2; // 0-2x multiplier
        const riskMultiplier = Math.max(0.5, 1 - (riskScore - 5) * 0.1); // Risk adjustment
        
        return Math.round(baseSize * confidenceMultiplier * riskMultiplier);
    }

    calculateStopLoss(price, signal) {
        if (signal === 'BUY') return 5; // 5% stop loss for long positions
        if (signal === 'SELL') return 5; // 5% stop loss for short positions
        return 3; // 3% stop loss for neutral positions
    }

    calculateTakeProfit(price, signal) {
        if (signal === 'BUY') return 15; // 15% take profit for long positions
        if (signal === 'SELL') return 15; // 15% take profit for short positions
        return 10; // 10% take profit for neutral positions
    }

    generateSentimentAnalysis(symbol, data, entities) {
        if (!data.sentimentData) {
            return `I don't have sentiment data for ${symbol} at the moment. Please try again in a few moments.`;
        }
        
        const { sentiment, confidence } = data.sentimentData;
        const sentimentText = sentiment > 0.6 ? 'Bullish' : sentiment < 0.4 ? 'Bearish' : 'Neutral';
        
        let analysis = `**${symbol} Market Sentiment Analysis:**\n\n`;
        analysis += `**Overall Sentiment:** ${sentimentText}\n`;
        analysis += `**Sentiment Score:** ${(sentiment * 100).toFixed(1)}/100\n`;
        analysis += `**Confidence:** ${(confidence * 100).toFixed(1)}%\n\n`;
        
        // Sentiment interpretation
        if (sentiment > 0.7) {
            analysis += `**Interpretation:**\n`;
            analysis += `• Strong bullish sentiment in the market\n`;
            analysis += `• Investors are optimistic about ${symbol}\n`;
            analysis += `• Consider long positions with proper risk management\n`;
            analysis += `• Watch for potential overbought conditions\n`;
        } else if (sentiment < 0.3) {
            analysis += `**Interpretation:**\n`;
            analysis += `• Strong bearish sentiment in the market\n`;
            analysis += `• Investors are pessimistic about ${symbol}\n`;
            analysis += `• Consider short positions or wait for reversal\n`;
            analysis += `• Watch for potential oversold conditions\n`;
        } else {
            analysis += `**Interpretation:**\n`;
            analysis += `• Neutral sentiment in the market\n`;
            analysis += `• Mixed opinions about ${symbol}\n`;
            analysis += `• Consider range trading or wait for breakout\n`;
            analysis += `• Monitor for sentiment shifts\n`;
        }
        
        return analysis;
    }

    generatePortfolioAdvice(symbol, data, entities) {
        let advice = `**Portfolio Advice for ${symbol}:**\n\n`;
        
        // Risk assessment
        const riskLevel = this.assessRiskLevel(symbol, data);
        advice += `**Risk Assessment:** ${riskLevel.level} (${riskLevel.score}/10)\n\n`;
        
        // Allocation advice
        if (riskLevel.score <= 3) {
            advice += `**Recommended Allocation:**\n`;
            advice += `• Conservative: 5-10% of portfolio\n`;
            advice += `• Moderate: 10-15% of portfolio\n`;
            advice += `• Aggressive: 15-25% of portfolio\n\n`;
        } else if (riskLevel.score <= 6) {
            advice += `**Recommended Allocation:**\n`;
            advice += `• Conservative: 3-5% of portfolio\n`;
            advice += `• Moderate: 5-10% of portfolio\n`;
            advice += `• Aggressive: 10-15% of portfolio\n\n`;
        } else {
            advice += `**Recommended Allocation:**\n`;
            advice += `• Conservative: 1-3% of portfolio\n`;
            advice += `• Moderate: 3-5% of portfolio\n`;
            advice += `• Aggressive: 5-10% of portfolio\n\n`;
        }
        
        // Diversification advice
        advice += `**Diversification Strategy:**\n`;
        advice += `• Don't put all eggs in one basket\n`;
        advice += `• Consider correlation with other assets\n`;
        advice += `• Rebalance portfolio regularly\n`;
        advice += `• Use dollar-cost averaging for large positions\n\n`;
        
        // Risk management
        advice += `**Risk Management:**\n`;
        advice += `• Set stop losses for all positions\n`;
        advice += `• Use position sizing based on risk tolerance\n`;
        advice += `• Monitor portfolio performance regularly\n`;
        advice += `• Consider hedging strategies\n`;
        
        return advice;
    }

    generateRiskAssessment(symbol, data, entities) {
        const riskLevel = this.assessRiskLevel(symbol, data);
        
        let assessment = `**${symbol} Risk Assessment:**\n\n`;
        assessment += `**Overall Risk Level:** ${riskLevel.level} (${riskLevel.score}/10)\n\n`;
        
        // Risk factors
        assessment += `**Risk Factors:**\n`;
        riskLevel.factors.forEach(factor => {
            assessment += `• ${factor}\n`;
        });
        assessment += `\n`;
        
        // Risk mitigation strategies
        assessment += `**Risk Mitigation Strategies:**\n`;
        if (riskLevel.score <= 3) {
            assessment += `• Low risk - standard position sizing acceptable\n`;
            assessment += `• Use 5-10% stop losses\n`;
            assessment += `• Consider longer-term positions\n`;
        } else if (riskLevel.score <= 6) {
            assessment += `• Medium risk - reduce position size\n`;
            assessment += `• Use 3-5% stop losses\n`;
            assessment += `• Monitor positions more closely\n`;
        } else {
            assessment += `• High risk - minimal position size\n`;
            assessment += `• Use 2-3% stop losses\n`;
            assessment += `• Consider paper trading first\n`;
            assessment += `• Wait for better risk/reward ratio\n`;
        }
        
        return assessment;
    }

    generateStrategyAdvice(symbol, data, entities) {
        let advice = `**Trading Strategy Advice for ${symbol}:**\n\n`;
        
        // Strategy recommendations based on market conditions
        if (data.technicalData && data.priceData) {
            const { rsi, macd } = data.technicalData;
            const { change24h } = data.priceData;
            
            if (Math.abs(change24h) > 10) {
                advice += `**High Volatility Strategy:**\n`;
                advice += `• Consider scalping or day trading\n`;
                advice += `• Use tight stop losses (2-3%)\n`;
                advice += `• Take profits quickly (5-10%)\n`;
                advice += `• Monitor positions closely\n\n`;
            } else if (rsi > 70 || rsi < 30) {
                advice += `**Mean Reversion Strategy:**\n`;
                advice += `• Wait for RSI to return to neutral zone\n`;
                advice += `• Use counter-trend positions\n`;
                advice += `• Set wider stop losses (5-7%)\n`;
                advice += `• Target 10-15% profits\n\n`;
            } else {
                advice += `**Trend Following Strategy:**\n`;
                advice += `• Follow the dominant trend\n`;
                advice += `• Use moving averages for entry/exit\n`;
                advice += `• Set trailing stop losses\n`;
                advice += `• Target 15-25% profits\n\n`;
            }
        }
        
        // Risk management
        advice += `**Risk Management:**\n`;
        advice += `• Never risk more than 2% per trade\n`;
        advice += `• Use proper position sizing\n`;
        advice += `• Set stop losses for all positions\n`;
        advice += `• Diversify across multiple assets\n\n`;
        
        // Entry and exit strategies
        advice += `**Entry & Exit Strategies:**\n`;
        advice += `• Use limit orders for better execution\n`;
        advice += `• Enter positions in 2-3 smaller lots\n`;
        advice += `• Take profits at multiple levels\n`;
        advice += `• Use trailing stops to protect profits\n`;
        
        return advice;
    }

    generateGeneralResponse(message, symbol, data, intent) {
        let response = `I understand you're asking about "${message}" regarding ${symbol}.\n\n`;
        
        // Provide general market context
        if (data.priceData) {
            response += `**Current Market Context:**\n`;
            response += `• Price: $${data.priceData.price.toLocaleString()}\n`;
            response += `• 24h Change: ${data.priceData.change24h >= 0 ? '+' : ''}${data.priceData.change24h.toFixed(2)}%\n\n`;
        }
        
        // Suggest specific questions
        response += `**I can help you with:**\n`;
        response += `• Price analysis and technical indicators\n`;
        response += `• Trading recommendations and strategies\n`;
        response += `• Risk assessment and portfolio advice\n`;
        response += `• Market sentiment and news analysis\n`;
        response += `• Entry/exit strategies and position sizing\n\n`;
        
        response += `Could you be more specific about what you'd like to know? For example:\n`;
        response += `• "Should I buy ${symbol} now?"\n`;
        response += `• "What's the technical analysis for ${symbol}?"\n`;
        response += `• "How risky is ${symbol} for my portfolio?"\n`;
        
        return response;
    }
}
