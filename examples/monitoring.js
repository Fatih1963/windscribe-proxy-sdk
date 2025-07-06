const { WindscribeSDK } = require('../index');

const STATE_FILE = 'session.json';

(async () => {
    try {
        console.log('🔄 Starting WindscribeSDK with monitoring...');

        const sdk = new WindscribeSDK({
            autoReconnect: true,
            enableLogging: true,
            healthCheckInterval: 30000
        });

        sdk.on('session_created', (data) => {
            console.log(`✅ Session created for: ${data.username}`);
        });

        sdk.on('health_check', (result) => {
            const status = result.latency < 300 ? '✅ Healthy' : '⚠️  Slow';
            console.log(`📊 Health Check: ${status} (${result.latency}ms)`);
        });

        sdk.on('proxy_connected', (server) => {
            console.log(`🔗 Connected to: ${server.hostname}`);
        });

        // Load session and start monitoring
        sdk.loadState(STATE_FILE);
        console.log('🔍 Starting connection monitoring...');

        const monitoring = await sdk.monitorConnection(
            'us-east-001.windscribe.com',
            443,
            120000  // 2 minutes
        );

        console.log('📈 Monitoring completed:', monitoring.summary);

    } catch (e) {
        console.error('❌ Monitoring failed:', e.message);
    }
})();