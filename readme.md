# 🌪️ Windscribe Proxy SDK

A powerful and unofficial Node.js SDK for Windscribe proxy services featuring custom SNI support, bulk testing capabilities, and comprehensive session management.

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

## 🚀 Quick Start

```bash
npm install windscribe-proxy-sdk
```

```javascript
const { session, serverCredentials, testProxy } = require('windscribe-proxy-sdk');

// Login and test a proxy
await session('username', 'password');
await serverCredentials();

const result = await testProxy('us-east-001.totallyacdn.com');
console.log(`✅ Connected! IP: ${result.ip}, Latency: ${result.latency}ms`);
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
```

### Server Management
```javascript
// Get all available servers
const servers = await serverList();

// Access account information
const state = getState();
console.log(`Traffic: ${state.trafficUsedFormatted}/${state.trafficMaxFormatted}`);
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

### Quick Setup Steps:
```bash
# Step 1: Update credentials in login.js
# Step 2: Login and save session
node examples/login.js

# Step 3: Test custom proxy with SNI
node examples/customreq.js

# Step 4: (Optional) Test all servers
node examples/testproxy.js
```

## 🔧 Advanced Configuration

### Custom SNI Options
```javascript
// Most effective SNI options (recommended)
customSni: 'www.google.com'     // Best overall performance
customSni: 'cloudflare.com'     // Alternative option
customSni: 'www.microsoft.com'  // Corporate environments
```

### Bulk Testing Configuration
```javascript
const results = await bulkTestProxies(proxies, {
    concurrency: 3,        // Concurrent connections
    timeout: 10000,        // Connection timeout
    customSni: 'www.google.com'
});
```

## 📖 API Reference

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
