# 🌪️ Windscribe Proxy SDK

A powerful and unofficial Node.js SDK for Windscribe proxy services featuring custom SNI support, bulk testing capabilities, comprehensive session management, and advanced monitoring.

[![npm version](https://badge.fury.io/js/windscribe-proxy-sdk.svg)](https://www.npmjs.com/package/windscribe-proxy-sdk)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E=14.0.0-brightgreen)](https://nodejs.org)

## ✨ Features

- 🔐 **Smart Authentication** - Automatic session management with 2FA support
- 🌐 **Custom SNI Support** - Enhanced privacy with configurable SNI masking
- 🚀 **Bulk Proxy Testing** - Test multiple proxies concurrently with detailed metrics
- 📊 **Real-time Analytics** - Traffic usage, latency monitoring, and success rates
- 💾 **State Persistence** - Automatic session saving and loading
- 🔍 **Smart DNS Resolution** - Multiple resolver support with intelligent fallback
- 🛡️ **TLS Security** - Advanced TLS configurations with custom certificate handling
- 🎯 **OOP Interface** - Modern class-based API with event-driven architecture
- 🔄 **Auto-Reconnect** - Automatic connection recovery and health monitoring
- ⚖️ **Load Balancing** - Smart request distribution across multiple servers
- 📈 **Advanced Monitoring** - Real-time connection monitoring and analytics

## 🚀 Quick Start

```bash
npm install windscribe-proxy-sdk
```

### Basic Usage (Functional API)
```javascript
const { session, serverCredentials, testProxy } = require('windscribe-proxy-sdk');

// Login and test a proxy
await session('username', 'password');
await serverCredentials();

const result = await testProxy('us-east-001.totallyacdn.com');
console.log(`✅ Connected! IP: ${result.ip}, Latency: ${result.latency}ms`);
```

### Advanced Usage (OOP API)
```javascript
const { WindscribeSDK } = require('windscribe-proxy-sdk');

const sdk = new WindscribeSDK({
    autoReconnect: true,
    enableLogging: true,
    healthCheckInterval: 30000
});

// Event-driven monitoring
sdk.on('proxy_connected', (server) => {
    console.log(`Connected to: ${server.hostname}`);
});

sdk.on('health_check', (result) => {
    console.log(`Health: ${result.status}, Latency: ${result.latency}ms`);
});

// Advanced operations
await sdk.session('username', 'password');
const bestServers = await sdk.findBestServers({
    country: 'US',
    maxLatency: 500,
    testCount: 10
});
```

## 📚 Core API

### Authentication
```javascript
// Basic login
await session('username', 'password');

// Login with 2FA
await session('username', 'password', '123456');

// Get proxy credentials
await serverCredentials();
```

### Proxy Testing
```javascript
// Test single proxy
const result = await testProxy('proxy.windscribe.com');

// Advanced testing with custom SNI
const result = await testCustomProxy({
    hostname: 'proxy.windscribe.com',
    port: 443,
    customSni: 'www.google.com',
    targetUrl: 'https://httpbin.org/ip'
});

// Bulk testing with concurrency
const results = await bulkTestProxies(proxies, {
    concurrency: 5,
    timeout: 10000,
    customSni: 'www.google.com'
});
```

### Advanced Features (OOP API)
```javascript
// Find best servers by location
const bestServers = await sdk.findBestServers({
    country: 'US',
    maxLatency: 300,
    testCount: 5
});

// Real-time connection monitoring
const monitoring = await sdk.monitorConnection(
    'us-central-001.windscribe.com',
    443,
    60000  // Monitor for 1 minute
);

// Load balancing across servers
const response = await sdk.loadBalanceRequests([
    'us-east-001.windscribe.com',
    'us-west-001.windscribe.com'
], 'https://httpbin.org/ip');

// Get detailed statistics
const stats = sdk.getStatistics();
console.log(`Success Rate: ${stats.successRate}%`);
```

## 💡 Examples

Check out the [`examples/`](examples/) directory for complete usage examples:

### 1. **[Login](examples/login.js)** - Initial authentication and session creation
```bash
# Update credentials in login.js first
node examples/login.js
```

### 2. **[Test All Proxies](examples/testproxy.js)** - Complete proxy testing using saved session
```bash
# Load session and test all available servers
node examples/testproxy.js
```

### 3. **[Custom Request](examples/customreq.js)** - Advanced proxy request with custom SNI
```bash
# Test with enhanced privacy using custom SNI
node examples/customreq.js
```

### 4. **[Advanced Monitoring](examples/monitoring.js)** - Real-time connection monitoring
```bash
# Monitor proxy connections with health checks
node examples/monitoring.js
```

### 5. **[Load Balancing](examples/loadbalance.js)** - Smart request distribution
```bash
# Distribute requests across multiple servers
node examples/loadbalance.js
```

### Quick Setup Steps:
```bash
# Step 1: Update credentials in login.js
# Step 2: Login and save session
node examples/login.js

# Step 3: Test custom proxy with SNI
node examples/customreq.js

# Step 4: (Optional) Test all servers
node examples/testproxy.js

# Step 5: (Optional) Try advanced monitoring
node examples/monitoring.js
```

## 🔧 Advanced Configuration

### Custom SNI Options
```javascript
// Most effective SNI options (recommended)
customSni: 'www.google.com'     // Best overall performance
customSni: 'cloudflare.com'     // Alternative option
customSni: 'www.microsoft.com'  // Corporate environments
```

### WindscribeSDK Class Options
```javascript
const sdk = new WindscribeSDK({
    autoReconnect: true,           // Enable auto-reconnection
    enableLogging: true,           // Enable debug logging
    healthCheckInterval: 30000,    // Health check interval (ms)
    maxRetries: 3,                 // Max connection retries
    timeout: 10000,                // Request timeout (ms)
    cacheTimeout: 600000           // Server cache timeout (ms)
});
```

### Bulk Testing Configuration
```javascript
const results = await bulkTestProxies(proxies, {
    concurrency: 3,        // Concurrent connections
    timeout: 10000,        // Connection timeout
    customSni: 'www.google.com',
    retries: 2            // Retry failed connections
});
```

## 📖 API Reference

### Functional API
| Method | Description | Returns |
|--------|-------------|---------|
| `session(user, pass, 2fa?)` | Authenticate with Windscribe | `Promise<Object>` |
| `serverCredentials()` | Get proxy credentials | `Promise<Object>` |
| `serverList()` | Fetch available servers | `Promise<Array>` |
| `testProxy(hostname, port?)` | Test single proxy | `Promise<Object>` |
| `testCustomProxy(options)` | Advanced proxy testing | `Promise<Object>` |
| `bulkTestProxies(proxies, opts?)` | Test multiple proxies | `Promise<Object>` |
| `saveState(filename)` | Save session state | `Boolean` |
| `loadState(filename)` | Load session state | `Boolean` |
| `getState()` | Get current state | `Object` |

### WindscribeSDK Class Methods
| Method | Description | Returns |
|--------|-------------|---------|
| `session(user, pass, 2fa?)` | Authenticate and create session | `Promise<Object>` |
| `findBestServers(options)` | Find optimal servers by criteria | `Promise<Array>` |
| `monitorConnection(host, port, duration)` | Monitor connection in real-time | `Promise<Object>` |
| `loadBalanceRequests(servers, url)` | Distribute requests across servers | `Promise<Object>` |
| `testServerLatency(hostname, rounds)` | Multi-round latency testing | `Promise<Object>` |
| `getAccountInfo()` | Get account information | `Object` |
| `getStatistics()` | Get detailed statistics | `Object` |
| `clearCache()` | Clear server cache | `void` |

### Events (WindscribeSDK)
| Event | Description | Data |
|-------|-------------|------|
| `session_created` | Session successfully created | `{username, traffic, servers}` |
| `proxy_connected` | Proxy connection established | `{hostname, ip, latency}` |
| `proxy_failed` | Proxy connection failed | `{hostname, error}` |
| `health_check` | Health check completed | `{status, latency, timestamp}` |
| `monitoring_result` | Monitoring data available | `{server, results}` |
| `bulk_test_completed` | Bulk testing finished | `{total, successful, failed}` |

## 🛠️ Requirements

- Node.js 14.0.0 or higher
- Valid Windscribe account
- Internet connection

## ⚖️ License

Apache 2.0 License - see [LICENSE](LICENSE) file for details.

## 🚨 Disclaimer

This is an unofficial SDK created for educational purposes. Please respect Windscribe's Terms of Service and use responsibly.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

<div align="center">
  <strong>Built with ❤️ for the privacy community</strong>
</div>
