// Test require('electron') resolution in main process
console.log('process.type:', process.type);
console.log('electron version:', process.versions.electron);

// Check what require('electron') actually returns
const e = require('electron');
console.log('typeof require("electron"):', typeof e);
console.log('is string?', typeof e === 'string');
if (typeof e === 'string') {
  console.log('PROBLEM: require("electron") returned string:', e);
  console.log('This means the npm package is being resolved instead of the built-in');
} else {
  console.log('app:', typeof e.app);
}
if (e.app) e.app.quit();
else process.exit(1);
