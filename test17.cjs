const fs = require('fs');
const lines = fs.readFileSync('api/index.ts', 'utf8').split('\n');
console.log(lines.slice(926, 978).join('\n'));
