const axios = require('axios');
const crypto = require('crypto');
const dayjs = require('dayjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { SODIMAC_API_URL, SODIMAC_USER_ID, SODIMAC_API_KEY } = process.env;

function signRequest(params, apiKey) {
    const sortedKeys = Object.keys(params).sort();
    const queryString = sortedKeys.map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
    const signature = crypto
        .createHmac('sha256', apiKey)
        .update(queryString)
        .digest('hex');
    return { queryString, signature };
}

async function getOrderItems(orderId) {
    if (!SODIMAC_API_KEY || !SODIMAC_USER_ID) return [];
    try {
        const params = {
            Action: 'GetOrderItems',
            Format: 'JSON',
            OrderId: orderId,
            Timestamp: new Date().toISOString(),
            UserID: SODIMAC_USER_ID,
            Version: '1.0'
        };
        const { queryString, signature } = signRequest(params, SODIMAC_API_KEY);
        const finalUrl = `${SODIMAC_API_URL}/?${queryString}&Signature=${signature}`;

        const response = await axios.get(finalUrl, {
            headers: { 'Accept': 'application/json' }
        });
        
        let itemsList = [];
        const rawItems = response.data?.SuccessResponse?.Body?.OrderItems?.OrderItem;
        if (rawItems) {
            if (Array.isArray(rawItems)) {
                itemsList = rawItems;
            } else {
                itemsList = [rawItems];
            }
        }
        return itemsList;
    } catch (err) {
        console.error(`[Sodimac] Error fetching items for order ${orderId}:`, err.message);
        return [];
    }
}

async function getSodimacOrders(startDate, endDate) {
    if (!SODIMAC_API_KEY || !SODIMAC_USER_ID) {
        console.error('[Sodimac] Credentials missing in environment');
        return [];
    }

    try {
        console.log(`--- FETCHING SODIMAC ORDERS: ${startDate} to ${endDate} ---`);
        
        const createdAfter = dayjs(startDate).toISOString();
        
        const params = {
            Action: 'GetOrders',
            Format: 'JSON',
            Timestamp: new Date().toISOString(),
            UserID: SODIMAC_USER_ID,
            Version: '1.0',
            CreatedAfter: createdAfter
        };

        const { queryString, signature } = signRequest(params, SODIMAC_API_KEY);
        const finalUrl = `${SODIMAC_API_URL}/?${queryString}&Signature=${signature}`;

        const response = await axios.get(finalUrl, {
            headers: { 'Accept': 'application/json' }
        });

        let ordersList = [];
        const rawOrders = response.data?.SuccessResponse?.Body?.Orders?.Order;
        if (rawOrders) {
            if (Array.isArray(rawOrders)) {
                ordersList = rawOrders;
            } else {
                ordersList = [rawOrders];
            }
        }

        // Fetch items in parallel for each order
        const ordersWithItems = await Promise.all(ordersList.map(async (o) => {
            const items = await getOrderItems(o.OrderId);
            return {
                ...o,
                OrderItems: items
            };
        }));

        console.log(`✅ Sodimac successful: ${ordersWithItems.length} orders (with items) found.`);
        return ordersWithItems;
    } catch (err) {
        console.error('Sodimac Orders Fetch Error:', err.response?.data || err.message);
        return [];
    }
}

async function getSodimacInventory() {
    if (!SODIMAC_API_KEY || !SODIMAC_USER_ID) {
        console.error('[Sodimac] Credentials missing in environment');
        return [];
    }

    try {
        console.log('--- FETCHING SODIMAC INVENTORY (PRODUCTS) ---');
        
        const params = {
            Action: 'GetProducts',
            Format: 'JSON',
            Timestamp: new Date().toISOString(),
            UserID: SODIMAC_USER_ID,
            Version: '1.0',
            Filter: 'all'
        };

        const { queryString, signature } = signRequest(params, SODIMAC_API_KEY);
        const finalUrl = `${SODIMAC_API_URL}/?${queryString}&Signature=${signature}`;

        const response = await axios.get(finalUrl, {
            headers: { 'Accept': 'application/json' }
        });

        let productsList = [];
        const rawProducts = response.data?.SuccessResponse?.Body?.Products?.Product;
        if (rawProducts) {
            if (Array.isArray(rawProducts)) {
                productsList = rawProducts;
            } else {
                productsList = [rawProducts];
            }
        }

        console.log(`✅ Sodimac inventory fetch successful: ${productsList.length} products found.`);
        return productsList;
    } catch (err) {
        console.error('Sodimac Inventory Fetch Error:', err.response?.data || err.message);
        return [];
    }
}

module.exports = {
    getSodimacOrders,
    getSodimacInventory
};
