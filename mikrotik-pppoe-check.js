// RouterOS API client to check PPPoE users
const net = require('net');
const crypto = require('crypto');

class RouterOSClient {
    constructor(host, port, username, password) {
        this.host = host;
        this.port = port;
        this.username = username;
        this.password = password;
        this.socket = null;
        this.connected = false;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.socket = net.createConnection({
                host: this.host,
                port: this.port
            });

            this.socket.on('connect', () => {
                console.log('🔗 Connected to RouterOS at ' + this.host + ':' + this.port);
                this.connected = true;
                this.login();
                resolve();
            });

            this.socket.on('error', (error) => {
                console.error('❌ RouterOS connection error:', error.message);
                reject(error);
            });

            this.socket.on('data', (data) => {
                this.handleResponse(data);
            });
        });
    }

    login() {
        const loginCommand = '/login';
        this.sendCommand(loginCommand);
        
        // Generate password hash for login
        const challenge = crypto.randomBytes(16).toString('hex');
        const passwordHash = crypto.createHash('md5')
            .update(challenge + this.password)
            .digest('hex');
        
        // Send login with password
        this.sendCommand('=name=' + this.username);
        this.sendCommand('=response=00' + passwordHash);
        this.writeSentence();
    }

    sendCommand(command) {
        if (this.connected && this.socket) {
            console.log('📤 Sending command:', command);
            this.socket.write(command + '\0');
        }
    }

    writeSentence() {
        if (this.connected && this.socket) {
            this.socket.write('\0');
        }
    }

    handleResponse(data) {
        const response = data.toString().replace(/\0/g, '\n');
        console.log('📥 RouterOS response:', response);
    }

    async getPPPoESecrets() {
        console.log('🔍 Retrieving PPPoE secrets from RouterOS...');
        
        // Send command to get PPP secrets
        this.sendCommand('/ppp/secret/print');
        this.writeSentence();
        
        // Wait a bit for response
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    close() {
        if (this.socket) {
            this.socket.end();
            this.connected = false;
            console.log('🔌 Disconnected from RouterOS');
        }
    }
}

async function checkPPPoEUsersInRouterOS() {
    console.log('🚀 Starting RouterOS PPPoE Users Verification...');
    
    const client = new RouterOSClient(
        '54.37.252.142',
        8728,
        'userku',
        'M4k4s4rB4ng'
    );

    try {
        await client.connect();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for login
        
        await client.getPPPoESecrets();
        
    } catch (error) {
        console.error('❌ RouterOS verification failed:', error.message);
    } finally {
        client.close();
    }
}

// Run the verification
checkPPPoEUsersInRouterOS();
