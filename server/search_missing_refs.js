const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../client/main.js');
if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
        if (line.includes('top-revenue-donut') || line.includes('barrel-revenue-total')) {
            console.log(`L${idx + 1}: ${line.trim()}`);
        }
    });
}
