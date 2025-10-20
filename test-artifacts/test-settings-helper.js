// Test the settings helper functions
const getSetting = (settings, key, defaultValue = '') => {
    if (settings[key] && typeof settings[key] === 'object') {
        return settings[key].value || defaultValue;
    }
    return settings[key] || defaultValue;
};

const getSettingChecked = (settings, key, defaultValue = false) => {
    if (settings[key] && typeof settings[key] === 'object') {
        return settings[key].value === 'true';
    }
    return settings[key] === 'true';
};

// Test data with API response structure (the correct format)
const apiSettings = {
    company_name: {
        value: "Test Company",
        description: "Company name"
    },
    currency: {
        value: "IDR",
        description: "Currency"
    },
    mikrotik_use_ssl: {
        value: "true",
        description: "Use SSL for Mikrotik"
    }
};

// Test data with simple structure (old format)
const simpleSettings = {
    company_name: "Test Company",
    currency: "IDR",
    mikrotik_use_ssl: "true"
};

console.log('=== Testing API Response Structure ===');
console.log('company_name:', getSetting(apiSettings, 'company_name', 'Default'));
console.log('currency:', getSetting(apiSettings, 'currency', 'IDR'));
console.log('mikrotik_use_ssl checked:', getSettingChecked(apiSettings, 'mikrotik_use_ssl'));
console.log('mikrotik_use_ssl value:', getSetting(apiSettings, 'mikrotik_use_ssl'));

console.log('\n=== Testing Simple Structure (backward compatibility) ===');
console.log('company_name:', getSetting(simpleSettings, 'company_name', 'Default'));
console.log('currency:', getSetting(simpleSettings, 'currency', 'IDR'));
console.log('mikrotik_use_ssl checked:', getSettingChecked(simpleSettings, 'mikrotik_use_ssl'));
console.log('mikrotik_use_ssl value:', getSetting(simpleSettings, 'mikrotik_use_ssl'));

console.log('\n=== Testing Edge Cases ===');
console.log('Missing key:', getSetting(apiSettings, 'missing_key', 'Default'));
console.log('Null key:', getSetting({ ...apiSettings, company_name: null }, 'company_name', 'Default'));
console.log('Empty object:', getSetting({ company_name: {} }, 'company_name', 'Default'));