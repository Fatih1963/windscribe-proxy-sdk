const { loadState, getState, serverList, testProxy } = require('../windscribe-sdk');

const STATE_FILE = 'session.json';
const DEFAULT_PORT = 443;

(async () => {
    try {
        // Load existing session
        console.log('📂 Loading existing session...');
        const loaded = loadState(STATE_FILE);

        if (!loaded) {
            console.error('❌ No session found! Please run: node examples/login.js first');
            return;
        }

        const state = getState();
        console.log(`👤 Proxy User: ${state.proxyUsername}`);
        console.log(`📊 Traffic: ${state.trafficUsedFormatted}/${state.trafficMaxFormatted}`);

        // Get server list
        console.log('🌐 Fetching servers...');
        const servers = await serverList();

        // Extract proxy hostnames
        const proxies = [];
        const extract = (obj, location = 'Unknown') => {
            if (obj?.hostname) {
                proxies.push({
                    hostname: obj.hostname,
                    port: obj.port || DEFAULT_PORT,
                    location: obj.name || obj.city || location
                });
            }
            if (typeof obj === 'object') {
                for (const key in obj) {
                    const nextLoc = obj.name || location;
                    const val = obj[key];
                    if (Array.isArray(val)) val.forEach(x => extract(x, nextLoc));
                    else if (typeof val === 'object') extract(val, nextLoc);
                }
            }
        };
        servers.forEach(c => extract(c, c.name));

        console.log(`🚀 Testing ${proxies.length} proxies...\n`);

        // Test all proxies
        for (const proxy of proxies) {
            try {
                const res = await testProxy(proxy.hostname, proxy.port);
                console.log(`✅ ${proxy.location} (${proxy.hostname}) - IP: ${res.ip} (${res.latency}ms)`);
            } catch (err) {
                console.log(`❌ ${proxy.location} (${proxy.hostname}) - ${err.message}`);
            }
        }

    } catch (e) {
        console.error('❌ Error:', e.message);
    }
})();