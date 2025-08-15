// content.js - Injects an "Export to CSV" button on the Wealthsimple Activity page and handles CSV export.

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
        // If no year is present, JavaScript's Date constructor often defaults to the current year.
        date = new Date(dateStr);
        // If the original dateStr doesn't contain a 4-digit year, explicitly set current year
        // to handle cases where new Date() might pick an incorrect year (e.g., for "Dec 31" next year)
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
    // Convert amount to cents for better consistency and uniqueness in the ID,
    // avoiding floating point issues.
    const amountForId = Math.round(parseFloat(amount) * 100);
    // Combine date, amount, and merchant, then clean for URL/ID safety.
    return `ws-${date}-${amountForId}-${merchant}`.replace(/\s+/g, "").toLowerCase();
}

/**
 * Extracts transaction data from the Wealthsimple Activity page's DOM.
 * This function contains the specific scraping logic that was previously working for you.
 * It iterates through H2 elements (dates) and transaction rows to gather data.
 * @returns {Array<Object>} An array of transaction objects.
 */
function extractTransactions() {
    console.log("Attempting to extract transactions...");
    // Select all H2 elements (which likely represent dates) and transaction row containers.
    // The selectors 'h2[data-fs-privacy-rule="unmask"]' and 'div.sc-9b4b78e7-0.goMPYj'
    // are crucial and based on Wealthsimple's specific HTML structure at the time this worked.
    const elements = document.body.querySelectorAll('h2[data-fs-privacy-rule="unmask"], div.sc-9b4b78e7-0.goMPYj');
    const transactions = [];
    let currentDate = ''; // To store the date from the most recently encountered H2 tag.

    elements.forEach(el => {
        // If it's an H2 tag, it contains a date. Update currentDate.
        if (el.tagName === 'H2') {
            currentDate = el.innerText.trim();
        } 
        // If it's a div with the specific class, it's a transaction row.
        else if (el.classList.contains('goMPYj')) {
            // Find the button within the transaction row which contains the details.
            const rowButton = el.querySelector('div.sc-9b4b78e7-0.hdQWHv > button');

            if (!rowButton) {
                // If the expected button structure is not found, skip this element.
                return;
            }

            // Extract merchant and amount elements within the row button.
            const merchantEl = rowButton.querySelector('p.sc-cfb9aefc-0.bebPVD');
            const amountEl = rowButton.querySelector('p.sc-cfb9aefc-0.jYlqYr');

            if (!merchantEl || !amountEl) {
                // If either merchant or amount is missing, skip this transaction.
                return;
            }

            const merchant = merchantEl.innerText.trim();
            let rawAmountText = amountEl.innerText.trim();
            
            // Clean the amount text: replace unicode minus with standard hyphen, then remove non-numeric characters except dot and hyphen.
            const cleanedAmount = rawAmountText.replace(/−/g, '-') // Replace unicode minus with standard hyphen
                                               .replace(/[^\d.-]/g, ''); // Remove any character that's not a digit, dot, or hyphen

            let amountValue = parseFloat(cleanedAmount);

            if (isNaN(amountValue)) {
                console.warn('Wealthsimple CSV Exporter: Failed to parse amount. Original:', rawAmountText, 'Cleaned:', cleanedAmount);
                amountValue = 0; // Default to 0 if parsing fails
            }

            const amountDollars = amountValue;
            const parsedDate = parseDate(currentDate); // Use the most recently found date

            // Create the transaction object in the desired CSV format.
            const transaction = {
                id: "", // Placeholder, can be left empty or dynamically generated if needed
                date: parsedDate,
                amount: amountDollars,
                payee: merchant,
                notes: "", // Placeholder for notes
                category: "", // Placeholder for category
                import_id: generateImportId(parsedDate, amountValue, merchant) // Unique ID for import
            };

            transactions.push(transaction);
        }
    });

    console.log(`Extracted ${transactions.length} transactions.`);
    return transactions;
}

/**
 * Downloads the given transactions as a CSV file.
 * This function combines the conversion to CSV and the download process.
 * @param {Array<Object>} transactions - An array of transaction objects.
 */
function downloadCSV(transactions) {
    console.log("Preparing CSV content for download...");
    const headers = ["id", "date", "amount", "payee", "notes", "category", "import_id"];
    
    // Create the CSV content string
    const csvContent = [
        headers.join(","), // CSV header row
        ...transactions.map(tx => headers.map(h => {
            let value = tx[h];
            // Format numbers to 2 decimal places and ensure all values are quoted for CSV safety
            if (typeof value === 'number' && isFinite(value)) { 
                value = value.toFixed(2);
            }
            // Ensure values with commas or quotes are properly escaped and quoted
            return `"${String(value).replace(/"/g, '""')}"`;
        }).join(","))
    ].join("\n"); // Join all rows with newlines

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" }); // Create a Blob from the CSV string
    const url = URL.createObjectURL(blob); // Create a URL for the Blob
    
    const link = document.createElement("a"); // Create a temporary anchor element for download
    link.href = url;
    link.download = `wealthsimple_transactions_${new Date().toISOString().slice(0,10)}.csv`; // Dynamic filename
    
    document.body.appendChild(link); // Append to body (necessary for Firefox)
    link.click(); // Programmatically click the link to trigger download
    document.body.removeChild(link); // Clean up the temporary link
    
    URL.revokeObjectURL(url); // Release the object URL
    console.log("CSV download initiated successfully.");
}

/**
 * Attempts to find the "Activity" title on the page and place the export button next to it.
 * It also handles the button's click event to trigger transaction extraction and CSV download.
 * Returns true if the button was successfully placed, false otherwise.
 */
function placeExportButton() {
    // If the button already exists in the DOM, no need to add it again.
    if (document.getElementById("ws-export-btn")) {
        return true;
    }

    // Helper function to find the "Activity" title element.
    const findActivityTitle = () => {
        const headings = document.querySelectorAll('h1, h2'); // Check both H1 and H2 tags
        for (const heading of headings) {
            // Trim and convert to lowercase for robust matching.
            if (heading.innerText.trim().toLowerCase() === 'activity') {
                return heading;
            }
        }
        return null; // Return null if not found.
    };

    const activityTitle = findActivityTitle();
    const currentURL = window.location.href;
    const targetURLPattern = "https://my.wealthsimple.com/app/activity"; // Expected URL pattern for the activity page

    // Only proceed to place the button if the "Activity" title is found
    // AND the current URL matches the expected pattern.
    if (activityTitle && currentURL.startsWith(targetURLPattern)) {
        // Create the export button
        const btn = document.createElement("button");
        btn.id = "ws-export-btn"; // Unique ID for the button
        btn.className = "ws-export"; // Class for styling

        // Create and configure the icon image
        const iconImg = document.createElement('img');
        iconImg.src = chrome.runtime.getURL('images/csv-icon.png'); // Get URL to extension resource
        iconImg.alt = 'CSV Export Icon'; 
        iconImg.style.width = '16px'; 
        iconImg.style.height = '16px';
        iconImg.classList.add('ws-export-icon'); 

        // Create and configure the button text
        const buttonTextSpan = document.createElement('span');
        buttonTextSpan.innerText = "Export to CSV"; 
        buttonTextSpan.classList.add('ws-export-text'); 

        // Append icon and text to the button
        btn.appendChild(iconImg);
        btn.appendChild(buttonTextSpan);

        // Set up the button's click handler
        btn.onclick = () => {
            console.log("Export to CSV button clicked.");
            const transactions = extractTransactions();
            if (transactions.length === 0) {
                alert("No transactions found on the page to export. Please scroll to load transactions, or check the extension's console for errors if the page structure has changed.");
            } else {
                downloadCSV(transactions);
            }
        };

        // Create a flex container to hold both the title and the button
        const originalParent = activityTitle.parentNode;
        const flexContainer = document.createElement('div');
        flexContainer.style.display = 'flex';
        flexContainer.style.alignItems = 'center'; // Vertically align items in the flex container
        flexContainer.style.gap = '16px'; // Space between items
        flexContainer.style.flexWrap = 'wrap'; // Allow items to wrap if space is limited

        // Insert the new flex container before the original title element
        originalParent.insertBefore(flexContainer, activityTitle);
        // Move the original title and the new button into the flex container
        flexContainer.appendChild(activityTitle);
        flexContainer.appendChild(btn);

        console.log("Wealthsimple CSV Exporter: Button successfully placed on the page.");
        return true; // Button successfully placed
    } else {
        // This warning is commented out to reduce console noise during SPA loading,
        // as the observer will keep trying until conditions are met.
        // console.warn("Wealthsimple CSV Exporter: Target 'Activity' title or URL not matched, button not added yet.");
        return false; // Button not placed
    }
}

/**
 * Initializes the button placement logic. 
 * It attempts to place the button immediately on script load.
 * If not successful, it sets up a MutationObserver to continuously watch for DOM changes,
 * which is crucial for Single-Page Applications (SPAs) like Wealthsimple.
 */
function initializeButtonPlacement() {
    // Attempt to place the button immediately when the content script loads.
    if (placeExportButton()) {
        return; // If successful, no need for the observer.
    }

    // If the button wasn't placed immediately (e.g., page not fully loaded or navigating within SPA),
    // set up a MutationObserver to watch for changes in the DOM.
    const observer = new MutationObserver((mutationsList, observer) => {
        // For each set of DOM changes, try to place the button again.
        if (placeExportButton()) {
            // If the button is successfully placed, disconnect the observer to save resources.
            observer.disconnect();
            console.log("Wealthsimple CSV Exporter: Observer disconnected after successful button placement.");
        }
    });

    // Start observing the document body for changes:
    // - childList: true  --> Detect when direct children elements are added or removed.
    // - subtree: true    --> Detect changes in any descendant element within the body.
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("Wealthsimple CSV Exporter: MutationObserver started to watch for button placement opportunity.");
}

// Initial call to start the button placement logic when the content script is injected into the page.
initializeButtonPlacement();