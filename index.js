const crypto = require('crypto');
const https = require('https');
const http = require('http');
const tls = require('tls');
const net = require('net');
const fs = require('fs');
const { URL } = require('url');
const dns = require('dns').promises;
const EventEmitter = require('events');

const DEFAULT_CLIENT_AUTH_SECRET = '952b4412f002315aa50751032fcaab03';
const ASSUMED_PROXY_PORT = 443;
const SESSION_TYPE_EXT = 2;

const DNS_RESOLVERS = [
    'https://1.1.1.1/dns-query',
    'https://dns.google/dns-query',
    'https://dns.adguard.com/dns-query',
    'quic://dns.adguard.com',
    'tls://dns.cloudflare.com',
    'tls://dns.google',
    'sdns://AgMAAAAAAAAABzEuMS4xLjEAEmRucy5jbG91ZGZsYXJlLmNvbQ'
];

const endpoints = {
    Session: 'https://api.windscribe.com/Session',
    serverlist: 'https://assets.windscribe.com/serverlist',
    ServerCredentials: 'https://api.windscribe.com/ServerCredentials',
    BestLocation: 'https://api.windscribe.com/BestLocation',
    AccountStatus: 'https://api.windscribe.com/UserStatus',
    TrafficUsage: 'https://api.windscribe.com/TrafficUsage'
};

const settings = {
    clientAuthSecret: DEFAULT_CLIENT_AUTH_SECRET,
    platform: 'chrome',
    type: 'chrome',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    origin: 'chrome-extension://hnmpcagpplmpfojmgmnngilcnanddlhb',
    sessionType: SESSION_TYPE_EXT,
    endpoints: endpoints,
    autoReconnect: false,
    maxRetries: 3,
    retryDelay: 1000,
    healthCheckInterval: 30000,
    enableLogging: false
};

let state = {
    tokenId: '',
    token: '',
    tokenSignature: '',
    tokenSignatureTime: '0',
    locHash: '',
    locRev: 0,
    isPremium: false,
    status: 0,
    userId: '',
    sessionAuthHash: '',
    proxyUsername: '',
    proxyPassword: '',
    settings: settings,
    trafficUsage: 8.13,
    trafficUsedFormatted: '833.55 KB',
    trafficMaxFormatted: '10.00 GB',
    sessionExpiry: 0,
    lastHeartbeat: 0,
    connectedServers: [],
    failedServers: [],
    serverCache: null,
    serverCacheExpiry: 0
};

class WindscribeSDK extends EventEmitter {
    constructor(options = {}) {
        super();
        this.settings = { ...settings, ...options };
        this.state = { ...state };
        this.healthCheckTimer = null;
        this.retryAttempts = new Map();

        if (this.settings.enableLogging) {
            this.setupLogging();
        }

        if (this.settings.autoReconnect) {
            this.startHealthCheck();
        }
    }

    setupLogging() {
        this.on('session_created', (data) => {
            console.log(`[WindscribeSDK] Session created for user: ${data.userId}`);
        });

        this.on('proxy_connected', (server) => {
            console.log(`[WindscribeSDK] Connected to proxy: ${server.hostname}`);
        });

        this.on('proxy_failed', (server, error) => {
            console.log(`[WindscribeSDK] Proxy failed: ${server.hostname} - ${error}`);
        });

        this.on('health_check', (status) => {
            console.log(`[WindscribeSDK] Health check: ${status.alive ? 'OK' : 'FAILED'}`);
        });
    }

    startHealthCheck() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }

        this.healthCheckTimer = setInterval(async () => {
            try {
                const status = await this.healthCheck();
                this.emit('health_check', status);

                if (!status.alive && this.settings.autoReconnect) {
                    this.emit('attempting_reconnect');
                    await this.reconnect();
                }
            } catch (error) {
                this.emit('health_check_error', error);
            }
        }, this.settings.healthCheckInterval);
    }

    async healthCheck() {
        try {
            if (!this.state.sessionAuthHash) {
                return { alive: false, reason: 'No active session' };
            }

            const servers = await this.getServerList();
            if (servers && servers.length > 0) {
                const randomServer = servers[Math.floor(Math.random() * servers.length)];
                const testResult = await this.testProxy(randomServer.hostname, randomServer.port || 443, 5000);

                return {
                    alive: testResult.success,
                    reason: testResult.success ? 'OK' : testResult.error,
                    testedServer: randomServer.hostname
                };
            }

            return { alive: false, reason: 'No servers available' };
        } catch (error) {
            return { alive: false, reason: error.message };
        }
    }

    async reconnect() {
        this.emit('reconnect_attempt');
        // TODO
    }

    async getAccountInfo() {
        if (!this.state.sessionAuthHash) {
            throw new Error('No active session. Please login first.');
        }

        const clientAuthSecret = this.state.settings.clientAuthSecret || DEFAULT_CLIENT_AUTH_SECRET;
        const { hash: clientAuthHash, time: authTime } = makeAuthHash(clientAuthSecret);

        const url = new URL(this.state.settings.endpoints.AccountStatus);
        url.searchParams.append('client_auth_hash', clientAuthHash);
        url.searchParams.append('session_auth_hash', this.state.sessionAuthHash);
        url.searchParams.append('time', authTime);

        const options = {
            method: 'GET',
            headers: {
                'User-Agent': this.state.settings.userAgent,
                'Accept': 'application/json'
            }
        };

        const response = await makeRequest({
            ...options,
            hostname: url.hostname,
            path: url.pathname + url.search,
            port: 443
        });

        return response.data;
    }

    async getBestLocation() {
        const clientAuthSecret = this.state.settings.clientAuthSecret || DEFAULT_CLIENT_AUTH_SECRET;
        const { hash: clientAuthHash, time: authTime } = makeAuthHash(clientAuthSecret);

        const url = new URL(this.state.settings.endpoints.BestLocation);
        url.searchParams.append('client_auth_hash', clientAuthHash);
        url.searchParams.append('time', authTime);

        const options = {
            method: 'GET',
            headers: {
                'User-Agent': this.state.settings.userAgent,
                'Accept': 'application/json'
            }
        };

        const response = await makeRequest({
            ...options,
            hostname: url.hostname,
            path: url.pathname + url.search,
            port: 443
        });

        return response.data;
    }

    async getServerList(useCache = true) {
        const now = Date.now();

        if (useCache && this.state.serverCache && now < this.state.serverCacheExpiry) {
            return this.state.serverCache;
        }

        const servers = await serverList();

        this.state.serverCache = servers;
        this.state.serverCacheExpiry = now + (10 * 60 * 1000);

        return servers;
    }

    async findBestServers(options = {}) {
        const {
            country = null,
            city = null,
            maxLatency = 1000,
            testCount = 5,
            protocol = 'https'
        } = options;

        let servers = await this.getServerList();

        if (country) {
            servers = servers.filter(s =>
                s.country_code?.toLowerCase() === country.toLowerCase() ||
                s.location?.toLowerCase().includes(country.toLowerCase())
            );
        }

        if (city) {
            servers = servers.filter(s =>
                s.city?.toLowerCase() === city.toLowerCase() ||
                s.location?.toLowerCase().includes(city.toLowerCase())
            );
        }

        if (servers.length === 0) {
            throw new Error('No servers found matching criteria');
        }

        const testServers = servers.slice(0, testCount);
        const testResults = await this.bulkTestProxies(
            testServers.map(s => ({ hostname: s.hostname, port: s.port || 443 })),
            { concurrency: 3, timeout: 5000 }
        );

        const goodServers = testResults.results
            .filter(r => r.success && r.latency <= maxLatency)
            .sort((a, b) => a.latency - b.latency);

        return {
            tested: testResults.total,
            successful: goodServers.length,
            servers: goodServers,
            averageLatency: goodServers.length > 0 ?
                Math.round(goodServers.reduce((sum, s) => sum + s.latency, 0) / goodServers.length) : 0
        };
    }

    async testServerLatency(hostname, port = 443, rounds = 3) {
        const results = [];

        for (let i = 0; i < rounds; i++) {
            try {
                const result = await this.testProxy(hostname, port, 5000);
                if (result.success) {
                    results.push(result.latency);
                }
            } catch (error) {
                
            }

            if (i < rounds - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        if (results.length === 0) {
            return { success: false, error: 'All test rounds failed' };
        }

        const avgLatency = Math.round(results.reduce((a, b) => a + b, 0) / results.length);
        const minLatency = Math.min(...results);
        const maxLatency = Math.max(...results);
        const jitter = maxLatency - minLatency;

        return {
            success: true,
            hostname,
            rounds: results.length,
            averageLatency: avgLatency,
            minLatency,
            maxLatency,
            jitter,
            packetLoss: ((rounds - results.length) / rounds * 100).toFixed(1) + '%'
        };
    }

    async monitorConnection(hostname, port = 443, duration = 60000, interval = 5000) {
        const results = [];
        const startTime = Date.now();
        const endTime = startTime + duration;

        this.emit('monitoring_started', { hostname, port, duration });

        while (Date.now() < endTime) {
            const testResult = await this.testProxy(hostname, port, 3000);

            results.push({
                timestamp: Date.now(),
                success: testResult.success,
                latency: testResult.latency,
                error: testResult.error || null
            });

            this.emit('monitoring_result', testResult);

            if (Date.now() + interval < endTime) {
                await new Promise(resolve => setTimeout(resolve, interval));
            }
        }

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        const summary = {
            hostname,
            port,
            duration,
            totalTests: results.length,
            successful: successful.length,
            failed: failed.length,
            successRate: ((successful.length / results.length) * 100).toFixed(2) + '%',
            averageLatency: successful.length > 0 ?
                Math.round(successful.reduce((sum, r) => sum + r.latency, 0) / successful.length) : 0,
            minLatency: successful.length > 0 ? Math.min(...successful.map(r => r.latency)) : 0,
            maxLatency: successful.length > 0 ? Math.max(...successful.map(r => r.latency)) : 0,
            results
        };

        this.emit('monitoring_completed', summary);
        return summary;
    }

    async loadBalanceRequests(servers, requests, options = {}) {
        const { strategy = 'round-robin', retryFailedRequests = true } = options;

        if (!Array.isArray(servers) || servers.length === 0) {
            throw new Error('No servers provided for load balancing');
        }

        const results = [];
        let serverIndex = 0;

        for (let i = 0; i < requests.length; i++) {
            const request = requests[i];
            let success = false;
            let attempts = 0;
            const maxAttempts = retryFailedRequests ? servers.length : 1;

            while (!success && attempts < maxAttempts) {
                const server = servers[serverIndex % servers.length];

                try {
                    const result = await this.testCustomProxy({
                        hostname: server.hostname || server,
                        port: server.port || 443,
                        targetUrl: request.url || request,
                        method: request.method || 'GET',
                        headers: request.headers || {},
                        timeout: request.timeout || 10000
                    });

                    results.push({
                        requestIndex: i,
                        server: server.hostname || server,
                        success: result.success,
                        result: result
                    });

                    success = result.success;
                } catch (error) {
                    if (attempts === maxAttempts - 1) {
                        results.push({
                            requestIndex: i,
                            server: server.hostname || server,
                            success: false,
                            error: error.message
                        });
                    }
                }

                attempts++;
                serverIndex++;
            }
        }

        return {
            totalRequests: requests.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        };
    }

    getStatistics() {
        return {
            session: {
                userId: this.state.userId,
                isPremium: this.state.isPremium,
                status: this.state.status,
                sessionAge: this.state.sessionAuthHash ? Date.now() - this.state.lastHeartbeat : 0
            },
            traffic: {
                usage: this.state.trafficUsage,
                used: this.state.trafficUsedFormatted,
                max: this.state.trafficMaxFormatted
            },
            servers: {
                connected: this.state.connectedServers.length,
                failed: this.state.failedServers.length,
                cached: this.state.serverCache ? this.state.serverCache.length : 0,
                cacheExpiry: this.state.serverCacheExpiry
            },
            health: {
                lastCheck: this.state.lastHeartbeat,
                autoReconnect: this.settings.autoReconnect,
                checkInterval: this.settings.healthCheckInterval
            }
        };
    }

    clearCache() {
        this.state.serverCache = null;
        this.state.serverCacheExpiry = 0;
        this.retryAttempts.clear();
        this.emit('cache_cleared');
    }

    destroy() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }

        this.removeAllListeners();
        this.emit('sdk_destroyed');
    }

    async session(username, password, tfacode = '') {
        try {
            const result = await session(username, password, tfacode);
            this.state = { ...this.state, ...state };
            this.emit('session_created', { userId: this.state.userId, isPremium: this.state.isPremium });
            return result;
        } catch (error) {
            this.emit('session_error', error);
            throw error;
        }
    }

    async serverCredentials() {
        try {
            const result = await serverCredentials();
            this.state = { ...this.state, ...state };
            this.emit('credentials_updated');
            return result;
        } catch (error) {
            this.emit('credentials_error', error);
            throw error;
        }
    }

    async testProxy(hostname, port = 443, timeout = 10000) {
        try {
            const result = await testProxy(hostname, port, timeout);

            if (result.success) {
                this.emit('proxy_connected', { hostname, port, latency: result.latency });

                if (!this.state.connectedServers.find(s => s.hostname === hostname)) {
                    this.state.connectedServers.push({ hostname, port, lastConnected: Date.now() });
                }
            } else {
                this.emit('proxy_failed', { hostname, port }, result.error);

                if (!this.state.failedServers.find(s => s.hostname === hostname)) {
                    this.state.failedServers.push({ hostname, port, lastFailed: Date.now(), error: result.error });
                }
            }

            return result;
        } catch (error) {
            this.emit('proxy_error', { hostname, port }, error);
            throw error;
        }
    }

    async testCustomProxy(options) {
        return await testCustomProxy(options);
    }

    async bulkTestProxies(proxies, options = {}) {
        const result = await bulkTestProxies(proxies, options);
        this.emit('bulk_test_completed', result);
        return result;
    }
}

class ProxyDialer {
    constructor(options) {
        this.address = options.address;
        this.tlsServerName = options.tlsServerName || '';
        this.auth = options.auth;
        this.caPool = options.caPool;
        this.sni = options.sni || '';
        this.scheme = options.scheme || 'https';
    }

    static fromURL(urlString, options = {}) {
        const url = new URL(urlString);
        const host = url.hostname;
        let port = url.port;
        let tlsServerName = '';
        let scheme = url.protocol.replace(':', '');

        if (scheme === 'http') {
            if (!port) port = '80';
        } else if (scheme === 'https') {
            if (!port) port = '443';
            tlsServerName = host;
        } else {
            throw new Error('Unsupported proxy type: ' + scheme);
        }

        const auth = url.username && url.password ?
            () => basicAuthHeader(url.username, url.password) :
            options.auth || null;

        return new ProxyDialer({
            address: `${host}:${port}`,
            tlsServerName,
            auth,
            caPool: options.caPool,
            sni: options.sni || '',
            scheme
        });
    }

    async dial(targetHost, targetPort, options = {}) {
        const { timeout = 10000 } = options;
        const [proxyHost, proxyPort] = this.address.split(':');

        return new Promise(async (resolve, reject) => {
            try {
                const proxyIp = await resolveHostname(proxyHost);
                const socket = net.connect({
                    host: proxyIp,
                    port: parseInt(proxyPort),
                    timeout: timeout
                });

                socket.on('error', (err) => {
                    socket.destroy();
                    reject(err);
                });

                socket.on('timeout', () => {
                    socket.destroy();
                    reject(new Error('Proxy connection timed out'));
                });

                socket.on('connect', async () => {
                    try {
                        let proxyConn = socket;
                        if (this.scheme === 'https') {
                            const tlsOptions = {
                                socket: proxyConn,
                                servername: this.sni || this.tlsServerName,
                                rejectUnauthorized: this.caPool ? true : false,
                                ca: this.caPool
                            };

                            proxyConn = await new Promise((resolveTls, rejectTls) => {
                                const tlsSocket = tls.connect(tlsOptions);

                                const tlsTimeout = setTimeout(() => {
                                    tlsSocket.destroy();
                                    rejectTls(new Error('TLS handshake timed out'));
                                }, 5000);

                                tlsSocket.on('error', (err) => {
                                    clearTimeout(tlsTimeout);
                                    tlsSocket.destroy();
                                    rejectTls(err);
                                });

                                tlsSocket.on('secureConnect', () => {
                                    clearTimeout(tlsTimeout);
                                    resolveTls(tlsSocket);
                                });
                            });
                        }

                        const authHeader = this.auth ?
                            `Proxy-Authorization: ${this.auth()}\r\n` : '';

                        const connectReq =
                            `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
                            `Host: ${targetHost}:${targetPort}\r\n` +
                            authHeader +
                            `\r\n`;

                        proxyConn.write(connectReq);

                        let responseData = '';
                        const responseTimeout = setTimeout(() => {
                            proxyConn.removeListener('data', responseHandler);
                            proxyConn.destroy();
                            reject(new Error('Timeout waiting for proxy response'));
                        }, 5000);

                        const responseHandler = (data) => {
                            responseData += data.toString();

                            if (responseData.includes('\r\n\r\n')) {
                                clearTimeout(responseTimeout);
                                proxyConn.removeListener('data', responseHandler);

                                if (responseData.match(/HTTP\/1\.[01]\s+200/)) {
                                    resolve(proxyConn);
                                } else {
                                    const statusLine = responseData.split('\r\n')[0];
                                    proxyConn.destroy();
                                    reject(new Error(`Proxy connection failed: ${statusLine}`));
                                }
                            }
                        };

                        proxyConn.on('data', responseHandler);
                    } catch (err) {
                        socket.destroy();
                        reject(err);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }
}

class FakeSNIDialer {
    constructor(options) {
        this.caPool = options.caPool;
        this.sni = options.sni || '';
    }

    async dialTLS(targetHost, targetPort, options = {}) {
        const { timeout = 10000, proxyDialer = null } = options;

        try {
            let socket;
            if (proxyDialer) {
                socket = await proxyDialer.dial(targetHost, targetPort, { timeout });
            } else {
                const ip = await resolveHostname(targetHost);
                socket = await new Promise((resolve, reject) => {
                    const conn = net.connect({
                        host: ip,
                        port: targetPort,
                        timeout: timeout
                    });

                    conn.on('connect', () => resolve(conn));
                    conn.on('error', reject);
                    conn.on('timeout', () => {
                        conn.destroy();
                        reject(new Error('Connection timed out'));
                    });
                });
            }

            return new Promise((resolve, reject) => {
                const tlsOptions = {
                    socket: socket,
                    servername: targetHost,
                    minVersion: 'TLSv1.2',
                    maxVersion: 'TLSv1.3',
                    ciphers: 'HIGH:!aNULL:!MD5:!RC4',
                    rejectUnauthorized: false
                };

                const tlsSocket = tls.connect(tlsOptions);

                const tlsTimeout = setTimeout(() => {
                    tlsSocket.destroy();
                    reject(new Error('TLS handshake timed out'));
                }, 5000);

                tlsSocket.on('error', (err) => {
                    clearTimeout(tlsTimeout);
                    tlsSocket.destroy();
                    reject(err);
                });

                tlsSocket.on('secureConnect', () => {
                    clearTimeout(tlsTimeout);
                    resolve(tlsSocket);
                });
            });
        } catch (error) {
            throw error;
        }
    }
}

async function resolveHostname(hostname) {
    try {
        const selectedResolver = DNS_RESOLVERS[Math.floor(Math.random() * DNS_RESOLVERS.length)];
        const addresses = await dns.resolve4(hostname);

        if (addresses && addresses.length > 0) {
            return addresses[0];
        }
        throw new Error(`Could not resolve hostname: ${hostname}`);
    } catch (error) {
        try {
            const addresses = await dns.resolve4(hostname);
            if (addresses && addresses.length > 0) {
                return addresses[0];
            }
        } catch (fallbackError) {
            
        }
        throw error;
    }
}

async function connectProxy(options) {
    const {
        proxyHost,
        proxyPort,
        targetHost,
        targetPort,
        username,
        password,
        fakeSni = "www.google.com",
        timeout = 10000,
        scheme = "https"
    } = options;

    const auth = username && password ?
        () => basicAuthHeader(username, password) : null;

    const proxyUrl = `${scheme}://${proxyHost}:${proxyPort}`;

    try {
        const proxyDialer = ProxyDialer.fromURL(proxyUrl, {
            auth,
            sni: fakeSni
        });

        if (fakeSni) {
            const fakeSniDialer = new FakeSNIDialer({
                sni: fakeSni
            });

            return await fakeSniDialer.dialTLS(targetHost, targetPort, {
                proxyDialer,
                timeout
            });
        } else {
            return await proxyDialer.dial(targetHost, targetPort, { timeout });
        }
    } catch (error) {
        throw error;
    }
}

async function makeHttpRequest(options) {
    return new Promise(async (resolve, reject) => {
        try {
            const {
                method = 'GET',
                path = '/',
                headers = {},
                body = null,
                scheme = 'https'
            } = options;

            const socket = await connectProxy({
                ...options,
                scheme
            });

            const request =
                `${method} ${path} HTTP/1.1\r\n` +
                `Host: ${options.targetHost}\r\n` +
                Object.entries(headers).map(([key, value]) => `${key}: ${value}\r\n`).join('') +
                'Connection: close\r\n' +
                '\r\n' +
                (body ? body : '');

            socket.write(request);

            const responseTimeout = setTimeout(() => {
                socket.destroy();
                reject(new Error('Timeout waiting for HTTP response'));
            }, 10000);

            let responseBuffer = Buffer.alloc(0);
            socket.on('data', (chunk) => {
                responseBuffer = Buffer.concat([responseBuffer, chunk]);
            });

            socket.on('end', () => {
                clearTimeout(responseTimeout);
                try {
                    const response = responseBuffer.toString();
                    const headersEndIndex = response.indexOf('\r\n\r\n');
                    if (headersEndIndex === -1) {
                        throw new Error('Invalid HTTP response format');
                    }

                    const headers = response.substring(0, headersEndIndex);
                    const body = response.substring(headersEndIndex + 4);

                    const statusLine = headers.split('\r\n')[0];
                    const statusCode = parseInt(statusLine.split(' ')[1]);

                    resolve({
                        statusCode,
                        headers,
                        body
                    });
                } catch (err) {
                    reject(new Error(`Failed to parse response: ${err.message}`));
                }
            });

            socket.on('error', (err) => {
                clearTimeout(responseTimeout);
                reject(err);
            });

        } catch (error) {
            reject(error);
        }
    });
}

function makeAuthHash(secret) {
    const time = Math.floor(Date.now() / 1000);
    const secretStr = String(secret || '');
    const hash = crypto.createHash('md5').update(secretStr + time).digest('hex');
    return { hash, time };
}

function basicAuthHeader(username, password) {
    return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);

                    if (res.statusCode >= 200 && res.statusCode <= 299) {
                        resolve({ statusCode: res.statusCode, headers: res.headers, data: jsonData });
                    } else {
                        reject(new Error(`HTTP Error: ${res.statusCode} - ${data.substring(0, 1024)}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse JSON: ${e.message}, Raw data: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        if (postData) {
            req.write(postData);
        }

        req.end();
    });
}

async function session(username, password, tfacode = '') {
    const clientAuthSecret = state.settings.clientAuthSecret || DEFAULT_CLIENT_AUTH_SECRET;
    const { hash: clientAuthHash, time: authTime } = makeAuthHash(clientAuthSecret);

    const postData = new URLSearchParams({
        client_auth_hash: clientAuthHash,
        time: authTime,
        session_type_id: SESSION_TYPE_EXT,
        username: username,
        password: password
    });

    if (tfacode) {
        postData.append('2fa_code', tfacode);
    }

    const options = {
        method: 'POST',
        headers: {
            'User-Agent': state.settings.userAgent,
            'Origin': state.settings.origin,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
        }
    };

    const url = new URL(state.settings.endpoints.Session);
    url.searchParams.append('platform', state.settings.platform);

    const response = await makeRequest({
        ...options,
        hostname: url.hostname,
        path: url.pathname + url.search,
        port: 443
    }, postData.toString());

    if (!response.data || !response.data.data) {
        throw new Error('No data in response');
    }

    state.userId = response.data.data.user_id;
    state.sessionAuthHash = response.data.data.session_auth_hash;
    state.status = response.data.data.status;
    state.isPremium = response.data.data.is_premium !== 0;
    state.locRev = response.data.data.loc_rev;
    state.locHash = response.data.data.loc_hash;
    state.lastHeartbeat = Date.now();

    const trafficUsed = response.data.data.traffic_used;
    const trafficMax = response.data.data.traffic_max;

    state.trafficUsage = trafficMax > 0 ? (trafficUsed / trafficMax) * 100 : 0;

    function formatBytes(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
    }

    state.trafficUsedFormatted = formatBytes(trafficUsed);
    state.trafficMaxFormatted = formatBytes(trafficMax);

    return response.data;
}

async function serverCredentials() {
    const clientAuthSecret = state.settings.clientAuthSecret || DEFAULT_CLIENT_AUTH_SECRET;
    const { hash: clientAuthHash, time: authTime } = makeAuthHash(clientAuthSecret);

    const url = new URL(state.settings.endpoints.ServerCredentials);
    url.searchParams.append('client_auth_hash', clientAuthHash);
    url.searchParams.append('session_auth_hash', state.sessionAuthHash);
    url.searchParams.append('time', authTime);
    url.searchParams.append('platform', state.settings.platform);

    const options = {
        method: 'GET',
        headers: {
            'User-Agent': state.settings.userAgent,
            'Origin': state.settings.origin,
            'Accept': 'application/json'
        }
    };

    const response = await makeRequest({
        ...options,
        hostname: url.hostname,
        path: url.pathname + url.search,
        port: 443
    });

    if (!response.data || !response.data.data) {
        throw new Error('No data in server credentials response');
    }

    state.proxyUsername = Buffer.from(response.data.data.username, 'base64').toString('utf-8');
    state.proxyPassword = Buffer.from(response.data.data.password, 'base64').toString('utf-8');

    return response.data;
}

async function serverList() {
    const url = new URL(state.settings.endpoints.serverlist);

    const isPremium = state.isPremium ? '1' : '0';
    url.pathname = `${url.pathname}/${state.settings.type}/${isPremium}/${state.locHash}`;
    url.searchParams.append('platform', state.settings.platform);

    const options = {
        method: 'GET',
        headers: {
            'User-Agent': state.settings.userAgent,
            'Origin': state.settings.origin,
            'Accept': 'application/json'
        }
    };

    const response = await makeRequest({
        ...options,
        hostname: url.hostname,
        path: url.pathname + url.search,
        port: 443
    });

    if (!response.data || !response.data.data) {
        throw new Error('No data in server list response');
    }

    return response.data.data;
}

async function testProxy(hostname, port = 443, timeout = 10000) {
    const start = Date.now();
    try {
        const scheme = port === 80 ? 'http' : 'https';

        const response = await makeHttpRequest({
            proxyHost: hostname,
            proxyPort: port,
            targetHost: 'ipinfo.io',
            targetPort: 443,
            fakeSni: "com",
            username: state.proxyUsername,
            password: state.proxyPassword,
            timeout: timeout,
            path: '/json',
            headers: {
                'User-Agent': state.settings.userAgent
            }
        });

        const latency = Date.now() - start;

        try {
            const result = JSON.parse(response.body);

            if (response.statusCode === 200 && result && result.ip) {
                return {
                    success: true,
                    hostname: hostname,
                    ip: result.ip,
                    protocol: `${scheme.toUpperCase()} with custom SNI`,
                    latency: latency,
                    statusCode: response.statusCode
                };
            } else {
                return {
                    success: false,
                    hostname: hostname,
                    error: `Invalid response: ${response.body}`,
                    protocol: `${scheme.toUpperCase()} with custom SNI`,
                    latency: latency,
                    location: ''
                };
            }
        } catch (parseError) {
            return {
                success: false,
                hostname: hostname,
                error: `Failed to parse response: ${parseError.message}`,
                protocol: `${scheme.toUpperCase()} with custom SNI`,
                latency: latency,
                location: ''
            };
        }
    } catch (error) {
        const latency = Date.now() - start;
        return {
            success: false,
            hostname: hostname,
            error: `Proxy error: ${error.message}`,
            latency: latency,
            location: ''
        };
    }
}

async function testCustomProxy(options) {
    const {
        hostname,
        port = 443,
        targetUrl = 'https://ipinfo.io/json',
        customSni = null,
        timeout = 10000,
        username = null,
        password = null,
        method = 'GET',
        headers = {}
    } = options;

    const start = Date.now();

    try {
        const targetUrlObj = new URL(targetUrl);
        const targetHost = targetUrlObj.hostname;
        const targetPort = targetUrlObj.port || (targetUrlObj.protocol === 'https:' ? 443 : 80);
        const path = targetUrlObj.pathname + targetUrlObj.search;

        const scheme = port === 80 ? 'http' : 'https';

        const requestOptions = {
            proxyHost: hostname,
            proxyPort: port,
            targetHost: targetHost,
            targetPort: parseInt(targetPort),
            username: username || state.proxyUsername,
            password: password || state.proxyPassword,
            timeout: timeout,
            method: method,
            path: path,
            headers: {
                'User-Agent': state.settings.userAgent,
                ...headers
            }
        };

        if (customSni) {
            requestOptions.fakeSni = customSni;
        }

        const response = await makeHttpRequest(requestOptions);
        const latency = Date.now() - start;

        let parsedResponse = null;
        let isJson = false;

        try {
            parsedResponse = JSON.parse(response.body);
            isJson = true;
        } catch (e) {
            parsedResponse = response.body;
        }

        if (response.statusCode >= 200 && response.statusCode < 300) {
            return {
                success: true,
                hostname: hostname,
                targetUrl: targetUrl,
                statusCode: response.statusCode,
                latency: latency,
                protocol: `${scheme.toUpperCase()}${customSni ? ' with SNI: ' + customSni : ''}`,
                response: parsedResponse,
                isJson: isJson,
                responseSize: response.body.length
            };
        } else {
            return {
                success: false,
                hostname: hostname,
                targetUrl: targetUrl,
                statusCode: response.statusCode,
                latency: latency,
                protocol: `${scheme.toUpperCase()}${customSni ? ' with SNI: ' + customSni : ''}`,
                error: `HTTP ${response.statusCode}`,
                response: parsedResponse,
                isJson: isJson
            };
        }
    } catch (error) {
        const latency = Date.now() - start;
        return {
            success: false,
            hostname: hostname,
            targetUrl: options.targetUrl,
            error: error.message,
            latency: latency,
            protocol: `${port === 80 ? 'HTTP' : 'HTTPS'}${options.customSni ? ' with SNI: ' + options.customSni : ''}`
        };
    }
}

async function bulkTestProxies(proxies, options = {}) {
    const {
        concurrency = 5,
        timeout = 10000,
        targetUrl = 'https://ipinfo.io/json',
        customSni = null
    } = options;

    const results = [];
    const semaphore = new Array(concurrency).fill(null);

    const testSingleProxy = async (proxy) => {
        const testOptions = {
            hostname: typeof proxy === 'string' ? proxy : proxy.hostname,
            port: typeof proxy === 'string' ? 443 : (proxy.port || 443),
            targetUrl,
            customSni,
            timeout,
            username: typeof proxy === 'object' ? proxy.username : null,
            password: typeof proxy === 'object' ? proxy.password : null
        };

        return await testCustomProxy(testOptions);
    };

    const processBatch = async (batch) => {
        const promises = batch.map(proxy => testSingleProxy(proxy));
        return await Promise.allSettled(promises);
    };

    for (let i = 0; i < proxies.length; i += concurrency) {
        const batch = proxies.slice(i, i + concurrency);
        const batchResults = await processBatch(batch);

        batchResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                const proxy = batch[index];
                results.push({
                    success: false,
                    hostname: typeof proxy === 'string' ? proxy : proxy.hostname,
                    error: result.reason.message,
                    latency: 0
                });
            }
        });
    }

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    return {
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        results: results,
        successRate: ((successful.length / results.length) * 100).toFixed(2) + '%',
        averageLatency: successful.length > 0 ?
            Math.round(successful.reduce((sum, r) => sum + r.latency, 0) / successful.length) : 0
    };
}

function saveState(filename) {
    try {
        fs.writeFileSync(filename, JSON.stringify(state, null, 4));
        return true;
    } catch (error) {
        return false;
    }
}

function loadState(filename) {
    try {
        if (!fs.existsSync(filename)) {
            return false;
        }

        const data = fs.readFileSync(filename, 'utf8');

        if (!data || data.trim() === '') {
            return false;
        }

        try {
            const loadedState = JSON.parse(data);

            state = {
                ...state,
                ...loadedState,
                settings: {
                    ...settings,
                    ...(loadedState.settings || {})
                }
            };

            return true;
        } catch (parseError) {
            return false;
        }
    } catch (error) {
        return false;
    }
}

module.exports = {
    WindscribeSDK,
    ProxyDialer,
    FakeSNIDialer,
    session,
    serverCredentials,
    serverList,
    testProxy,
    testCustomProxy,
    bulkTestProxies,
    connectProxy,
    makeHttpRequest,
    basicAuthHeader,
    resolveHostname,
    saveState,
    loadState,
    getState: () => state,
    setState: (newState) => { state = { ...state, ...newState }; },
    DEFAULT_CLIENT_AUTH_SECRET,
    ASSUMED_PROXY_PORT,
    SESSION_TYPE_EXT
};
