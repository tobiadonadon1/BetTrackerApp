const { execSync } = require('child_process');

// Take screenshot before
execSync('xcrun simctl io 0F095CAF-A1BF-4484-BD38-F8894BF84641 screenshot /tmp/before.png');

// Use idb-companion directly
const idbPath = '/opt/homebrew/bin/idb';
console.log('Testing login screen touch...');
