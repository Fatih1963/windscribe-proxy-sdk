const crypto = require('crypto');
const https = require('https');
const http = require('http');
const tls = require('tls');
const net = require('net');
const fs = require('fs');
const { URL } = require('url');
const dns = require('dns').promises;

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
    BestLocation: 'https://api.windscribe.com/BestLocation'
};

const settings = {
    clientAuthSecret: DEFAULT_CLIENT_AUTH_SECRET,
    platform: 'chrome',
    type: 'chrome',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    origin: 'chrome-extension://hnmpcagpplmpfojmgmnngilcnanddlhb',
    sessionType: SESSION_TYPE_EXT,
    endpoints: endpoints
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
    trafficMaxFormatted: '10.00 GB'
};

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
            // Fallback failed too
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