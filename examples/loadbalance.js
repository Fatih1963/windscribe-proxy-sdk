const { WindscribeSDK } = require('../index');

const STATE_FILE = 'session.json';

(async () => {
    try {
        console.log('⚖️ Testing load balancing...');

        const sdk = new WindscribeSDK({
            autoReconnect: true,
            enableLogging: false
        });

        sdk.loadState(STATE_FILE);

        const servers = [
            'us-east-001.windscribe.com',
            'us-west-001.windscribe.com',
            'ca-toronto-001.windscribe.com'
        ];

        console.log('🔄 Distributing 10 requests across 3 servers...');

        const results = [];
        for (let i = 0; i < 10; i++) {
            const result = await sdk.loadBalanceRequests(servers, 'https://httpbin.org/ip');
            results.push(result);
            console.log(`Request ${i+1}: ${result.server} (${result.latency}ms)`);
        }
        
        const stats = sdk.getStatistics();
        console.log('\n📊 Load Balance Results:');
        console.log(`✅ Success rate: ${stats.successRate}%`);
        console.log(`🚀 Best server: ${stats.bestServer}`);
        console.log(`⚡ Average latency: ${stats.avgLatency}ms`);

    } catch (e) {
        console.error('❌ Load balancing failed:', e.message);
    }
})();