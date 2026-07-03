const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
        console.error('CRITICAL: SUPABASE_URL o SUPABASE_SECRET_KEY no definidos');
        return null;
    }
    return createClient(url, key);
}

async function readTokens() {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) return null;
        const { data, error } = await supabase
            .from('meli_tokens')
            .select('*')
            .eq('id', 'main')
            .single();
        if (error) {
            console.error('Error leyendo tokens de Supabase:', error.message);
            return null;
        }
        return data;
    } catch (err) {
        console.error('Error en readTokens:', err.message);
        return null;
    }
}

async function saveTokens(tokenData) {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const { error } = await supabase
            .from('meli_tokens')
            .update({
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expires_at: new Date(Date.now() + (tokenData.expires_in || 21600) * 1000).toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', 'main');
        if (error) {
            console.error('Error guardando tokens en Supabase:', error.message);
        } else {
            console.log('Tokens ML guardados en Supabase correctamente');
        }
    } catch (err) {
        console.error('Error en saveTokens:', err.message);
    }
}

async function refreshMeliToken() {
    const tokens = await readTokens();
    if (!tokens || !tokens.refresh_token) {
        console.error('No hay refresh_token disponible en Supabase');
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
        await saveTokens(newTokens);
        return newTokens.access_token;
    } catch (err) {
        console.error('Error al refrescar token ML:', err.response?.data || err.message);
        return null;
    }
}

async function meliRequest(method, url, params = {}, data = null, customConfig = {}) {
    const tokens = await readTokens();
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
            console.log('Token ML expirado, refrescando...');
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
        const tokens = await readTokens();
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
