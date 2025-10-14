// Inject this script directly into the settings page console to debug

console.log('=== DEBUGGING SETTINGS TABS ===');

// Check if window.settingsManager exists
console.log('1. window.settingsManager exists:', !!window.settingsManager);
console.log('2. window.SettingsManager exists:', !!window.SettingsManager);

// Check if SettingsManager class exists
if (window.SettingsManager) {
    console.log('3. Creating new SettingsManager instance...');
    const testManager = new window.SettingsManager();
    console.log('4. Test manager created:', testManager);
}

// Check tabs directly
console.log('5. Checking tabs directly...');
const tabs = document.querySelectorAll('.settings-tab');
console.log('   Found tabs:', tabs.length);

tabs.forEach((tab, index) => {
    console.log(`   Tab ${index}:`, {
        element: tab,
        hasDataTab: tab.hasAttribute('data-tab'),
        dataTab: tab.dataset.tab,
        text: tab.textContent.trim(),
        hasClickListener: tab.onclick !== null,
        eventListeners: getEventListeners ? getEventListeners(tab) : 'N/A'
    });
});

// Check panels
console.log('6. Checking panels...');
const panels = document.querySelectorAll('.settings-panel');
console.log('   Found panels:', panels.length);

panels.forEach((panel, index) => {
    console.log(`   Panel ${index}:`, {
        id: panel.id,
        classes: panel.className,
        isVisible: panel.style.display !== 'none' && !panel.classList.contains('hidden')
    });
});

// Manual tab switching test
console.log('7. Manual tab switching test...');
const mikrotikTab = document.querySelector('[data-tab="mikrotik"]');
if (mikrotikTab) {
    console.log('   Found Mikrotik tab, clicking...');
    mikrotikTab.click();

    setTimeout(() => {
        const mikrotikPanel = document.getElementById('mikrotik-panel');
        console.log('   Mikrotik panel visible:', mikrotikPanel && !mikrotikPanel.classList.contains('hidden'));
    }, 100);
}

// Add global click handler to all tabs
console.log('8. Adding global click handler...');
document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', function(e) {
        console.log('=== TAB CLICKED ===');
        console.log('Tab:', e.target.dataset.tab);
        console.log('Target:', e.target);

        // Manual switch
        document.querySelectorAll('.settings-panel').forEach(p => p.classList.add('hidden'));
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));

        const panel = document.getElementById(e.target.dataset.tab + '-panel');
        if (panel) {
            panel.classList.remove('hidden');
            e.target.classList.add('active');
            console.log('Panel shown successfully!');
        }
    });
});

console.log('=== DEBUG SCRIPT COMPLETE ===');