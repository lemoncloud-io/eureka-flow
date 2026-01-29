/* eslint-disable -- Web Worker environment: no module imports, uses self.postMessage */
/**
 * WebSocket Web Worker for Flow Execution Updates
 *
 * Handles WebSocket connection in a separate thread to:
 * - Prevent browser throttling in background tabs
 * - Maintain persistent connection for real-time updates
 * - Handle automatic reconnection with exponential backoff
 */
let ws = null;
let connectionId = null;
let reconnectTimeout = null;
let isManualDisconnect = false;
let currentConfig = null;
let reconnectAttempts = 0;
let pingInterval = null;
let lastPongTime = null;

const PING_INTERVAL = 60000; // 60s - keep connection alive
const PONG_TIMEOUT = 10000; // 10s - timeout for pong response
const MAX_RECONNECT_ATTEMPTS = 10;

const startPingHeartbeat = () => {
    if (pingInterval) clearInterval(pingInterval);

    pingInterval = setInterval(() => {
        if (ws?.readyState === 1) {
            ws.send(JSON.stringify({ type: 'system', action: 'ping', data: { timestamp: Date.now() } }));
            self.postMessage({ type: 'log', message: 'Sent ping heartbeat' });
        }
    }, PING_INTERVAL);
};

const stopPingHeartbeat = () => {
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
};

const attemptReconnect = () => {
    if (isManualDisconnect || !currentConfig) return;

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        self.postMessage({
            type: 'log',
            message: `Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Stopping.`,
        });
        self.postMessage({ type: 'status', status: 'error' });
        self.postMessage({ type: 'reconnectAttempts', count: reconnectAttempts, maxReached: true });
        return;
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    reconnectAttempts++;

    self.postMessage({ type: 'reconnectAttempts', count: reconnectAttempts, maxReached: false });
    self.postMessage({
        type: 'log',
        message: `Attempting reconnect in ${delay / 1000}s... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
    });

    self.postMessage({ type: 'status', status: 'reconnecting' });

    reconnectTimeout = setTimeout(() => {
        self.postMessage({ type: 'log', message: 'Reconnecting...' });
        connectWebSocket(currentConfig);
    }, delay);
};

const connectWebSocket = config => {
    const { endpoint, token, authQueryParam, sessionId, channels } = config;

    if (ws?.readyState === 1 || ws?.readyState === 0) {
        self.postMessage({ type: 'log', message: 'Already connected or connecting' });
        return;
    }

    if (ws) {
        ws.close();
        ws = null;
    }

    // Build WebSocket URL with query parameters
    // channels parameter specifies which flow channel to subscribe to
    let wsUrl = endpoint + '?' + authQueryParam + '=' + token;
    if (!channels) {
        wsUrl += '&default=';
    }
    wsUrl += '&info=';
    if (sessionId) {
        wsUrl += '&deviceId=' + sessionId;
    }
    if (channels) {
        wsUrl += '&channels=' + channels;
    }

    self.postMessage({ type: 'status', status: 'connecting' });
    self.postMessage({ type: 'log', message: 'Connecting to: ' + wsUrl });

    try {
        ws = new WebSocket(wsUrl);
    } catch (error) {
        self.postMessage({ type: 'error', error: 'Failed to create WebSocket: ' + error.message });
        self.postMessage({ type: 'status', status: 'error' });
        attemptReconnect();
        return;
    }

    ws.onopen = () => {
        reconnectAttempts = 0;
        lastPongTime = Date.now();
        self.postMessage({ type: 'status', status: 'connected' });
        self.postMessage({ type: 'reconnectAttempts', count: 0, maxReached: false });
        self.postMessage({ type: 'log', message: 'Connected' });

        // Request connection info after brief delay
        setTimeout(() => {
            if (ws?.readyState === 1) {
                ws.send(JSON.stringify({ type: 'system', action: 'info', data: {} }));
            }
        }, 100);

        startPingHeartbeat();
    };

    ws.onmessage = event => {
        try {
            const data = JSON.parse(event.data);

            // Handle connection info response
            if (data.action === 'info' && data.data?.id) {
                connectionId = data.data.connectionId || null;
                self.postMessage({
                    type: 'connectionId',
                    id: data.data.id,
                    connectionId,
                });
                return;
            }

            // Handle ping from server - format: {"type":"system","action":"ping",...}
            if ((data.type === 'system' && data.action === 'ping') || data.action === 'ping') {
                const timestamp = data.data?.timestamp || Date.now();
                ws?.send(JSON.stringify({ type: 'system', action: 'pong', data: { timestamp } }));
                self.postMessage({ type: 'log', message: 'Received ping, sent pong' });
                return;
            }

            // Handle pong response (for our ping heartbeat)
            if (data.action === 'pong') {
                lastPongTime = Date.now();
                self.postMessage({ type: 'log', message: 'Received pong' });
                return;
            }

            // Forward all other messages to main thread
            self.postMessage({ type: 'message', data });
        } catch (error) {
            self.postMessage({ type: 'error', error: 'Failed to parse message: ' + error.message });
        }
    };

    ws.onclose = event => {
        self.postMessage({
            type: 'log',
            message: 'Disconnected: code=' + event.code + ', reason=' + (event.reason || 'none'),
        });
        stopPingHeartbeat();
        self.postMessage({ type: 'status', status: 'disconnected' });

        if (!isManualDisconnect) {
            attemptReconnect();
        }
    };

    ws.onerror = error => {
        self.postMessage({ type: 'error', error: 'WebSocket error occurred' });
        self.postMessage({ type: 'status', status: 'error' });
    };
};

self.onmessage = e => {
    const { type, config, data } = e.data;

    switch (type) {
        case 'connect':
            self.postMessage({ type: 'log', message: 'Connect config: ' + JSON.stringify(config) });
            isManualDisconnect = false;
            reconnectAttempts = 0;
            currentConfig = config;
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
            connectWebSocket(config);
            break;

        case 'disconnect':
            isManualDisconnect = true;
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
            stopPingHeartbeat();
            if (ws) {
                ws.close();
                ws = null;
            }
            connectionId = null;
            currentConfig = null;
            reconnectAttempts = 0;
            self.postMessage({ type: 'status', status: 'disconnected' });
            self.postMessage({ type: 'reconnectAttempts', count: 0, maxReached: false });
            break;

        case 'reconnect':
            // Manual reconnect request
            self.postMessage({ type: 'log', message: 'Manual reconnect requested' });
            isManualDisconnect = false;
            reconnectAttempts = 0;
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
            if (ws) {
                ws.close();
                ws = null;
            }
            if (currentConfig) {
                connectWebSocket(currentConfig);
            } else {
                self.postMessage({ type: 'error', error: 'No config available for reconnect' });
            }
            break;

        case 'send':
            if (ws?.readyState === 1) {
                const jsonData = JSON.stringify(data);
                ws.send(jsonData);
                self.postMessage({ type: 'log', message: 'Sent: ' + jsonData });
            } else {
                self.postMessage({
                    type: 'log',
                    message: 'Cannot send - not connected (readyState: ' + ws?.readyState + ')',
                });
            }
            break;

        case 'status':
            // Return current status
            self.postMessage({
                type: 'statusResponse',
                connected: ws?.readyState === 1,
                readyState: ws?.readyState,
                reconnectAttempts,
                connectionId,
            });
            break;
    }
};
