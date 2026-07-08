const { getRipleyOrders } = require('./ripleyConnector');
const dayjs = require('dayjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function find() {
    try {
        console.log('Fetching Ripley orders...');
        const start = '2026-01-01T00:00:00Z';
        const end = dayjs().toISOString();
        const orders = await getRipleyOrders(start, end);
        console.log(`Found ${orders.length} total orders in Ripley.`);
        
        const yecssonOrders = orders.filter(o => {
            const customer = o.customer ? `${o.customer.firstname} ${o.customer.lastname}` : '';
            return customer.toLowerCase().includes('yecsson');
        });
        
        console.log(`\n=== YECSSON ORDERS FOUND: ${yecssonOrders.length} ===`);
        yecssonOrders.forEach(o => {
            console.log({
                order_id: o.order_id,
                created_date: o.created_date,
                customer: `${o.customer?.firstname} ${o.customer?.lastname}`,
                total_price: o.total_price
            });
        });
    } catch (err) {
        console.error('Error:', err);
    }
}

find();
