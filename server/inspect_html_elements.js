const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../client/index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const requiredIds = [
    'source-select',
    'date-start',
    'date-end',
    'loading',
    'theme-toggle',
    'refresh-btn',
    'download-csv-btn',
    'barrel-select',
    'tab-sales',
    'tab-inventory',
    'sales-tab-content',
    'inventory-tab-content',
    'refresh-inventory-btn',
    'inventory-search',
    'total-revenue',
    'total-orders',
    'avg-order-value',
    'top-units-list',
    'top-revenue-list',
    'recent-orders-list',
    'total-revenue-breakdown',
    'total-orders-breakdown',
    'meli-shipments-grid',
    'meli-shipments-count',
    'sales-trend-chart',
    'origin-revenue-chart',
    'top-products-donut',
    'top-revenue-donut',
    'barrel-units-breakdown',
    'barrel-revenue-breakdown',
    'barrel-revenue-total',
    'inv-total-products',
    'inv-shopify-stock',
    'inv-meli-stock',
    'inv-ripley-stock',
    'inv-sodimac-stock',
    'inv-meli-breakdown',
    'inv-ripley-breakdown',
    'inventory-list',
    'inv-record-count',
    'record-count'
];

console.log('--- Inspecting client/index.html for element IDs ---');
requiredIds.forEach(id => {
    const hasId = htmlContent.includes(`id="${id}"`) || htmlContent.includes(`id='${id}'`);
    if (!hasId) {
        console.warn(`[MISSING] id="${id}" is NOT found in client/index.html!`);
    } else {
        // console.log(`[OK] ${id} exists.`);
    }
});
console.log('--- Inspection complete ---');
