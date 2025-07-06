const { WindscribeSDK } = require('../index');

const STATE_FILE = 'session.json';

(async () => {
    try {
        console.log('🔍 Discovering best servers...');

        const sdk = new WindscribeSDK({
            enableLogging: false
        });

        sdk.loadState(STATE_FILE);

        console.log('📍 Searching for US servers with <300ms latency...');

        const bestServers = await sdk.findBestServers({
            country: 'US',
            maxLatency: 300,
            testCount: 5,
            excludeFailed: true
        });

        console.log('\n🏆 Top 5 servers found:');
        bestServers.forEach((server, index) => {
            const star = index === 0 ? '⭐' : '';
            console.log(`   ${index + 1}. ${server.hostname} (${server.latency}ms) ${star}`);
        });

        if (bestServers.length > 0) {
            const bestServer = bestServers[0];
            console.log(`\n🧪 Testing best server: ${bestServer.hostname}`);

            const testResult = await sdk.testServerLatency(bestServer.hostname, 3);
            console.log(`📊 Latency test: ${testResult.avgLatency}ms (${testResult.rounds} rounds)`);
        }

        console.log('\n💾 Results cached for 10 minutes');

    } catch (e) {
        console.error('❌ Server discovery failed:', e.message);
    }
})();