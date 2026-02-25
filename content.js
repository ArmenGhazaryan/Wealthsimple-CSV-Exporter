// content.js - Injects an "Export to CSV" button on the Wealthsimple Activity page and handles CSV export.
// UPDATED VERSION - Uses more stable selectors that are less likely to break

/**
 * Automatically scrolls to the bottom of the page to load all transactions.
 * Wealthsimple uses infinite scroll, so this loads transactions progressively.
 * @returns {Promise<void>}
 */
async function autoScrollToLoadAll() {
    console.log("Starting auto-scroll to load all transactions...");
    
    const scrollDelay = 800; // Wait 800ms between scrolls
    const maxScrollAttempts = 200; // Maximum number of scroll attempts (safety limit)
    let scrollAttempts = 0;
    let previousHeight = 0;
    let unchangedCount = 0;
    
    while (scrollAttempts < maxScrollAttempts) {
        // Scroll to bottom
        window.scrollTo(0, document.body.scrollHeight);
        
        // Wait for new content to load
        await new Promise(resolve => setTimeout(resolve, scrollDelay));
        
        // Check if page height changed (new content loaded)
        const currentHeight = document.body.scrollHeight;
        
        if (currentHeight === previousHeight) {
            unchangedCount++;
            
            // If height hasn't changed for 3 consecutive attempts, we've likely reached the end
            if (unchangedCount >= 3) {
                console.log("Reached end of transactions (no new content loading)");
                break;
            }
        } else {
            unchangedCount = 0; // Reset counter if new content loaded
            console.log(`Loaded more transactions... (scroll attempt ${scrollAttempts + 1})`);
        }
        
        previousHeight = currentHeight;
        scrollAttempts++;
    }
    
    // Scroll back to top
    window.scrollTo(0, 0);
    await new Promise(resolve => setTimeout(resolve, 300));
    
    console.log(`Auto-scroll complete after ${scrollAttempts} attempts`);
}

/**
 * Parses a date string into a consistently formatted date string.
 * Handles "Today", "Yesterday", and standard date formats.
 * @param {string} dateStr - The date string from the Wealthsimple page (e.g., "Today", "Yesterday", "July 1, 2025").
 * @returns {string} The date formatted as "Month Day, Year" (e.g., "July 01, 2025").
 */
function parseDate(dateStr) {
    const today = new Date();
    let date;

    if (dateStr === "Today") {
        date = today;
    } else if (dateStr === "Yesterday") {
        date = new Date(today);
        date.setDate(today.getDate() - 1);
    } else {
        // Attempt to parse a general date string.
        date = new Date(dateStr);
        // If the original dateStr doesn't contain a 4-digit year, explicitly set current year
        if (!/\d{4}/.test(dateStr)) {
            date.setFullYear(today.getFullYear());
        }
    }

    // Format the date to a consistent string, e.g., "July 01, 2025"
    const options = { year: "numeric", month: "long", day: "2-digit" };
    return date.toLocaleDateString("en-US", options);
}

/**
 * Generates a unique import ID for each transaction, useful for data reconciliation.
 * @param {string} date - The parsed date of the transaction.
 * @param {number} amount - The amount of the transaction (in dollars).
 * @param {string} merchant - The merchant/payee name.
 * @returns {string} A unique ID string.
 */
function generateImportId(date, amount, merchant) {
    const amountForId = Math.round(parseFloat(amount) * 100);
    return `ws-${date}-${amountForId}-${merchant}`.replace(/\s+/g, "").toLowerCase();
}

/**
 * Extracts transaction data from the Wealthsimple Activity page's DOM.
 * UPDATED: Uses more stable selectors based on data attributes and semantic patterns.
 * @returns {Array<Object>} An array of transaction objects.
 */
function extractTransactions() {
    console.log("Attempting to extract transactions...");
    const transactions = [];
    const seenTransactions = new Set(); // Track unique transactions to prevent duplicates
    
    // Strategy 1: Look for date headers and transaction rows using data-fs-privacy-rule
    const dateHeaders = document.querySelectorAll('h2[data-fs-privacy-rule="unmask"]');
    
    if (dateHeaders.length > 0) {
        console.log(`Found ${dateHeaders.length} date headers using data-fs-privacy-rule`);
        
        dateHeaders.forEach(dateHeader => {
            const currentDate = dateHeader.innerText.trim();
            
            // Find the next sibling container that has transaction buttons
            let container = dateHeader.nextElementSibling;
            
            // Look for the container with transaction buttons
            while (container && container.tagName !== 'H2') {
                const buttons = container.querySelectorAll('button[type="button"]');
                
                if (buttons.length > 0) {
                    buttons.forEach(button => {
                        const paragraphs = button.querySelectorAll('p');
                        
                        if (paragraphs.length >= 2) {
                            const merchant = paragraphs[0].innerText.trim();
                            const rawAmountText = paragraphs[paragraphs.length - 1].innerText.trim();
                            
                            // Notes/Category could be in the middle paragraphs
                            let notes = "";
                            let category = "";
                            if (paragraphs.length > 2) {
                                category = paragraphs[1].innerText.trim();
                            }
                            if (paragraphs.length > 3) {
                                notes = Array.from(paragraphs).slice(2, paragraphs.length - 1).map(p => p.innerText.trim()).join(" | ");
                            }
                            
                            // Check if this looks like an amount
                            if (/[\d$]/.test(rawAmountText)) {
                                const cleanedAmount = rawAmountText
                                    .replace(/[−–—\u2212]/g, '-')
                                    .replace(/[^\d.-]/g, '');
                                
                                let amountValue = parseFloat(cleanedAmount);
                                
                                if (!isNaN(amountValue)) {
                                    const parsedDate = parseDate(currentDate);
                                    const importId = generateImportId(parsedDate, amountValue, merchant);
                                    
                                    // Only add if we haven't seen this transaction before
                                    if (!seenTransactions.has(importId)) {
                                        seenTransactions.add(importId);
                                        transactions.push({
                                            id: "",
                                            date: parsedDate,
                                            amount: amountValue,
                                            payee: merchant,
                                            notes: notes,
                                            category: category,
                                            import_id: importId
                                        });
                                    }
                                }
                            }
                        }
                    });
                }
                container = container.nextElementSibling;
            }
        });
    }
    
    // Only use Strategy 2 if Strategy 1 found nothing
    if (transactions.length === 0) {
        console.log("Strategy 1 found no transactions, trying alternative approach...");
        
        const allButtons = document.querySelectorAll('button[type="button"]');
        let currentDate = '';
        
        // First pass: find all date headers
        const dateMap = new Map();
        document.querySelectorAll('h2').forEach(h2 => {
            const text = h2.innerText.trim();
            if (/today|yesterday|\d|\w{3,}/i.test(text)) {
                const rect = h2.getBoundingClientRect();
                dateMap.set(h2, { date: text, top: rect.top, bottom: rect.bottom });
            }
        });
        
        // Second pass: match buttons to dates
        allButtons.forEach(button => {
            const buttonRect = button.getBoundingClientRect();
            
            // Find the closest date header above this button
            let closestDate = '';
            let closestDistance = Infinity;
            
            dateMap.forEach((info, h2) => {
                if (buttonRect.top > info.bottom) {
                    const distance = buttonRect.top - info.bottom;
                    if (distance < closestDistance && distance < 2000) { // Within 2000px
                        closestDistance = distance;
                        closestDate = info.date;
                    }
                }
            });
            
            if (closestDate) {
                const paragraphs = button.querySelectorAll('p');
                
                if (paragraphs.length >= 2) {
                    const potentialMerchant = paragraphs[0].innerText.trim();
                    const potentialAmount = paragraphs[paragraphs.length - 1].innerText.trim();
                    
                    let notes = "";
                    let category = "";
                    if (paragraphs.length > 2) {
                        category = paragraphs[1].innerText.trim();
                    }
                    if (paragraphs.length > 3) {
                        notes = Array.from(paragraphs).slice(2, paragraphs.length - 1).map(p => p.innerText.trim()).join(" | ");
                    }
                    
                    if (/[\d$]/.test(potentialAmount) && potentialMerchant.length > 0) {
                        const cleanedAmount = potentialAmount
                            .replace(/[−–—\u2212]/g, '-')
                            .replace(/[^\d.-]/g, '');
                        
                        const amountValue = parseFloat(cleanedAmount);
                        
                        if (!isNaN(amountValue)) {
                            const parsedDate = parseDate(closestDate);
                            const importId = generateImportId(parsedDate, amountValue, potentialMerchant);
                            
                            if (!seenTransactions.has(importId)) {
                                seenTransactions.add(importId);
                                transactions.push({
                                    id: "",
                                    date: parsedDate,
                                    amount: amountValue,
                                    payee: potentialMerchant,
                                    notes: notes,
                                    category: category,
                                    import_id: importId
                                });
                            }
                        }
                    }
                }
            }
        });
    }
    
    console.log(`Extracted ${transactions.length} unique transactions.`);
    
    if (transactions.length > 0) {
        console.log("First transaction:", transactions[0]);
        console.log("Last transaction:", transactions[transactions.length - 1]);
    }
    
    return transactions;
}

/**
 * Submits transactions directly to Actual Budget API via background service worker
 */
async function syncToActualBudget(transactions, accountName, settings, btnElement) {
    const { apiUrl, apiKey, budgetId, accountMap } = settings;
    
    if (!apiUrl || !budgetId) {
        alert("Actual Budget API URL or Budget ID is missing in settings.");
        return false;
    }

    const actualAccountId = accountMap && accountMap[accountName] ? accountMap[accountName] : null;
    
    if (!actualAccountId) {
        alert(`No Actual Budget Account ID mapped for Wealthsimple account: '${accountName}'. Please update your extension settings.`);
        return false;
    }

    // Format transactions for Actual Budget
    const formattedTransactions = transactions.map(tx => {
        const dateObj = new Date(tx.date);
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        
        return {
            date: `${yyyy}-${mm}-${dd}`,
            amount: Math.round(tx.amount * 100),
            payee_name: tx.payee,
            notes: [tx.category, tx.notes].filter(Boolean).join(" | "),
            imported_id: tx.import_id
        };
    });

    try {
        console.log(`Sending ${formattedTransactions.length} transactions to Actual Budget...`);
        
        let originalText = "Sync to Actual Budget";
        if (btnElement && btnElement.querySelector('.ws-export-text')) {
            originalText = btnElement.querySelector('.ws-export-text').innerText;
            btnElement.querySelector('.ws-export-text').innerText = "Syncing...";
        }
        
        // Send message to background script to bypass CORS
        chrome.runtime.sendMessage({
            action: 'syncToActual',
            url: `${apiUrl}/budgets/${budgetId}/accounts/${actualAccountId}/transactions/import`,
            apiKey: apiKey,
            transactions: formattedTransactions
        }, (response) => {
            if (response && response.success) {
                console.log("Actual Budget response:", response.data);
                if (btnElement) {
                    btnElement.querySelector('.ws-export-text').innerText = `Synced ${formattedTransactions.length}!`;
                    btnElement.style.backgroundColor = "#e6f4ea";
                    btnElement.style.borderColor = "#c3e6cb";
                    btnElement.style.color = "#155724";
                }
            } else {
                console.error("Failed to sync to Actual Budget:", response ? response.error : chrome.runtime.lastError);
                alert(`Failed to sync to Actual Budget: ${response ? response.error : 'Unknown error'}`);
                if (btnElement) {
                    btnElement.querySelector('.ws-export-text').innerText = "Sync Failed";
                    btnElement.style.backgroundColor = "#f8d7da";
                    btnElement.style.borderColor = "#f5c6cb";
                    btnElement.style.color = "#721c24";
                }
            }
            
            setTimeout(() => {
                if (btnElement) {
                    btnElement.querySelector('.ws-export-text').innerText = originalText;
                    btnElement.style.backgroundColor = "";
                    btnElement.style.borderColor = "";
                    btnElement.style.color = "";
                }
            }, 3000);
        });
        
        return true;

    } catch (error) {
        console.error("Failed to prepare sync to Actual Budget:", error);
        alert(`Failed to sync to Actual Budget: ${error.message}`);
        return false;
    }
}

/**
 * Downloads the given transactions as a CSV file.
 */
function downloadCSV(transactions, accountName) {
    console.log("Preparing CSV content for download...");
    const headers = ["id", "date", "amount", "payee", "notes", "category", "import_id"];
    
    const csvContent = [
        headers.join(","),
        ...transactions.map(tx => headers.map(h => {
            let value = tx[h];
            if (typeof value === 'number' && isFinite(value)) { 
                value = value.toFixed(2);
            }
            return `"${String(value).replace(/"/g, '""')}"`;
        }).join(","))
    ].join("\\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    
    const safeAccountName = accountName ? `${accountName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_` : '';
    link.download = `wealthsimple_${safeAccountName}transactions_${new Date().toISOString().slice(0,10)}.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    console.log("CSV download initiated successfully.");
}

/**
 * Infer the current account name from the URL or page content
 */
function inferAccountName() {
    let accountName = "account";
    const urlParams = new URLSearchParams(window.location.search);
    const accountId = urlParams.get('account_ids');
    
    if (accountId) {
        if (accountId.includes('cash')) {
            accountName = "cash";
        } else if (accountId.includes('credit-card')) {
            accountName = "credit_card";
        } else if (accountId.includes('non-registered')) {
            accountName = "personal";
        } else if (accountId.includes('tfsa')) {
            accountName = "tfsa";
        } else if (accountId.includes('rrsp')) {
            accountName = "rrsp";
        } else {
            accountName = accountId.split('-')[0] || accountId;
        }
    } else {
        const possibleAccounts = Array.from(document.querySelectorAll('p[data-fs-privacy-rule="unmask"]'))
            .map(el => el.innerText.trim());
        if (possibleAccounts.includes('Chequing') || possibleAccounts.includes('Cash')) {
             accountName = 'cash';
        } else if (possibleAccounts.some(text => text.includes('Credit card'))) {
             accountName = 'credit_card';
        }
    }
    return accountName;
}

/**
 * Attempts to find the "Activity" title on the page and place the action button(s).
 */
function placeExportButton() {
    // Check if our container already exists to avoid duplicates
    if (document.getElementById("ws-buttons-container")) {
        return true;
    }

    const findActivityTitle = () => {
        const headings = document.querySelectorAll('h1, h2');
        for (const heading of headings) {
            if (heading.innerText.trim().toLowerCase() === 'activity') {
                return heading;
            }
        }
        return null;
    };

    const activityTitle = findActivityTitle();
    const currentURL = window.location.href;
    const targetURLPattern = "https://my.wealthsimple.com/app/activity";

    if (activityTitle && currentURL.startsWith(targetURLPattern)) {
        
        chrome.storage.sync.get(['apiUrl', 'budgetId'], (settings) => {
            // Check again after async callback just in case
            if (document.getElementById("ws-buttons-container")) return;
            
            const hasActualSetup = settings.apiUrl && settings.budgetId;
            
            const originalParent = activityTitle.parentNode;
            const flexContainer = document.createElement('div');
            flexContainer.id = "ws-buttons-container";
            flexContainer.style.display = 'flex';
            flexContainer.style.alignItems = 'center';
            flexContainer.style.gap = '12px';
            flexContainer.style.flexWrap = 'wrap';

            // Clean up old individual buttons if they linger
            const oldBtn = document.getElementById("ws-export-btn");
            if (oldBtn && oldBtn.parentNode !== flexContainer) oldBtn.remove();
            const oldSync = document.getElementById("ws-sync-btn");
            if (oldSync && oldSync.parentNode !== flexContainer) oldSync.remove();
            
            originalParent.insertBefore(flexContainer, activityTitle);
            flexContainer.appendChild(activityTitle);

            // 1. Sync Button (if configured)
            if (hasActualSetup) {
                const syncBtn = document.createElement("button");
                syncBtn.id = "ws-sync-btn";
                syncBtn.className = "ws-export ws-sync";
                
                const syncIcon = document.createElement('img');
                syncIcon.src = chrome.runtime.getURL('images/csv-icon.png');
                syncIcon.style.width = '16px'; 
                syncIcon.style.height = '16px';
                syncIcon.style.filter = "invert(1) brightness(2)";
                syncIcon.onerror = () => {
                    syncIcon.style.display = 'none';
                    syncBtn.insertBefore(document.createTextNode('🔄 '), syncBtn.firstChild);
                };
                
                const syncText = document.createElement('span');
                syncText.innerText = "Sync to Actual Budget";
                syncText.className = 'ws-export-text';
                
                syncBtn.appendChild(syncIcon);
                syncBtn.appendChild(syncText);
                
                syncBtn.onclick = () => {
                    const accountName = inferAccountName();
                    const transactions = extractTransactions();
                    if (transactions.length === 0) {
                        alert("No transactions found to sync. Scroll down and try again.");
                    } else {
                        chrome.storage.sync.get(['apiUrl', 'apiKey', 'budgetId', 'accountMap'], (latestSettings) => {
                            syncToActualBudget(transactions, accountName, latestSettings, syncBtn);
                        });
                    }
                };
                flexContainer.appendChild(syncBtn);
            }
            
            // 2. Export CSV Button (always available as fallback)
            const csvBtn = document.createElement("button");
            csvBtn.id = "ws-export-btn";
            csvBtn.className = "ws-export";
            
            const csvIcon = document.createElement('img');
            csvIcon.src = chrome.runtime.getURL('images/csv-icon.png');
            csvIcon.style.width = '16px'; 
            csvIcon.style.height = '16px';
            csvIcon.onerror = () => {
                csvIcon.style.display = 'none';
                csvBtn.insertBefore(document.createTextNode('📊 '), csvBtn.firstChild);
            };
            
            const csvText = document.createElement('span');
            csvText.innerText = "Export CSV";
            csvText.className = 'ws-export-text';
            
            csvBtn.appendChild(csvIcon);
            csvBtn.appendChild(csvText);
            
            csvBtn.onclick = () => {
                const accountName = inferAccountName();
                const transactions = extractTransactions();
                if (transactions.length === 0) {
                    alert("No transactions found to export. Scroll down and try again.");
                } else {
                    downloadCSV(transactions, accountName);
                }
            };
            flexContainer.appendChild(csvBtn);
            
            console.log("Wealthsimple Exporter: Action buttons placed.");
        });

        return true;
    } else {
        return false;
    }
}

/**
 * Initializes the button placement logic with retry mechanism.
 */
function initializeButtonPlacement() {
    // Attempt placement initially
    setTimeout(placeExportButton, 1000);

    // Watch for DOM changes (for SPA navigation)
    const observer = new MutationObserver(() => {
        if (window.location.href.startsWith("https://my.wealthsimple.com/app/activity") && !document.getElementById("ws-buttons-container")) {
             placeExportButton();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    
    // Also listen for history changes
    let lastUrl = location.href; 
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        if (url.startsWith("https://my.wealthsimple.com/app/activity")) {
            setTimeout(placeExportButton, 1000);
        }
      }
    }).observe(document, {subtree: true, childList: true});
}

// Initial call to start the button placement logic
initializeButtonPlacement();
