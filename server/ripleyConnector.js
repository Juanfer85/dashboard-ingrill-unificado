const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { RIPLEY_API_KEY, RIPLEY_API_BASE_URL } = process.env;

async function getRipleyOrders(startDate, endDate) {
    if (!RIPLEY_API_KEY) {
        console.error('RIPLEY_API_KEY is missing');
        return [];
    }

    try {
        console.log(`--- FETCHING RIPLEY ORDERS: ${startDate} to ${endDate} ---`);
        
        const response = await axios.get(`${RIPLEY_API_BASE_URL}/orders`, {
            headers: {
                'Authorization': RIPLEY_API_KEY,
                'Accept': 'application/json'
            },
            params: {
                start_date: startDate, // Mirakl expects ISO8601
                end_date: endDate,
                max: 100,
                paginate: false
            }
        });

        const orders = response.data.orders || [];
        console.log(`✅ Ripley successful: ${orders.length} raw orders found.`);
        return orders;
    } catch (err) {
        console.error('Ripley Fetch Error:', err.response?.data || err.message);
        return [];
    }
}

async function getRipleyInventory() {
    if (!RIPLEY_API_KEY) {
        console.error('RIPLEY_API_KEY is missing');
        return [];
    }

    try {
        console.log('--- FETCHING RIPLEY INVENTORY (OFFERS) ---');
        
        let allOffers = [];
        let page = 1;
        let hasNext = true;
        
        while (hasNext) {
            const response = await axios.get(`${RIPLEY_API_BASE_URL}/offers`, {
                headers: {
                    'Authorization': RIPLEY_API_KEY,
                    'Accept': 'application/json'
                },
                params: {
                    max: 100,
                    page: page
                }
            });

            const offers = response.data.offers || [];
            allOffers = allOffers.concat(offers);
            
            // Check if there are more pages (Mirakl usually has pagination link or we check page size)
            if (offers.length < 100 || allOffers.length >= 1000) {
                hasNext = false;
            } else {
                page++;
            }
        }
        
        console.log(`✅ Ripley inventory fetch successful: ${allOffers.length} offers found.`);
        return allOffers;
    } catch (err) {
        console.error('Ripley Inventory Fetch Error:', err.response?.data || err.message);
        return [];
    }
}

module.exports = {
    getRipleyOrders,
    getRipleyInventory
};
