const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Removed top-level process.env extraction to ensure latest values after dotenv load

// Helper to read tokens from the common file
function readTokens() {
    try {
        const tokenPath = process.env.MELI_TOKENS_PATH;
        if (!tokenPath) {
            console.error('CRITICAL: MELI_TOKENS_PATH is UNDEFINED in process.env');
            return null;
        }
        const data = fs.readFileSync(tokenPath, 'utf8');
        const parsed = JSON.parse(data);
        return parsed.default || parsed;
    } catch (err) {
        console.error('Error reading MELI tokens from ' + process.env.MELI_TOKENS_PATH + ':', err.message);
        return null;
    }
}

// Helper to save tokens back (in case of refresh)
function saveTokens(tokenData) {
    try {
        const fullData = { default: { ...tokenData, obtained_at: Date.now() } };
        fs.writeFileSync(process.env.MELI_TOKENS_PATH, JSON.stringify(fullData, null, 2));
    } catch (err) {
        console.error('Error saving MELI tokens:', err.message);
    }
}

async function refreshMeliToken() {
    const tokens = readTokens();
    if (!tokens || !tokens.refresh_token) {
        return null;
    }

    try {
        const body = new URLSearchParams();
        body.append('grant_type', 'refresh_token');
        body.append('client_id', process.env.MELI_APP_ID);
        body.append('client_secret', process.env.MELI_APP_SECRET);
        body.append('refresh_token', tokens.refresh_token);

        const response = await axios.post('https://api.mercadolibre.com/oauth/token', body, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const newTokens = response.data;
        const decorated = { ...newTokens, obtained_at: Date.now() };
        saveTokens(decorated);
        return decorated.access_token;
    } catch (err) {
        console.error('Failed to refresh MELI token:', err.response?.data || err.message);
        return null;
    }
}

async function meliRequest(method, url, params = {}, data = null, customConfig = {}) {
    const tokens = readTokens();
    if (!tokens) return null;

    const execute = async (token) => {
        return axios({
            method,
            url: `https://api.mercadolibre.com${url}`,
            headers: { 'Authorization': `Bearer ${token}` },
            params,
            data,
            ...customConfig
        });
    };

    try {
        const response = await execute(tokens.access_token);
        return response.data;
    } catch (err) {
        if (err.response?.status === 401) {
            const newToken = await refreshMeliToken();
            if (newToken) {
                const retry = await execute(newToken);
                return retry.data;
            }
        }
        throw err;
    }
}

async function getMeliLabel(shipmentId) {
    try {
        const data = await meliRequest(
            'GET',
            `/shipments/${shipmentId}/labels`,
            { response_type: 'pdf' },
            null,
            { responseType: 'arraybuffer' }
        );
        return data;
    } catch (err) {
        console.error(`[Meli] Failed to fetch label for shipment ${shipmentId}:`, err.message);
        throw err;
    }
}

async function getMeliOrders(from, to) {
    try {
        const tokens = readTokens();
        if (!tokens) return [];

        const me = await meliRequest('GET', '/users/me').catch(() => null);
        if (!me) return [];
        const sellerId = me.id;

        const fromDate = from.includes('T') ? from : `${from}T00:00:00.000-05:00`;
        const toDate = to.includes('T') ? to : `${to}T23:59:59.999-05:00`;

        let allOrders = [];
        let hasMore = true;
        let offset = 0;
        const limit = 40;

        console.log(`--- Iniciando descarga recursiva Meli (rango: ${fromDate} a ${toDate}) ---`);

        while (hasMore) {
            const response = await meliRequest('GET', '/orders/search', {
                seller: sellerId,
                sort: 'date_desc',
                limit: limit,
                offset: offset,
                'order.date_created.from': fromDate,
                'order.date_created.to': toDate
            }).catch(err => {
                console.error('MELI /orders/search failed:', err.response?.data || err.message);
                return null;
            });

            if (!response || !response.results) break;

            allOrders = allOrders.concat(response.results);
            console.log(`   > Descargados ${response.results.length} pedidos. Acumulado: ${allOrders.length}`);

            offset += limit;
            hasMore = (response.paging.total > offset) && (allOrders.length < 2000); 
        }

        return allOrders;
    } catch (err) {
        console.error('MELI getOrders error:', err.message);
        return [];
    }
}

async function getMeliInventory() {
    try {
        const me = await meliRequest('GET', '/users/me');
        if (!me || !me.id) return [];
        const sellerId = me.id;

        let allItemIds = [];
        let hasMore = true;
        let offset = 0;
        const limit = 50;

        while (hasMore) {
            const searchRes = await meliRequest('GET', `/users/${sellerId}/items/search`, {
                status: 'active',
                limit: limit,
                offset: offset
            });
            if (!searchRes || !searchRes.results || searchRes.results.length === 0) {
                break;
            }
            allItemIds = allItemIds.concat(searchRes.results);
            offset += limit;
            hasMore = (searchRes.paging && searchRes.paging.total > offset) && (allItemIds.length < 2000);
        }

        if (allItemIds.length === 0) return [];

        // Fetch details in chunks of 20 (standard limit for multiget /items)
        const chunk = 20;
        let allItems = [];
        for (let i = 0; i < allItemIds.length; i += chunk) {
            const chunkIds = allItemIds.slice(i, i + chunk);
            const details = await meliRequest('GET', '/items', { ids: chunkIds.join(',') });
            if (Array.isArray(details)) {
                details.forEach(res => {
                    if (res.code === 200 && res.body) {
                        allItems.push(res.body);
                    }
                });
            }
        }
        return allItems;
    } catch (err) {
        console.error('MELI getInventory error:', err.message);
        return [];
    }
}

module.exports = {
    getMeliOrders,
    getMeliInventory,
    meliRequest,
    getMeliLabel
};
