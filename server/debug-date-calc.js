console.log('\n=== Date Calculation Debug ===');

const date = '2026-04-08';
console.log('Input date:', date);

// Method 1: What the endpoint uses
const previousDate = new Date(`${date}T00:00:00`);
console.log('\nMethod 1 (endpoint code):');
console.log('new Date("2026-04-08T00:00:00"):', previousDate);
console.log('  toString():', previousDate.toString());
console.log('  toISOString():', previousDate.toISOString());
previousDate.setDate(previousDate.getDate() - 1);
console.log('After setDate(-1):', previousDate.toString());
const previousDateStr = previousDate.toISOString().slice(0, 10);
console.log('Result:', previousDateStr);

// Method 2: UTC-aware
const d2 = new Date(Date.UTC(2026, 3, 8, 0, 0, 0)); // April 8
console.log('\nMethod 2 (UTC constructor):');
console.log('UTC(2026, 3, 8):', d2.toString());
d2.setUTCDate(d2.getUTCDate() - 1);
console.log('After setUTCDate(-1):', d2.toISOString().slice(0, 10));

// Method 3: Simple string math
console.log('\nMethod 3 (string parsing):');
const [y, m, d] = date.split('-').map(Number);
const yesterday = new Date(y, m - 1, d - 1);
console.log('new Date(2026, 3, 7):', yesterday.toString());
console.log('toISOString:', yesterday.toISOString().slice(0, 10));

// Method 4: What should work
console.log('\nMethod 4 (proper UTC):');
const targetDate = new Date(date + 'T00:00:00Z');
console.log('new Date("2026-04-08T00:00:00Z"):', targetDate);
targetDate.setUTCDate(targetDate.getUTCDate() - 1);
console.log('After setUTCDate(-1):', targetDate.toISOString().slice(0, 10));

console.log('\n=== TIMEZONE ===');
const now = new Date();
const offset = now.getTimezoneOffset();
console.log('System timezone offset:', offset, 'minutes');
console.log('That is:', offset / -60, 'hours ahead of UTC');
