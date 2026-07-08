const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { meliRequest } = require('./meliConnector');

async function run() {
    try {
        const me = await meliRequest('GET', '/users/me');
        const sellerId = me.id;
        const searchRes = await meliRequest('GET', `/users/${sellerId}/items/search`, { status: 'active', limit: 1 });
        const itemId = searchRes.results[0];
        console.log('Fetching item:', itemId);
        const details = await meliRequest('GET', '/items', { ids: itemId });
        const item = details[0].body;
        
        console.log('Item Attributes:');
        console.log(JSON.stringify(item.attributes, null, 2));
        
        console.log('Item Variations:');
        console.log(JSON.stringify(item.variations, null, 2));
        
        console.log('Available Quantity:', item.available_quantity);
    } catch (err) {
        console.error('Error:', err.message);
    }
}
run();
