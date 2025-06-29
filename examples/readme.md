# Windscribe SDK Examples

This directory contains practical usage examples for the Windscribe Proxy SDK.

## Available Examples

### 1. Login (login.js)

Initial authentication and session creation:

🔐 Login with username/password
💾 Save session to session.json
✅ Prepare for subsequent operations

```bash
node examples/login.js
```

### 2. Load and Test All (testproxy.js)

Complete proxy testing using saved session:

📂 Load existing session from session.json
👤 Display account information (username, traffic usage)
🌐 Automatic server list fetching
🧪 Testing all available proxy servers

```bash
node examples/testproxy.js
```

### 3. Custom Request (customreq.js)

Advanced proxy request with customizable SNI (replaces legacy `custom-sni.js`):

🔧 Custom SNI implementation for enhanced privacy  
🌍 IP address verification  
⚡ Latency measurement  
🔒 Protocol information

```bash
node examples/customreq.js


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

### Step 5: (Optional) Try full bulk testing

```bash
node examples/testproxy.js
```

## Example Output

### Login:
```
// examples/login.js

🔐 Logging in...
✅ Login successful! Session saved to session.json
Now you can run: node examples/login.js
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
```

### Custom SNI & Custom Request:
```
// examples/customreq.js

🔧 Testing with custom SNI...
✅ Connection successful!
🌍 Your IP: 142.44.133.45
⚡ Latency: 234ms
🔒 Protocol: HTTPS with SNI: www.google.com
```

## Notes

💾 Session data is automatically saved to session.json  
🔧 www.google.com is the most effective custom SNI option  
⚡ First login may take longer due to authentication  
🌐 Proxy list is dynamically fetched from Windscribe servers  
📂 Always run login.js first to create session.json  
🧪 Use customreq.js for testing custom proxy configurations