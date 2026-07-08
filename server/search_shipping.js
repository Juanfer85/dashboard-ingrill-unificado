const fs = require('fs');
const path = require('path');

const files = [
    path.join(__dirname, '../client/main.js'),
    path.join(__dirname, '../client/index.html'),
    path.join(__dirname, 'index.js')
];

files.forEach(f => {
    if (fs.existsSync(f)) {
        const content = fs.readFileSync(f, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
            if (line.toLowerCase().includes('shipping')) {
                console.log(`${path.basename(f)}:L${idx + 1}: ${line.trim()}`);
            }
        });
    } else {
        console.log(`File not found: ${f}`);
    }
});
