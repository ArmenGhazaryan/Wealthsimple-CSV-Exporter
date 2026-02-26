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
            while (container && container.nodeName == 'DIV') {
                const buttons = container.querySelectorAll('button[type="button"]');
                
                if (buttons.length > 0) {
                    buttons.forEach(button => {
                        const paragraphs = button.querySelectorAll('p');
                        
                        if (paragraphs.length >= 2) {
                            const merchant = paragraphs[0].innerText.trim();
                            const rawAmountText = paragraphs[paragraphs.length - 1].innerText.trim();
                            
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
                                            notes: "",
                                            category: "",
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
                                    notes: "",
                                    category: "",
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
 * Downloads the given transactions as a CSV file.
 * @param {Array<Object>} transactions - An array of transaction objects.
 */
function downloadCSV(transactions) {
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
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `wealthsimple_transactions_${new Date().toISOString().slice(0,10)}.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    console.log("CSV download initiated successfully.");
}

/**
 * Attempts to find the "Activity" title on the page and place the export button next to it.
 * Returns true if the button was successfully placed, false otherwise.
 */
function placeExportButton() {
    if (document.getElementById("ws-export-btn")) {
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
        const btn = document.createElement("button");
        btn.id = "ws-export-btn";
        btn.className = "ws-export";

        const iconImg = document.createElement('img');
        iconImg.src = chrome.runtime.getURL('images/csv-icon.png');
        iconImg.alt = 'CSV Export Icon'; 
        iconImg.style.width = '16px'; 
        iconImg.style.height = '16px';
        iconImg.classList.add('ws-export-icon');
        
        // Handle icon load error gracefully
        iconImg.onerror = () => {
            console.warn('CSV icon failed to load, using emoji fallback');
            iconImg.style.display = 'none';
            btn.insertBefore(document.createTextNode('📊 '), btn.firstChild);
        };

        const buttonTextSpan = document.createElement('span');
        buttonTextSpan.innerText = "Export to CSV"; 
        buttonTextSpan.classList.add('ws-export-text');

        btn.appendChild(iconImg);
        btn.appendChild(buttonTextSpan);

        btn.onclick = () => {
            console.log("Export to CSV button clicked.");
            const transactions = extractTransactions();
            if (transactions.length === 0) {
                alert("No transactions found on the page to export. Please scroll to load more transactions and try again.");
            } else {
                downloadCSV(transactions);
            }
        };

        const originalParent = activityTitle.parentNode;
        const flexContainer = document.createElement('div');
        flexContainer.style.display = 'flex';
        flexContainer.style.alignItems = 'center';
        flexContainer.style.gap = '16px';
        flexContainer.style.flexWrap = 'wrap';

        originalParent.insertBefore(flexContainer, activityTitle);
        flexContainer.appendChild(activityTitle);
        flexContainer.appendChild(btn);

        console.log("Wealthsimple CSV Exporter: Button successfully placed on the page.");
        return true;
    } else {
        return false;
    }
}

/**
 * Initializes the button placement logic with retry mechanism.
 */
function initializeButtonPlacement() {
    // Wait a bit for the SPA to load
    setTimeout(() => {
        if (placeExportButton()) {
            return;
        }

        const observer = new MutationObserver((mutationsList, observer) => {
            if (placeExportButton()) {
                observer.disconnect();
                console.log("Wealthsimple CSV Exporter: Observer disconnected after successful button placement.");
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        console.log("Wealthsimple CSV Exporter: MutationObserver started to watch for button placement opportunity.");
    }, 1000);
}

// Initial call to start the button placement logic
initializeButtonPlacement();