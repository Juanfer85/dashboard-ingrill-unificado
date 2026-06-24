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

async function meliRequest(method, url, params = {}, data = null) {
    const tokens = await readTokens();
    if (!tokens) return null;
    const execute = async (token) => {
        return axios({
            method,
            url: `https://api.mercadolibre.com${url}`,
            headers: { 'Authorization': `Bearer ${token}` },
            params,
            data
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

module.exports = {
    getMeliOrders,
    meliRequest
};
