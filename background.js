chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'syncToActual') {
        fetch(request.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': request.apiKey || ''
            },
            body: JSON.stringify({ transactions: request.transactions })
        })
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => { throw new Error(`API returned ${response.status}: ${text}`); });
            }
            return response.json();
        })
        .then(data => sendResponse({ success: true, data: data }))
        .catch(error => sendResponse({ success: false, error: error.message }));

        return true; // Keep the message channel open for async response
    }
});