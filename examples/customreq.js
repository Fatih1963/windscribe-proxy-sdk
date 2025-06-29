const { testCustomProxy, loadState } = require('../index');

async function customSniExample() {
    try {
        // Load saved session
        loadState('session.json');

        console.log('🔧 Testing with custom SNI...');

        const testOptions = {
            hostname: 'ca-west-018.totallyacdn.com',
            port: 443,
            targetUrl: 'https://httpbin.org/ip',
            customSni: 'www.google.com', // Most effective SNI
            timeout: 10000
        };

        const result = await testCustomProxy(testOptions);

        if (result.success) {
            console.log(`✅ Connection successful!`);
            console.log(`🌍 Your IP: ${result.response.origin}`);
            console.log(`⚡ Latency: ${result.latency}ms`);
            console.log(`🔒 Protocol: ${result.protocol}`);
        } else {
            console.log(`❌ Connection failed: ${result.error}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

customSniExample();