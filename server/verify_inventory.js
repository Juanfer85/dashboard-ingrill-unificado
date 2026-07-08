const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const axios = require('axios');

const { getProducts } = require('./shopifyConnector');
const { meliRequest } = require('./meliConnector');

async function testShopify() {
    console.log('\n--- PROBANDO INVENTARIO SHOPIFY ---');
    try {
        const data = await getProducts(5);
        if (!data || !data.products || !data.products.edges) {
            console.log('❌ No se recibieron productos de Shopify o formato inválido.');
            return;
        }
        console.log(`✅ Conexión exitosa. Se recuperaron ${data.products.edges.length} productos.`);
        data.products.edges.forEach(({ node }) => {
            console.log(`- Producto: ${node.title}`);
            console.log(`  Stock Total (totalInventory): ${node.totalInventory}`);
        });
    } catch (err) {
        console.error('❌ Error en Shopify:', err.message);
    }
}

async function testMercadoLibre() {
    console.log('\n--- PROBANDO INVENTARIO MERCADO LIBRE ---');
    try {
        const me = await meliRequest('GET', '/users/me');
        if (!me || !me.id) {
            console.log('❌ No se pudo recuperar información del usuario en Mercado Libre.');
            return;
        }
        const sellerId = me.id;
        console.log(`Seller ID: ${sellerId}`);
        
        const searchRes = await meliRequest('GET', `/users/${sellerId}/items/search`, { status: 'active', limit: 5 });
        if (!searchRes || !searchRes.results) {
            console.log('❌ No se pudieron listar los ítems de Mercado Libre.');
            return;
        }
        
        const itemIds = searchRes.results;
        console.log(`Ítems activos encontrados: ${itemIds.length} (mostrando hasta 5)`);
        
        if (itemIds.length > 0) {
            const details = await meliRequest('GET', '/items', { ids: itemIds.join(',') });
            if (Array.isArray(details)) {
                details.forEach(res => {
                    if (res.code === 200 && res.body) {
                        console.log(`- Ítem: ${res.body.title} (${res.body.id})`);
                        console.log(`  Stock Disponible: ${res.body.available_quantity}`);
                        console.log(`  Precio: ${res.body.price} ${res.body.currency_id}`);
                    } else {
                        console.log(`- Ítem con error de carga (código ${res.code})`);
                    }
                });
            } else {
                console.log('❌ Respuesta de detalles de ítems no es un array.');
            }
        } else {
            console.log('No hay ítems activos.');
        }
    } catch (err) {
        console.error('❌ Error en Mercado Libre:', err.message);
    }
}

async function testRipley() {
    console.log('\n--- PROBANDO INVENTARIO RIPLEY (MIRAKL) ---');
    const { RIPLEY_API_KEY, RIPLEY_API_BASE_URL } = process.env;
    if (!RIPLEY_API_KEY || !RIPLEY_API_BASE_URL) {
        console.log('❌ Falta RIPLEY_API_KEY o RIPLEY_API_BASE_URL en el archivo .env');
        return;
    }
    try {
        console.log(`Conectando a: ${RIPLEY_API_BASE_URL}/offers`);
        const response = await axios.get(`${RIPLEY_API_BASE_URL}/offers`, {
            headers: {
                'Authorization': RIPLEY_API_KEY,
                'Accept': 'application/json'
            },
            params: {
                max: 5
            }
        });
        
        const offers = response.data.offers || [];
        console.log(`✅ Conexión exitosa. Se encontraron ${offers.length} ofertas (inventario).`);
        offers.forEach(offer => {
            console.log(`- Oferta: ${offer.product_title} (SKU: ${offer.shop_sku})`);
            console.log(`  Stock Disponible (quantity): ${offer.quantity}`);
            console.log(`  Precio: ${offer.price} CLP`);
            console.log(`  Estado: ${offer.state_code || 'N/A'} (Activa: ${offer.active})`);
        });
    } catch (err) {
        console.error('❌ Error en Ripley:', err.response?.data || err.message);
    }
}

async function run() {
    await testShopify();
    await testMercadoLibre();
    await testRipley();
}

run();
