const { loadState, getState, serverList, testProxy } = require('../index');

const STATE_FILE = 'session.json';

(async () => {
    try {
        console.log('📂 Loading existing session...');
        
        if (!loadState(STATE_FILE)) {
            console.log('❌ No session found. Run login.js first!');
            return;
        }

        const state = getState();
        console.log(`👤 Proxy User: ${state.username}`);
        console.log(`📊 Traffic: ${state.trafficUsedFormatted}/${state.trafficMaxFormatted}`);
        
        console.log('🌐 Fetching server list...');
        const servers = await serverList();
        
        console.log(`🚀 Testing ${servers.length} proxies...`);
        console.log('');

        let successful = 0;
        let failed = 0;

        for (const server of servers) {
            try {
                const result = await testProxy(server.hostname);
                console.log(`✅ ${server.shortName} (${server.hostname}) - IP: ${result.ip} (${result.latency}ms)`);
                successful++;
            } catch (error) {
                console.log(`❌ ${server.shortName} (${server.hostname}) - ${error.message}`);
                failed++;
            }
        }

        console.log('');
        console.log(`📊 Results: ${successful}/${servers.length} servers working (${Math.round(successful/servers.length*100)}% success rate)`);
        
    } catch (e) {
        console.error('❌ Testing failed:', e.message);
    }
})();
