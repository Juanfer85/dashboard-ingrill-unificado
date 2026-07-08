const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { getMeliOrders } = require('./meliConnector');

async function run() {
    try {
        const from = '2026-06-01';
        const to = '2026-07-04';
        const orders = await getMeliOrders(from, to);
        console.log(`Found ${orders.length} orders`);
        if (orders.length > 0) {
            const first = orders[0];
            console.log('First order ID:', first.id);
            console.log('Shipping object:', JSON.stringify(first.shipping, null, 2));
            console.log('All order keys:', Object.keys(first));
        }
    } catch (err) {
        console.error('Error:', err.message);
    }
}
run();
