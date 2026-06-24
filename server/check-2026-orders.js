const { getAllOrders } = require('./shopifyConnector');
const dayjs = require('dayjs');

async function checkAll2026() {
    console.log('Checking all Shopify orders in 2026...');
    const queryStr = "status:any AND created_at:>=2026-01-01T00:00:00Z";
    try {
        const data = await getAllOrders(queryStr);
        const orders = data.orders.edges;
        console.log(`Found total ${orders.length} orders in 2026.`);
        
        const months = {};
        orders.forEach(e => {
            const date = dayjs(e.node.createdAt);
            const key = date.format('YYYY-MM');
            months[key] = (months[key] || 0) + 1;
        });
        
        console.log('Orders per month:');
        console.table(months);
    } catch (err) {
        console.error('Error:', err.message);
    }
}

checkAll2026();
