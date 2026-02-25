document.addEventListener('DOMContentLoaded', () => {
  // Load saved settings
  chrome.storage.sync.get(['apiUrl', 'apiKey', 'budgetId', 'accountMap'], (result) => {
    if (result.apiUrl) document.getElementById('apiUrl').value = result.apiUrl;
    if (result.apiKey) document.getElementById('apiKey').value = result.apiKey;
    if (result.budgetId) document.getElementById('budgetId').value = result.budgetId;
    
    if (result.accountMap) {
      const inputs = document.querySelectorAll('.account-map');
      if (result.accountMap.cash) {
          inputs[0].querySelector('.ab-acc').value = result.accountMap.cash;
      }
      if (result.accountMap.credit_card) {
          inputs[1].querySelector('.ab-acc').value = result.accountMap.credit_card;
      }
    }
  });

  // Save settings
  document.getElementById('saveBtn').addEventListener('click', () => {
    const apiUrl = document.getElementById('apiUrl').value.replace(/\/$/, ''); // Remove trailing slash
    const apiKey = document.getElementById('apiKey').value;
    const budgetId = document.getElementById('budgetId').value;
    
    const inputs = document.querySelectorAll('.account-map');
    const accountMap = {};
    inputs.forEach(row => {
        const ws = row.querySelector('.ws-acc').value.trim();
        const ab = row.querySelector('.ab-acc').value.trim();
        if (ws && ab) accountMap[ws] = ab;
    });

    chrome.storage.sync.set({
      apiUrl,
      apiKey,
      budgetId,
      accountMap
    }, () => {
      const status = document.getElementById('status');
      if (chrome.runtime.lastError) {
          status.style.backgroundColor = '#f8d7da';
          status.style.color = '#721c24';
          status.innerText = 'Error saving settings.';
      } else {
          status.style.backgroundColor = '#d4edda';
          status.style.color = '#155724';
          status.innerText = 'Settings saved successfully!';
      }
      status.style.display = 'block';
      setTimeout(() => { status.style.display = 'none'; }, 3000);
    });
  });
});