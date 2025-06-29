const { session, serverCredentials, saveState } = require('../index');

const USERNAME = 'your_username';
const PASSWORD = 'your_password';
const STATE_FILE = 'session.json';

(async () => {
    try {
        console.log('🔐 Logging in...');
        await session(USERNAME, PASSWORD);
        await serverCredentials();
        saveState(STATE_FILE);

        console.log('✅ Login successful! Session saved to session.json');
        console.log('Now you can run: node examples/login.js');
    } catch (e) {
        console.error('❌ Login failed:', e.message);
    }
})();