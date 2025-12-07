// AI Integration Module (Anthropic & Gemini)

export function getAISettings() {
    const provider = localStorage.getItem('ai_provider') || 'anthropic';

    if (provider === 'gemini') {
        return {
            provider: 'gemini',
            apiKey: localStorage.getItem('gemini_api_key') || '',
            model: localStorage.getItem('gemini_model') || 'gemini-flash-latest'
        };
    }

    return {
        provider: 'anthropic',
        apiKey: localStorage.getItem('anthropic_api_key') || '',
        model: localStorage.getItem('anthropic_model') || 'claude-3-5-sonnet-20241022'
    };
}

export function saveAISettings(provider, apiKey, model) {
    localStorage.setItem('ai_provider', provider);

    if (provider === 'gemini') {
        localStorage.setItem('gemini_api_key', apiKey);
        localStorage.setItem('gemini_model', model);
    } else {
        localStorage.setItem('anthropic_api_key', apiKey);
        localStorage.setItem('anthropic_model', model);
    }
}

export async function streamExplanation(apiKey, model, request, onUpdate, provider = 'anthropic') {
    if (provider === 'gemini') {
        return streamExplanationFromGemini(apiKey, model, request, onUpdate);
    }
    return streamExplanationFromClaude(apiKey, model, request, onUpdate);
}

export async function streamExplanationWithSystem(apiKey, model, systemPrompt, userPrompt, onUpdate, provider = 'anthropic') {
    if (provider === 'gemini') {
        return streamExplanationFromGeminiWithSystem(apiKey, model, systemPrompt, userPrompt, onUpdate);
    }
    return streamExplanationFromClaudeWithSystem(apiKey, model, systemPrompt, userPrompt, onUpdate);
}

export async function streamExplanationFromClaude(apiKey, model, request, onUpdate) {
    const systemPrompt = "You are an expert security researcher and web developer. Explain the following HTTP request in detail, highlighting interesting parameters, potential security implications, and what this request is likely doing. Be concise but thorough.";

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: model,
            max_tokens: 1024,
            system: systemPrompt,
            stream: true,
            messages: [
                { role: 'user', content: `Explain this HTTP request:\n\n${request}` }
            ]
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to communicate with Anthropic API');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (dataStr === '[DONE]') continue;

                try {
                    const data = JSON.parse(dataStr);
                    if (data.type === 'content_block_delta' && data.delta.text) {
                        fullText += data.delta.text;
                        onUpdate(fullText);
                    }
                } catch (e) {
                    // Ignore parse errors for incomplete chunks
                }
            }
        }
    }

    return fullText;
}

export async function streamExplanationFromClaudeWithSystem(apiKey, model, systemPrompt, userPrompt, onUpdate) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: model,
            max_tokens: 2048,
            system: systemPrompt,
            stream: true,
            messages: [
                { role: 'user', content: userPrompt }
            ]
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to communicate with Anthropic API');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (dataStr === '[DONE]') continue;

                try {
                    const data = JSON.parse(dataStr);
                    if (data.type === 'content_block_delta' && data.delta.text) {
                        fullText += data.delta.text;
                        onUpdate(fullText);
                    }
                } catch (e) {
                    // Ignore parse errors for incomplete chunks
                }
            }
        }
    }

    return fullText;
}

export async function streamExplanationFromGemini(apiKey, model, request, onUpdate) {
    const systemPrompt = "You are an expert security researcher and web developer. Explain the following HTTP request in detail, highlighting interesting parameters, potential security implications, and what this request is likely doing. Be concise but thorough.";

    const prompt = `${systemPrompt}\n\nExplain this HTTP request:\n\n${request}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048
            }
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to communicate with Gemini API');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (!dataStr) continue;

                try {
                    const data = JSON.parse(dataStr);
                    if (data.candidates && data.candidates[0]?.content?.parts) {
                        for (const part of data.candidates[0].content.parts) {
                            if (part.text) {
                                fullText += part.text;
                                onUpdate(fullText);
                            }
                        }
                    }
                } catch (e) {
                    // Ignore parse errors for incomplete chunks
                }
            }
        }
    }

    return fullText;
}

export async function streamExplanationFromGeminiWithSystem(apiKey, model, systemPrompt, userPrompt, onUpdate) {
    const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: combinedPrompt }]
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4096
            }
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to communicate with Gemini API');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (!dataStr) continue;

                try {
                    const data = JSON.parse(dataStr);
                    if (data.candidates && data.candidates[0]?.content?.parts) {
                        for (const part of data.candidates[0].content.parts) {
                            if (part.text) {
                                fullText += part.text;
                                onUpdate(fullText);
                            }
                        }
                    }
                } catch (e) {
                    // Ignore parse errors for incomplete chunks
                }
            }
        }
    }

    return fullText;
}

export function setupAIFeatures(elements) {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const aiProviderSelect = document.getElementById('ai-provider');
    const anthropicApiKeyInput = document.getElementById('anthropic-api-key');
    const anthropicModelSelect = document.getElementById('anthropic-model');
    const geminiApiKeyInput = document.getElementById('gemini-api-key');
    const geminiModelSelect = document.getElementById('gemini-model');
    const anthropicSettings = document.getElementById('anthropic-settings');
    const geminiSettings = document.getElementById('gemini-settings');
    const aiMenuBtn = document.getElementById('ai-menu-btn');
    const aiMenuDropdown = document.getElementById('ai-menu-dropdown');
    const explainBtn = document.getElementById('explain-btn');
    const suggestAttackBtn = document.getElementById('suggest-attack-btn');
    const explanationModal = document.getElementById('explanation-modal');
    const explanationContent = document.getElementById('explanation-content');
    const ctxExplainAi = document.getElementById('ctx-explain-ai');

    // Handle provider switching
    if (aiProviderSelect) {
        aiProviderSelect.addEventListener('change', () => {
            const provider = aiProviderSelect.value;
            if (provider === 'gemini') {
                anthropicSettings.style.display = 'none';
                geminiSettings.style.display = 'block';
            } else {
                anthropicSettings.style.display = 'block';
                geminiSettings.style.display = 'none';
            }
        });
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            const { provider, apiKey, model } = getAISettings();

            if (aiProviderSelect) aiProviderSelect.value = provider;

            if (provider === 'gemini') {
                geminiApiKeyInput.value = apiKey;
                if (geminiModelSelect) geminiModelSelect.value = model;
                anthropicSettings.style.display = 'none';
                geminiSettings.style.display = 'block';
            } else {
                anthropicApiKeyInput.value = apiKey;
                if (anthropicModelSelect) anthropicModelSelect.value = model;
                anthropicSettings.style.display = 'block';
                geminiSettings.style.display = 'none';
            }

            settingsModal.style.display = 'block';
        });
    }

    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            const provider = aiProviderSelect ? aiProviderSelect.value : 'anthropic';
            let key, model;

            if (provider === 'gemini') {
                key = geminiApiKeyInput.value.trim();
                model = geminiModelSelect ? geminiModelSelect.value : 'gemini-flash-latest';
            } else {
                key = anthropicApiKeyInput.value.trim();
                model = anthropicModelSelect ? anthropicModelSelect.value : 'claude-3-5-sonnet-20241022';
            }

            if (key) {
                saveAISettings(provider, key, model);
            }

            alert('Settings saved!');
            settingsModal.style.display = 'none';
        });
    }

    if (aiMenuBtn && aiMenuDropdown) {
        aiMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            aiMenuDropdown.classList.toggle('show');
        });
        window.addEventListener('click', () => {
            if (aiMenuDropdown.classList.contains('show')) {
                aiMenuDropdown.classList.remove('show');
            }
        });
    }

    const handleAIRequest = async (promptPrefix, content) => {
        const { provider, apiKey, model } = getAISettings();
        if (!apiKey) {
            const providerName = provider === 'gemini' ? 'Gemini' : 'Anthropic';
            alert(`Please configure your ${providerName} API Key in Settings first.`);
            settingsModal.style.display = 'block';
            return;
        }

        // Update modal title
        const modalTitleElement = explanationModal.querySelector('.modal-header h3');
        if (modalTitleElement) {
            modalTitleElement.textContent = 'Request Explanation';
        }

        explanationModal.style.display = 'block';
        explanationContent.innerHTML = '<div class="loading-spinner">Generating...</div>';

        try {
            await streamExplanation(apiKey, model, promptPrefix + "\n\n" + content, (text) => {
                if (typeof marked !== 'undefined') {
                    explanationContent.innerHTML = marked.parse(text);
                } else {
                    explanationContent.innerHTML = `<pre style="white-space: pre-wrap; font-family: sans-serif;">${text}</pre>`;
                }
            }, provider);
        } catch (error) {
            explanationContent.innerHTML = `<div style="color: var(--error-color); padding: 20px;">Error: ${error.message}</div>`;
        }
    };

    const handleAIRequestWithSystem = async (systemPrompt, userPrompt, modalTitle = 'AI Analysis') => {
        const { provider, apiKey, model } = getAISettings();
        if (!apiKey) {
            const providerName = provider === 'gemini' ? 'Gemini' : 'Anthropic';
            alert(`Please configure your ${providerName} API Key in Settings first.`);
            settingsModal.style.display = 'block';
            return;
        }

        // Update modal title
        const modalTitleElement = explanationModal.querySelector('.modal-header h3');
        if (modalTitleElement) {
            modalTitleElement.textContent = modalTitle;
        }

        explanationModal.style.display = 'block';
        explanationContent.innerHTML = '<div class="loading-spinner">Generating...</div>';

        try {
            await streamExplanationWithSystem(apiKey, model, systemPrompt, userPrompt, (text) => {
                if (typeof marked !== 'undefined') {
                    explanationContent.innerHTML = marked.parse(text);
                } else {
                    explanationContent.innerHTML = `<pre style="white-space: pre-wrap; font-family: sans-serif;">${text}</pre>`;
                }
            }, provider);
        } catch (error) {
            explanationContent.innerHTML = `<div style="color: var(--error-color); padding: 20px;">Error: ${error.message}</div>`;
        }
    };

    if (explainBtn) {
        explainBtn.addEventListener('click', () => {
            const content = elements.rawRequestInput.innerText;
            if (!content.trim()) {
                alert('Request is empty.');
                return;
            }
            handleAIRequest("Explain this HTTP request:", content);
        });
    }

    if (suggestAttackBtn) {
        suggestAttackBtn.addEventListener('click', async () => {
            const requestContent = elements.rawRequestInput.innerText;
            if (!requestContent.trim()) {
                alert('Request is empty.');
                return;
            }

            // Get response content
            let responseContent = elements.rawResponseDisplay.innerText || '';
            let hasResponse = responseContent.trim().length > 0;

            // If no response exists, auto-send the request first
            if (!hasResponse) {
                const shouldSend = confirm('No response available. Send the request first to get a response for analysis?');
                if (!shouldSend) {
                    // User declined, analyze request only
                    hasResponse = false;
                } else {
                    // Import handleSendRequest dynamically
                    try {
                        const { handleSendRequest } = await import('./request-handler.js');

                        // Show loading indicator
                        explanationModal.style.display = 'block';
                        explanationContent.innerHTML = '<div class="loading-spinner">Sending request and waiting for response...</div>';

                        // Send the request
                        await handleSendRequest();

                        // Wait a bit for UI to update
                        await new Promise(resolve => setTimeout(resolve, 500));

                        // Get the response that was just populated
                        responseContent = elements.rawResponseDisplay.innerText || '';
                        hasResponse = responseContent.trim().length > 0;

                        if (!hasResponse) {
                            explanationContent.innerHTML = '<div style="color: var(--error-color); padding: 20px;">Failed to get response. Analyzing request only.</div>';
                            await new Promise(resolve => setTimeout(resolve, 1500));
                        }
                    } catch (error) {
                        explanationContent.innerHTML = `<div style="color: var(--error-color); padding: 20px;">Error sending request: ${error.message}</div>`;
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        hasResponse = false;
                    }
                }
            }

            // Build the analysis prompt
            let analysisPrompt = `Analyze the following HTTP request${hasResponse ? ' and response' : ''} and produce:

1. A short summary of what this endpoint likely does.
2. The top 5 realistic attack vectors based on ${hasResponse ? 'BOTH the request and the response' : 'the request (note: response not available)'}.
3. For each attack vector:
   - Why this vector might work (based on ${hasResponse ? 'request/response evidence' : 'request evidence'})
   - 2–3 test payloads
4. Highlight reflected parameters, error messages, sensitive data, or unusual patterns.
5. If applicable, propose a multi-step chained attack.

REQUEST:
${requestContent}`;

            if (hasResponse) {
                analysisPrompt += `

RESPONSE:
${responseContent}`;
            } else {
                analysisPrompt += `

⚠️ NOTE: Response data is not available. Analysis will be limited to request-based insights only.`;
            }

            analysisPrompt += `

Output must stay concise, structured, and actionable. Format as clear Markdown.`;

            // Use the new system prompt for attack vector analysis
            handleAIRequestWithSystem(
                "You are an AI security assistant inside a web security testing tool. Your job is to analyze HTTP requests and responses to identify realistic attack vectors and generate payloads. Be precise and base everything strictly on what you see.",
                analysisPrompt,
                'Security Analysis'
            );
        });
    }

    if (ctxExplainAi) {
        ctxExplainAi.addEventListener('click', () => {
            // Hide context menu if open
            const contextMenu = document.getElementById('context-menu');
            if (contextMenu) {
                contextMenu.classList.remove('show');
                contextMenu.style.visibility = 'hidden';
            }

            const selection = window.getSelection().toString();
            if (!selection.trim()) {
                alert('Please select some text to explain.');
                return;
            }
            const prompt = `Explain this specific part of an HTTP request / response: \n\n"${selection}"\n\nProvide context on what it is, how it's used, and any security relevance.`;
            handleAIRequest(prompt, ""); // Content is in prompt
        });
    }

    // Close Modals
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.style.display = 'none';
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
}
