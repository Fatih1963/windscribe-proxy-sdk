# Windscribe SDK Examples

This directory contains practical usage examples for the Windscribe Proxy SDK, featuring both functional and object-oriented approaches.

## Available Examples

### 1. Login (login.js)
Initial authentication and session creation:
- 🔐 Login with username/password
- 💾 Save session to session.json
- ✅ Prepare for subsequent operations

```bash
node examples/login.js
```

### 2. Load and Test All (testproxy.js)
Complete proxy testing using saved session:
- 📂 Load existing session from session.json
- 👤 Display account information (username, traffic usage)
- 🌐 Automatic server list fetching
- 🧪 Testing all available proxy servers

```bash
node examples/testproxy.js
```

### 3. Custom Request (customreq.js)
Advanced proxy request with customizable SNI:
- 🔧 Custom SNI implementation for enhanced privacy
- 🌍 IP address verification
- ⚡ Latency measurement
- 🔒 Protocol information

```bash
node examples/customreq.js
```

### 4. Advanced Monitoring (monitoring.js)
Real-time connection monitoring with health checks:
- 📊 Continuous connection monitoring
- 🔍 Health check automation
- 📈 Real-time latency tracking
- 🔄 Auto-reconnect demonstration
- 📱 Event-driven notifications

```bash
node examples/monitoring.js
```

### 5. Load Balancing (loadbalance.js)
Smart request distribution across multiple servers:
- ⚖️ Load balancing with round-robin strategy
- 🔄 Automatic failover handling
- 📊 Performance comparison
- 🎯 Best server selection
- 📈 Success rate tracking

```bash
node examples/loadbalance.js
```

### 6. Server Discovery (discovery.js)
Intelligent server selection and optimization:
- 🔍 Find best servers by location
- 📊 Performance-based filtering
- 🌍 Geographic optimization
- ⚡ Latency-based ranking
- 💾 Smart caching

```bash
node examples/discovery.js
```

## Quick Setup

### Step 1: Update credentials in login.js
```javascript
const USERNAME = 'your_username';
const PASSWORD = 'your_password';
```

### Step 2: Login and save session
```bash
node examples/login.js
```

### Step 3: Test custom proxy with SNI
```bash
node examples/customreq.js
```

### Step 4: (Optional) Test all servers using saved session
```bash
node examples/testproxy.js
```

### Step 5: (Optional) Try advanced monitoring
```bash
node examples/monitoring.js
```

### Step 6: (Optional) Test load balancing
```bash
node examples/loadbalance.js
```

### Step 7: (Optional) Try server discovery
```bash
node examples/discovery.js
```

## Example Output

### Login:
```
// examples/login.js

🔐 Logging in...
✅ Login successful! Session saved to session.json
👤 Welcome: WS_1234567890
📊 Traffic: 833.55 KB/10.00 GB
🌐 Available servers: 42

Now you can run other examples!
```

### Test All Proxies:
```
// examples/testproxy.js

📂 Loading existing session...
👤 Proxy User: WS_1234567890
📊 Traffic: 833.55 KB/10.00 GB
🚀 Testing 42 proxies...

✅ Canada Toronto (ca-toronto-003.whiskergalaxy.com) - IP: 142.44.133.45 (234ms)
✅ US East (us-east-026.whiskergalaxy.com) - IP: 198.7.58.232 (156ms)
❌ UK London (uk-london-018.whiskergalaxy.com) - Proxy error: timeout

📊 Results: 38/42 servers working (90.5% success rate)
```

### Custom SNI & Custom Request:
```
// examples/customreq.js

🔧 Testing with custom SNI...
✅ Connection successful!
🌍 Your IP: 142.44.133.45
⚡ Latency: 234ms
🔒 Protocol: HTTPS with SNI: www.google.com
🌐 Location: Toronto, Canada
```

### Advanced Monitoring:
```
// examples/monitoring.js

🔄 Starting WindscribeSDK with monitoring...
✅ Session created for: WS_1234567890
🔍 Starting connection monitoring...

📊 Health Check: ✅ Healthy (187ms)
📊 Health Check: ✅ Healthy (201ms)
📊 Health Check: ⚠️  Slow (456ms)
📊 Health Check: ✅ Healthy (198ms)

📈 Monitoring completed:
   - Average latency: 210ms
   - Success rate: 100%
   - Packet loss: 0%
```

### Load Balancing:
```
// examples/loadbalance.js

⚖️ Testing load balancing...
🔄 Distributing 10 requests across 3 servers...

📊 Load Balance Results:
   - us-east-001: 4 requests (avg: 156ms)
   - us-west-001: 3 requests (avg: 203ms)
   - ca-toronto-001: 3 requests (avg: 234ms)
   
✅ Overall success rate: 100%
🚀 Best server: us-east-001 (156ms avg)
```

### Server Discovery:
```
// examples/discovery.js

🔍 Discovering best servers...
📍 Searching for US servers with <300ms latency...

🏆 Top 5 servers found:
   1. us-east-001.whiskergalaxy.com (156ms) ⭐
   2. us-central-012.whiskergalaxy.com (187ms)
   3. us-west-005.whiskergalaxy.com (203ms)
   4. us-east-026.whiskergalaxy.com (234ms)
   5. us-west-018.whiskergalaxy.com (267ms)

💾 Results cached for 10 minutes
```

## Usage Patterns

### Functional API (Simple)
```javascript
const { session, testProxy } = require('windscribe-proxy-sdk');

await session('user', 'pass');
const result = await testProxy('proxy.windscribe.com');
```

### OOP API (Advanced)
```javascript
const { WindscribeSDK } = require('windscribe-proxy-sdk');

const sdk = new WindscribeSDK({ autoReconnect: true });
sdk.on('proxy_connected', (data) => console.log('Connected!', data));

await sdk.session('user', 'pass');
const servers = await sdk.findBestServers({ country: 'US' });
```

## Notes

- 💾 Session data is automatically saved to `session.json`
- 🔧 `www.google.com` is the most effective custom SNI option
- ⚡ First login may take longer due to authentication
- 🌐 Proxy list is dynamically fetched from Windscribe servers
- 📂 Always run `login.js` first to create `session.json`
- 🧪 Use `customreq.js` for testing custom proxy configurations
- 📊 Advanced examples demonstrate OOP API with event handling
- 🔄 Monitoring examples show real-time connection tracking
- ⚖️ Load balancing examples demonstrate smart request distribution
- 🔍 Discovery examples show intelligent server selection
