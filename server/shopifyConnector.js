const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { SHOP_DOMAIN, API_VERSION, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_TOKENS_PATH } = process.env;

// Helper to read tokens from the JSON file
function readShopifyTokens() {
    try {
        if (!SHOPIFY_TOKENS_PATH || !fs.existsSync(SHOPIFY_TOKENS_PATH)) {
            return { access_token: process.env.SHOPIFY_ACCESS_TOKEN };
        }
        const data = fs.readFileSync(SHOPIFY_TOKENS_PATH, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading Shopify tokens:', err.message);
        return { access_token: process.env.SHOPIFY_ACCESS_TOKEN };
    }
}

// Helper to save tokens back
function saveShopifyTokens(tokenData) {
    try {
        fs.writeFileSync(SHOPIFY_TOKENS_PATH, JSON.stringify(tokenData, null, 2));
    } catch (err) {
        console.error('Error saving Shopify tokens:', err.message);
    }
}

/**
 * Automático: Renueva el token de Shopify usando grant_type=client_credentials
 */
async function refreshShopifyToken() {
    if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
        console.error('CRITICAL: SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET is missing');
        return null;
    }

    try {
        const body = {
            client_id: SHOPIFY_CLIENT_ID,
            client_secret: SHOPIFY_CLIENT_SECRET,
            grant_type: 'client_credentials'
        };

        const response = await axios.post(`https://${SHOP_DOMAIN}/admin/oauth/access_token`, body);
        const { access_token } = response.data;
        
        const tokenData = { 
            access_token, 
            obtained_at: Date.now() 
        };
        saveShopifyTokens(tokenData);
        console.log('Shopify Access Token RENOVED successfully');
        return access_token;
    } catch (err) {
        console.error('Failed to refresh Shopify token:', err.response?.data || err.message);
        return null;
    }
}

/**
 * Generic GraphQL request function with auto-retry on 401
 */
async function shopifyQuery(query, variables = {}) {
    const tokens = readShopifyTokens();
    
    const execute = async (token) => {
        return axios.post(`https://${SHOP_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, 
            { query, variables },
            {
                headers: {
                    'X-Shopify-Access-Token': token,
                    'Content-Type': 'application/json',
                }
            }
        );
    };

    try {
        const response = await execute(tokens.access_token);
        if (response.data.errors) {
            console.error('Shopify API Errors:', JSON.stringify(response.data.errors, null, 2));
            throw new Error('Shopify API Error');
        }
        return response.data.data;
    } catch (error) {
        if (error.response?.status === 401) {
            console.log('Detecting 401 on Shopify. Attempting auto-refresh...');
            const newToken = await refreshShopifyToken();
            if (newToken) {
                const retryResponse = await execute(newToken);
                return retryResponse.data.data;
            }
        }
        console.error('Shopify Request Failed:', error.message);
        throw error;
    }
}

/**
 * Retrieve Orders
 */
async function getOrders(first = 250, after = null, queryStr = null) {
    const query = `
        query getOrders($first: Int!, $after: String, $queryStr: String) {
            orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true, query: $queryStr) {
                pageInfo {
                    hasNextPage
                    endCursor
                }
                edges {
                    node {
                        id
                        name
                        createdAt
                        cancelledAt
                        displayFinancialStatus
                        displayFulfillmentStatus
                        sourceName
                        test
                        totalPriceSet {
                            shopMoney {
                                amount
                                currencyCode
                            }
                        }
                        customer {
                            firstName
                            lastName
                        }
                        lineItems(first: 10) {
                            edges {
                                node {
                                    title
                                    quantity
                                    sku
                                    originalUnitPriceSet {
                                        shopMoney {
                                            amount
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    `;
    return shopifyQuery(query, { first, after, queryStr });
}

/**
 * Retrieve Products and Inventory
 */
async function getProducts(first = 50, after = null) {
    const query = `
        query getProducts($first: Int!, $after: String) {
            products(first: $first, after: $after) {
                pageInfo {
                    hasNextPage
                    endCursor
                }
                edges {
                    node {
                        id
                        title
                        totalInventory
                        variants(first: 50) {
                            edges {
                                node {
                                    id
                                    title
                                    sku
                                    inventoryQuantity
                                    price
                                }
                            }
                        }
                    }
                }
            }
        }
    `;
    return shopifyQuery(query, { first, after });
}

async function getAllProductsWithInventory() {
    let allProducts = [];
    let hasNext = true;
    let cursor = null;
    while (hasNext) {
        try {
            const data = await getProducts(50, cursor);
            if (!data || !data.products) break;
            allProducts = allProducts.concat(data.products.edges.map(e => e.node));
            hasNext = data.products.pageInfo.hasNextPage;
            cursor = data.products.pageInfo.endCursor;
        } catch (err) {
            console.error('Error fetching Shopify products inventory:', err.message);
            hasNext = false;
        }
    }
    return allProducts;
}

/**
 * Retrieve Customers
 */
async function getCustomers(first = 50, after = null) {
    const query = `
        query getCustomers($first: Int!, $after: String) {
            customers(first: $first, after: $after) {
                pageInfo {
                    hasNextPage
                    endCursor
                }
                edges {
                    node {
                        id
                        firstName
                        lastName
                        numberOfOrders
                    }
                }
            }
        }
    `;
    return shopifyQuery(query, { first, after });
}

async function getAllOrders(queryStr) {
    let allOrders = [];
    let hasNext = true;
    let cursor = null;

    console.log(`--- Iniciando descarga recursiva Shopify (query: ${queryStr}) ---`);

    while (hasNext) {
        try {
            const data = await getOrders(250, cursor, queryStr);
            if (!data || !data.orders) break;

            const edges = data.orders.edges;
            allOrders = allOrders.concat(edges.map(e => e.node));

            hasNext = data.orders.pageInfo.hasNextPage;
            cursor = data.orders.pageInfo.endCursor;

            console.log(`   > Descargados ${edges.length} pedidos. Acumulado: ${allOrders.length}. Siguiente página: ${hasNext}`);
            
            if (allOrders.length > 5000) break; // Límite de seguridad
        } catch (err) {
            console.error('Error en paginación Shopify:', err.message);
            hasNext = false;
        }
    }
    // Devolver formato compatible con mapeo existente
    return { orders: { edges: allOrders.map(o => ({ node: o })) } };
}

module.exports = {
    shopifyQuery,
    getOrders,
    getAllOrders,
    getProducts,
    getAllProductsWithInventory,
    getCustomers,
    refreshShopifyToken
};
