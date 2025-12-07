// Background service worker
const ports = new Set();
const requestMap = new Map();

// Handle connections from DevTools panels
browser.runtime.onConnect.addListener((port) => {
    if (port.name !== "rep-panel") return;
    console.log("DevTools panel connected");
    ports.add(port);

    port.onDisconnect.addListener(() => {
        console.log("DevTools panel disconnected");
        ports.delete(port);
    });

    // Listen for messages from panel
    port.onMessage.addListener(async (msg) => {
        if (msg.type === 'check-permissions') {
            try {
                const result = await browser.permissions.contains({
                    permissions: ['webRequest'],
                    origins: ['<all_urls>']
                });
                port.postMessage({ type: 'permissions-result', for: 'check', result });
            } catch (e) {
                console.error("Error checking permissions:", e);
                port.postMessage({ type: 'permissions-result', for: 'check', result: false, error: e.message });
            }
        } else if (msg.type === 'request-permissions') {
            try {
                const result = await browser.permissions.request({
                    permissions: ['webRequest'],
                    origins: ['<all_urls>']
                });
                port.postMessage({ type: 'permissions-result', for: 'request', result });
            } catch (e) {
                console.error("Error requesting permissions:", e);
                port.postMessage({ type: 'permissions-result', for: 'request', result: false, error: e.message });
            }
        } else if (msg.type === 'remove-permissions') {
            try {
                const result = await browser.permissions.remove({
                    permissions: ['webRequest'],
                    origins: ['<all_urls>']
                });
                port.postMessage({ type: 'permissions-result', for: 'remove', result });
            } catch (e) {
                console.error("Error removing permissions:", e);
                port.postMessage({ type: 'permissions-result', for: 'remove', result: false, error: e.message });
            }
        }
    });
});

// Helper to process request body
function parseRequestBody(requestBody) {
    if (!requestBody) return null;

    if (requestBody.raw && requestBody.raw.length > 0) {
        try {
            const decoder = new TextDecoder('utf-8');
            return requestBody.raw.map(bytes => {
                if (bytes.bytes) {
                    return decoder.decode(bytes.bytes);
                }
                return '';
            }).join('');
        } catch (e) {
            console.error('Error decoding request body:', e);
            return null;
        }
    }

    if (requestBody.formData) {
        const params = new URLSearchParams();
        for (const [key, values] of Object.entries(requestBody.formData)) {
            values.forEach(value => params.append(key, value));
        }
        return params.toString();
    }

    return null;
}

// Listener functions
function handleBeforeRequest(details) {
    if (ports.size === 0) return;
    if (details.url.startsWith('moz-extension://')) return;

    requestMap.set(details.requestId, {
        requestId: details.requestId,
        url: details.url,
        method: details.method,
        type: details.type,
        timeStamp: Date.now(),
        requestBody: parseRequestBody(details.requestBody),
        tabId: details.tabId,
        initiator: details.initiator
    });
}

function handleBeforeSendHeaders(details) {
    if (ports.size === 0) return;
    const req = requestMap.get(details.requestId);
    if (req) {
        req.requestHeaders = details.requestHeaders;
    }
}

function handleCompleted(details) {
    if (ports.size === 0) return;
    const req = requestMap.get(details.requestId);
    if (req) {
        req.statusCode = details.statusCode;
        req.statusLine = details.statusLine;
        req.responseHeaders = details.responseHeaders;

        const message = {
            type: 'captured_request',
            data: req
        };

        ports.forEach(p => {
            try {
                p.postMessage(message);
            } catch (e) {
                console.error('Error sending to port:', e);
                ports.delete(p);
            }
        });

        requestMap.delete(details.requestId);
    }
}

function handleErrorOccurred(details) {
    requestMap.delete(details.requestId);
}

let listenersRegistered = false;
function setupListeners() {
    if (listenersRegistered || !browser.webRequest) return;
    browser.webRequest.onBeforeRequest.addListener(
        handleBeforeRequest,
        { urls: ["<all_urls>"] },
        ["requestBody"]
    );
    browser.webRequest.onBeforeSendHeaders.addListener(
        handleBeforeSendHeaders,
        { urls: ["<all_urls>"] },
        ["requestHeaders"]
    );
    browser.webRequest.onCompleted.addListener(
        handleCompleted,
        { urls: ["<all_urls>"] },
        ["responseHeaders"]
    );
    browser.webRequest.onErrorOccurred.addListener(
        handleErrorOccurred,
        { urls: ["<all_urls>"] }
    );
    listenersRegistered = true;
    console.log("WebRequest listeners registered");
}

function removeListeners() {
    if (!listenersRegistered || !browser.webRequest) return;
    browser.webRequest.onBeforeRequest.removeListener(handleBeforeRequest);
    browser.webRequest.onBeforeSendHeaders.removeListener(handleBeforeSendHeaders);
    browser.webRequest.onCompleted.removeListener(handleCompleted);
    browser.webRequest.onErrorOccurred.removeListener(handleErrorOccurred);
    listenersRegistered = false;
    console.log("WebRequest listeners removed");
}


// Listen for permission changes and setup/remove listeners accordingly
if (browser.permissions) {
    browser.permissions.onAdded.addListener((permissions) => {
        if (permissions.permissions && permissions.permissions.includes('webRequest')) {
            console.log("webRequest permission added.");
            setupListeners();
        }
    });

    browser.permissions.onRemoved.addListener((permissions) => {
        if (permissions.permissions && permissions.permissions.includes('webRequest')) {
            console.log("webRequest permission removed.");
            removeListeners();
        }
    });
}


// Initial setup: check permissions and setup listeners if already granted
(async () => {
    if (browser.permissions && await browser.permissions.contains({ permissions: ['webRequest'] })) {
        setupListeners();
    }
})();


// Periodic cleanup of stale requests
setInterval(() => {
    const now = Date.now();
    for (const [id, req] of requestMap.entries()) {
        if (now - req.timeStamp > 60000) {
            requestMap.delete(id);
        }
    }
}, 30000);