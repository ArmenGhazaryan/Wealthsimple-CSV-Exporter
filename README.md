# Wealthsimple CSV Exporter

A simple Chrome (and Chromium-based browser) extension designed to extract and download transaction data from your Wealthsimple Activity page directly to a CSV file.

## Features

- Injects an "Export to CSV" button directly onto the Wealthsimple Activity page.
- Extracts visible transaction data.
- Downloads data as a `.csv` file for easy import into spreadsheets.

## How to Install (for Development)

1.  **Download/Clone:** Download this repository as a ZIP file and extract it, or clone it.
2.  **Open Extensions Page:** Open your browser (Google Chrome is recommended for development) and navigate to `chrome://extensions`.
3.  **Enable Developer Mode:** In the top right corner, toggle on "Developer mode".
4.  **Load Unpacked:** Click the "Load unpacked" button.
5.  **Select Folder:** Navigate to and select the `wealthsimple-csv-exporter` (or whatever you named your main project folder) directory.
6.  **Extension Enabled:** The extension should now appear in your list of extensions and be enabled.

## How to Use

1.  Navigate to your Wealthsimple account's "Activity" page (e.g., `https://my.wealthsimple.com/app/activity`).
2.  An "Export to CSV" button will appear on the page (usually near the activity title).
3.  Click the "Export to CSV" button.
4.  A CSV file containing your transaction data will be downloaded to your computer.

### Screenshot of the button on the Activity page:

![Screenshot of Export Button on Wealthsimple Activity Page](images/activity-page-screenshot.png)

## Customization / Troubleshooting

### Data Extraction (`content.js`)

The core logic for extracting transactions is in `content.js` within the `extractTransactions()` function. Wealthsimple's website structure may change over time. If the button appears but no transactions are found (or incorrect data is downloaded), you will need to update the CSS selectors in this function:

1.  Go to your Wealthsimple Activity page.
2.  Right-click on a transaction and select "Inspect" (or "Inspect Element").
3.  Examine the HTML structure to find the correct class names or data attributes for:
    * The main transaction rows/items.
    * The date, description, and amount fields within each transaction.
4.  Update the `document.querySelectorAll()` and `row.querySelector()` calls in `extractTransactions()` accordingly.

## License

This project is licensed under the **MIT License**.

The MIT License is a permissive free software license, meaning it allows reuse for any purpose,
and it only requires that all copies of the licensed software include a copy of the MIT License terms and the copyright notice.

You are free to:
* **Use:** Privately and commercially.
* **Modify:** Change and adapt the code.
* **Distribute:** Share the code with others.
* **Sublicense:** Grant others the right to use the software under the same or different terms.