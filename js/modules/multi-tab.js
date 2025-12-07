// Multi-tab Capture Module
import { addRequest } from './state.js';
import { renderRequestItem } from './ui.js';

export function initMultiTabCapture(panelPort) {
    const multiTabBtn = document.getElementById('multi-tab-btn');
    let isMultiTabEnabled = false;

    function updateMultiTabIcon(enabled) {
        if (!multiTabBtn) return;
        isMultiTabEnabled = enabled;
        if (enabled) {
            multiTabBtn.classList.add('active');
            multiTabBtn.title = "Multi-tab Capture Enabled (Click to disable)";
            multiTabBtn.style.color = 'var(--accent-color)';
        } else {
            multiTabBtn.classList.remove('active');
            multiTabBtn.title = "Enable Multi-tab Capture";
            multiTabBtn.style.color = '';
        }
    }

    // Initial status check
    panelPort.postMessage({ type: 'check-permissions' });

    // Listen for permission results from background
    panelPort.onMessage.addListener((msg) => {
        if (msg.type === 'permissions-result') {
            if (msg.for === 'check') {
                updateMultiTabIcon(msg.result);
            } else if (msg.for === 'request') {
                updateMultiTabIcon(msg.result);
            } else if (msg.for === 'remove') {
                updateMultiTabIcon(!msg.result);
            }
        } else if (msg.type === 'captured_request') {
            if (!isMultiTabEnabled) return;

            const req = msg.data;

            // Skip requests from the current inspected tab
            if (req.tabId === browser.devtools.inspectedWindow.tabId) return;

            // Convert to HAR-like format
            const harEntry = {
                request: {
                    method: req.method,
                    url: req.url,
                    headers: req.requestHeaders || [],
                    postData: req.requestBody ? { text: req.requestBody } : undefined
                },
                response: {
                    status: req.statusCode,
                    statusText: req.statusLine || '',
                    headers: req.responseHeaders || [],
                    content: {
                        mimeType: (req.responseHeaders || []).find(h => h.name.toLowerCase() === 'content-type')?.value || '',
                        text: '' // Not available for background requests
                    }
                },
                capturedAt: req.timeStamp,
                fromOtherTab: true,
                pageUrl: req.initiator || req.url
            };

            // Filter static resources
            const url = req.url.toLowerCase();
            const staticExtensions = [
                '.css', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
                '.woff', '.woff2', '.ttf', '.eot', '.otf',
                '.mp4', '.webm', '.mp3', '.wav', '.pdf'
            ];
            if (staticExtensions.some(ext => url.endsWith(ext) || url.includes(ext + '?'))) return;

            const index = addRequest(harEntry);
            renderRequestItem(harEntry, index);
        }
    });

    // Toggle button handler
    if (multiTabBtn) {
        multiTabBtn.addEventListener('click', () => {
            if (isMultiTabEnabled) {
                panelPort.postMessage({ type: 'remove-permissions' });
            } else {
                panelPort.postMessage({ type: 'request-permissions' });
            }
        });
    }
}
