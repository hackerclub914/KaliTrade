#!/usr/bin/env node

/**
 * KaliTrade - Unified Crypto Trading Platform
 * 
 * This is the main entry point that brings together:
 * - Backend API Server
 * - AI Trading Bot
 * - Web Dashboard
 * - Real-time Data Services
 */

const { spawn, fork } = require('child_process');
const path = require('path');
const fs = require('fs');

class KaliTradeApp {
    constructor() {
        this.processes = new Map();
        this.isRunning = false;
        this.config = {
            backend: {
                port: 3001,
                path: path.join(__dirname, 'backend'),
                script: 'src/index.ts'
            },
            tradingBot: {
                path: path.join(__dirname, 'trading-bot'),
                script: 'main_simple.py'
            },
            webServer: {
                port: 8080,
                path: path.join(__dirname, 'demo')
            }
        };
    }

    async start() {
        console.log('🚀 Starting KaliTrade Unified Platform...\n');
        
        try {
            // Start Backend API Server
            await this.startBackend();
            
            // Start AI Trading Bot
            await this.startTradingBot();
            
            // Start Web Server
            await this.startWebServer();
            
            this.isRunning = true;
            this.setupGracefulShutdown();
            
            console.log('\n✅ KaliTrade Platform Started Successfully!');
            console.log('\n🌐 Access Your Platform:');
            console.log(`   📊 Main Dashboard: http://localhost:${this.config.webServer.port}/`);
            console.log(`   🔧 Trading Platform: http://localhost:${this.config.webServer.port}/advanced-trading-platform.html`);
            console.log(`   🤖 AI Analytics: http://localhost:${this.config.webServer.port}/ai-analytics-dashboard.html`);
            console.log(`   👑 Premium UI: http://localhost:${this.config.webServer.port}/premium-ui.html`);
            console.log(`   🔌 Backend API: http://localhost:${this.config.backend.port}/api`);
            console.log('\n📱 Press Ctrl+C to stop all services\n');
            
        } catch (error) {
            console.error('❌ Failed to start KaliTrade:', error.message);
            await this.stop();
            process.exit(1);
        }
    }

    async startBackend() {
        console.log('🔧 Starting Backend API Server...');
        
        return new Promise((resolve, reject) => {
            const backendPath = this.config.backend.path;
            const scriptPath = path.join(backendPath, this.config.backend.script);
            
            // Check if TypeScript file exists, if not use compiled JS
            const jsPath = path.join(backendPath, 'dist', 'index.js');
            const finalScript = fs.existsSync(scriptPath) ? scriptPath : jsPath;
            
            const backend = spawn('node', ['--loader', 'ts-node/esm', finalScript], {
                cwd: backendPath,
                stdio: ['inherit', 'pipe', 'pipe'],
                env: { ...process.env, PORT: this.config.backend.port }
            });

            backend.stdout.on('data', (data) => {
                const output = data.toString();
                if (output.includes('Server running') || output.includes('listening')) {
                    console.log('✅ Backend API Server started on port', this.config.backend.port);
                    resolve();
                }
            });

            backend.stderr.on('data', (data) => {
                const error = data.toString();
                if (!error.includes('Warning') && !error.includes('deprecated')) {
                    console.error('Backend Error:', error);
                }
            });

            backend.on('error', (error) => {
                console.error('Failed to start backend:', error.message);
                reject(error);
            });

            this.processes.set('backend', backend);
        });
    }

    async startTradingBot() {
        console.log('🤖 Starting AI Trading Bot...');
        
        return new Promise((resolve, reject) => {
            const botPath = this.config.tradingBot.path;
            const scriptPath = path.join(botPath, this.config.tradingBot.script);
            
            if (!fs.existsSync(scriptPath)) {
                console.log('⚠️  Trading bot script not found, skipping...');
                resolve();
                return;
            }

            const bot = spawn('python3', [scriptPath], {
                cwd: botPath,
                stdio: ['inherit', 'pipe', 'pipe']
            });

            let hasStarted = false;
            bot.stdout.on('data', (data) => {
                const output = data.toString();
                if (output.includes('Starting') || output.includes('Initialized')) {
                    if (!hasStarted) {
                        console.log('✅ AI Trading Bot started successfully');
                        hasStarted = true;
                        resolve();
                    }
                }
            });

            bot.stderr.on('data', (data) => {
                const error = data.toString();
                if (error.includes('ERROR')) {
                    console.error('Trading Bot Error:', error);
                }
            });

            bot.on('error', (error) => {
                if (error.code === 'ENOENT') {
                    console.log('⚠️  Python3 not found, trading bot disabled');
                    resolve();
                } else {
                    console.error('Failed to start trading bot:', error.message);
                    reject(error);
                }
            });

            this.processes.set('tradingBot', bot);
            
            // Resolve after 2 seconds if no output
            setTimeout(() => {
                if (!hasStarted) {
                    console.log('✅ AI Trading Bot started (no output detected)');
                    resolve();
                }
            }, 2000);
        });
    }

    async startWebServer() {
        console.log('🌐 Starting Web Server...');
        
        return new Promise((resolve, reject) => {
            const webPath = this.config.webServer.path;
            
            const webServer = spawn('python3', ['-m', 'http.server', this.config.webServer.port], {
                cwd: webPath,
                stdio: ['inherit', 'pipe', 'pipe']
            });

            webServer.stdout.on('data', (data) => {
                const output = data.toString();
                if (output.includes('Serving HTTP')) {
                    console.log('✅ Web Server started on port', this.config.webServer.port);
                    resolve();
                }
            });

            webServer.stderr.on('data', (data) => {
                const error = data.toString();
                if (error.includes('Address already in use')) {
                    console.log('⚠️  Port', this.config.webServer.port, 'already in use, trying alternative...');
                    this.config.webServer.port = 8081;
                    this.startWebServer().then(resolve).catch(reject);
                } else {
                    console.error('Web Server Error:', error);
                }
            });

            webServer.on('error', (error) => {
                if (error.code === 'ENOENT') {
                    console.log('⚠️  Python3 not found, using Node.js alternative...');
                    this.startNodeWebServer().then(resolve).catch(reject);
                } else {
                    console.error('Failed to start web server:', error.message);
                    reject(error);
                }
            });

            this.processes.set('webServer', webServer);
        });
    }

    async startNodeWebServer() {
        return new Promise((resolve, reject) => {
            const express = require('express');
            const app = express();
            const webPath = this.config.webServer.path;
            
            app.use(express.static(webPath));
            
            const server = app.listen(this.config.webServer.port, () => {
                console.log('✅ Web Server started on port', this.config.webServer.port);
                resolve();
            });

            server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    this.config.webServer.port = 8081;
                    this.startNodeWebServer().then(resolve).catch(reject);
                } else {
                    reject(error);
                }
            });

            this.processes.set('webServer', server);
        });
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
            await this.stop();
            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
    }

    async stop() {
        if (!this.isRunning) return;

        console.log('🛑 Stopping KaliTrade Platform...');
        
        for (const [name, process] of this.processes) {
            try {
                console.log(`   Stopping ${name}...`);
                if (process.kill) {
                    process.kill('SIGTERM');
                } else if (process.close) {
                    process.close();
                }
            } catch (error) {
                console.error(`   Error stopping ${name}:`, error.message);
            }
        }

        this.processes.clear();
        this.isRunning = false;
        console.log('✅ KaliTrade Platform stopped');
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            processes: Array.from(this.processes.keys()),
            config: this.config
        };
    }
}

// CLI Interface
if (require.main === module) {
    const app = new KaliTradeApp();
    
    const command = process.argv[2];
    
    switch (command) {
        case 'start':
            app.start().catch(console.error);
            break;
        case 'stop':
            app.stop().then(() => process.exit(0)).catch(console.error);
            break;
        case 'status':
            console.log('KaliTrade Status:', app.getStatus());
            break;
        case 'help':
        default:
            console.log(`
🚀 KaliTrade - Unified Crypto Trading Platform

Usage: node app.js <command>

Commands:
  start   Start the unified platform (default)
  stop    Stop all services
  status  Show current status
  help    Show this help message

Examples:
  node app.js start
  node app.js status
  node app.js stop
            `);
            break;
    }
}

module.exports = KaliTradeApp;
