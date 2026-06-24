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
