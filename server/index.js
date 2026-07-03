const express = require('express');
const cors = require('cors');
const path = require('path');
const XLSX = require('xlsx');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);
const SHOP_TZ = 'America/Santiago';
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { getOrders, getAllOrders, getProducts, getAllProductsWithInventory, getCustomers } = require('./shopifyConnector');
const { getMeliOrders, getMeliInventory, getMeliLabel, meliRequest } = require('./meliConnector');
const { getRipleyOrders, getRipleyInventory } = require('./ripleyConnector');
const { getSodimacOrders, getSodimacInventory } = require('./sodimacConnector');
const { startBot } = require('./telegramBot');

const app = express();
const PORT = process.env.UNIFIED_BACKEND_PORT || 4001;
console.log('=== SERVER STARTING VERSION v1.3.0 ===');

app.use((req, res, next) => {
    const user = process.env.DASHBOARD_USER;
    const pass = process.env.DASHBOARD_PASS;
    if (!user || !pass) return next();
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="Dashboard Ingrill"');
        return res.status(401).send('Autenticación requerida');
    }
    const decoded = Buffer.from(auth.split(' ')[1], 'base64').toString();
    const [u, p] = decoded.split(':');
    if (u !== user || p !== pass) {
        res.set('WWW-Authenticate', 'Basic realm="Dashboard Ingrill"');
        return res.status(401).send('Credenciales incorrectas');
    }
    next();
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        version: 'v1.3.0',
        env: {
            supabase_url: !!process.env.SUPABASE_URL,
            supabase_key: !!process.env.SUPABASE_SECRET_KEY,
            meli_app_id: !!process.env.MELI_APP_ID,
            dashboard_user: !!process.env.DASHBOARD_USER
        }
    });
});

app.use(cors());
app.use(express.json());

const termsMap = {
    'Mini': ['barril', 'mini'],
    'Pequeño Basik': ['barril', 'pequeño', 'basik'],
    'Mediano Basik': ['barril', 'mediano', 'basik'],
    'Grande Basik': ['barril', 'grande', 'basik'],
    'Pequeño Premium': ['barril', 'pequeño', 'premium'],
    'Mediano Premium': ['barril', 'mediano', 'premium'],
    'Grande Premium': ['barril', 'grande', 'premium']
};

const nameFormatting = {
    'Mini': 'Barril Ahumador Mini',
    'Pequeño Basik': 'Barril Ahumador Basik Pequeño',
    'Mediano Basik': 'Barril Ahumador Basik Mediano',
    'Grande Basik': 'Barril Ahumador Basik Grande',
    'Pequeño Premium': 'Barril Ahumador Premium Pequeño',
    'Mediano Premium': 'Barril Ahumador Premium Mediano',
    'Grande Premium': 'Barril Ahumador Premium Grande'
};

const negativeTerms = ['rack', 'funda', 'gancho', 'garfio', 'espina', 'kit', 'accesorio'];

const skuDatabase = [
    { name: 'AHUMADOR PREMIUM PEQUEÑO', ean: '7708583218562', sku: 'AHPEQPRE', normalized: 'Barril Ahumador Premium Pequeño' },
    { name: 'AHUMADOR PREMIUM MEDIANO', ean: '7708583218289', sku: 'AHUMEPREM', normalized: 'Barril Ahumador Premium Mediano' },
    { name: 'AHUMADOR PREMIUM GRANDE', ean: '7708583218753', sku: 'AHUGRAPREM', normalized: 'Barril Ahumador Premium Grande' },
    { name: 'AHUMADOR BASIK PEQUEÑO', ean: '7708583218333', sku: 'AHPEQBA', normalized: 'Barril Ahumador Basik Pequeño' },
    { name: 'AHUMADOR BASIK MEDIANO', ean: '7708583218609', sku: 'AHUMEBA', normalized: 'Barril Ahumador Basik Mediano' },
    { name: 'AHUMADOR BASIK GRANDE', ean: '7708583218524', sku: 'AHUGRABA', normalized: 'Barril Ahumador Basik Grande' },
    { name: 'AHUMADOR BASIK MINI', ean: '7708583218005', sku: 'AHUMINI', normalized: 'Barril Ahumador Mini' },
    { name: 'ASADOR A CARBON PICNIC', ean: '7708583218296', sku: 'ASAPIC', normalized: 'Asador a Carbón Picnic' },
    { name: 'CANASTILLA DE VERDURAS', ean: '7708583218012', sku: 'RACVER', normalized: 'Canastilla de Verduras' },
    { name: 'FORRO GRANDE', ean: '7708583218876', sku: 'FORGRA', normalized: 'Forro Grande' },
    { name: 'FORRO MEDIANO', ean: '7709974567665', sku: 'FORMED', normalized: 'Forro Mediano' },
    { name: 'FORRO MINI', ean: '7708583218616', sku: 'FORMIN', normalized: 'Forro Mini' },
    { name: 'FORRO PEQUEÑO', ean: '7709974567610', sku: 'FORPEQ', normalized: 'Forro Pequeño' },
    { name: 'GANCHO ESPINA DE PESCADO MEDIANO', ean: '7708583218869', sku: 'ESPPES', normalized: 'Espina de Pescado' },
    { name: 'GANCHO ESPINA DE PESCADO MINI', ean: '7708583218593', sku: 'ESPPESMIN', normalized: 'Espina de Pescado para Barril Ahumador MINI' },
    { name: 'GARFIO PREMIUM', ean: '7708583218388', sku: 'GARPRE', normalized: 'Garfio Premium' },
    { name: 'GARRA DE OSO', ean: '7708583218234', sku: 'GAROSO', normalized: 'Garra de Oso' },
    { name: 'KIT GANCHOS X 6', ean: '7708583218166', sku: 'KITGAN', normalized: 'Ganchos x 6und' },
    { name: 'KIT PINCHOS X 4', ean: '7708583218104', sku: 'KITPIN', normalized: 'Kit Pinchos x 4' },
    { name: 'KIT PINCHOS X 4 MINI', ean: '7708583218968', sku: 'KITPINMIN', normalized: 'Kit Pinchos x 4 Mini' },
    { name: 'RACK DE PESCADO', ean: '7709997215406', sku: 'RACPES', normalized: 'Rack de Pescado' },
    { name: 'RACK DE POLLO', ean: '7708583218036', sku: 'RACPOL', normalized: 'Rack de Pollo' },
    { name: 'RACK MULTIUSOS X 3', ean: '7708583218371', sku: 'RAHAMPEQ', normalized: 'Rack Hamburguesas X3 niveles' },
    { name: 'RACK MULTIUSOS X 3 MINI', ean: '7708583218463', sku: 'RACHAMMIN', normalized: 'Rack de Hamburguesas para Barril MINI' },
    { name: 'RACK MULTIUSOS X 4', ean: '7708583218715', sku: 'RAHAMGRA', normalized: 'Rack Multiusos x 4' },
    { name: 'VAPORIZADOR', ean: '7708583218418', sku: 'ACCVAP', normalized: 'Vaporizador' }
];

function resolveProductCodes(normalizedTitle, rawSku) {
    const cleanSku = String(rawSku || '').trim().toUpperCase();
    if (cleanSku && cleanSku !== 'N/A') {
        const found = skuDatabase.find(d => d.sku === cleanSku || d.ean === cleanSku);
        if (found) return { sku: found.sku, ean: found.ean };
    }
    if (normalizedTitle) {
        const lowerNorm = normalizedTitle.toLowerCase();
        const foundExact = skuDatabase.find(d => d.normalized.toLowerCase() === lowerNorm || d.name.toLowerCase() === lowerNorm);
        if (foundExact) return { sku: foundExact.sku, ean: foundExact.ean };
        const foundPartial = skuDatabase.find(d => {
            const dbNorm = d.normalized.toLowerCase();
            const dbName = d.name.toLowerCase();
            return lowerNorm.includes(dbNorm) || dbNorm.includes(lowerNorm) || lowerNorm.includes(dbName) || dbName.includes(lowerNorm);
        });
        if (foundPartial) return { sku: foundPartial.sku, ean: foundPartial.ean };
    }
    if (/^\d{10,14}$/.test(cleanSku)) return { sku: 'N/A', ean: cleanSku };
    return { sku: rawSku || 'N/A', ean: 'N/A' };
}

function normalizeProductName(title) {
    if (!title) return 'N/A';
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('canastilla')) return 'Canastilla de Verduras';
    if (lowerTitle.includes('garra')) return 'Garra de Oso';
    if (lowerTitle.includes('garfio')) return 'Garfio Premium';
    if (lowerTitle.includes('vaporizador')) return 'Vaporizador';
    if (lowerTitle.includes('asador') && lowerTitle.includes('picnic')) return 'Asador a Carbón Picnic';
    if (lowerTitle.includes('funda') || lowerTitle.includes('forro')) {
        if (lowerTitle.includes('mini')) return 'Forro Mini';
        if (lowerTitle.includes('pequeño') || lowerTitle.includes('pequeñ') || lowerTitle.includes('pequeno')) return 'Forro Pequeño';
        if (lowerTitle.includes('mediano')) return 'Forro Mediano';
        if (lowerTitle.includes('grande')) return 'Forro Grande';
    }
    if (lowerTitle.includes('pincho')) {
        if (lowerTitle.includes('mini')) return 'Kit Pinchos x 4 Mini';
        return 'Kit Pinchos x 4';
    }
    if (lowerTitle.includes('espina de pescado') || (lowerTitle.includes('espina') && lowerTitle.includes('pescado'))) {
        if (lowerTitle.includes('mini')) return 'Espina de Pescado para Barril Ahumador MINI';
        return 'Espina de Pescado';
    }
    if (lowerTitle.includes('gancho')) return 'Ganchos x 6und';
    if (lowerTitle.includes('rack')) {
        if (lowerTitle.includes('pollo')) return 'Rack de Pollo';
        if (lowerTitle.includes('pescado')) return 'Rack de Pescado';
        if (lowerTitle.includes('multiuso') || lowerTitle.includes('hamburguesa')) {
            if (lowerTitle.includes('mini')) return 'Rack de Hamburguesas para Barril MINI';
            if (lowerTitle.includes('grande') || lowerTitle.includes('x 4') || lowerTitle.includes('x4')) return 'Rack Multiusos x 4';
            return 'Rack Hamburguesas X3 niveles';
        }
    }
    const hasNegative = negativeTerms.some(neg => lowerTitle.includes(neg));
    if (hasNegative) return title;
    for (const [type, requiredTerms] of Object.entries(termsMap)) {
        const matches = requiredTerms.every(term => {
            if (term === 'pequeño') return lowerTitle.includes('pequeño') || lowerTitle.includes('pequeno');
            return lowerTitle.includes(term);
        });
        if (matches) return nameFormatting[type];
    }
    return title;
}

function normalizeShopifyOrder(o) {
    try {
        if (o.test) return null;
        if (o.cancelledAt) return null;
        const customer = o.customer ? `${o.customer.firstName} ${o.customer.lastName}` : 'Invitado';
        const lineItems = o.lineItems?.edges || [];
        const totalUnits = lineItems.reduce((acc, e) => acc + e.node.quantity, 0);
        let sourceLabel = 'Shopify Web';
        const rawSource = (o.sourceName || '').toLowerCase();
        if (rawSource.includes('ripley')) sourceLabel = 'Ripley';
        else if (rawSource.includes('pos')) sourceLabel = 'Shopify POS';
        else if (rawSource === 'web' || rawSource.includes('online_store')) sourceLabel = 'Shopify Web';
        else sourceLabel = o.sourceName || 'Shopify';
        const items = lineItems.map(li => {
            const normalizedTitle = normalizeProductName(li.node.title);
            const codes = resolveProductCodes(normalizedTitle, li.node.sku);
            return { title: normalizedTitle, quantity: li.node.quantity, price: parseFloat(li.node.originalUnitPriceSet?.shopMoney?.amount || 0), sku: codes.sku, ean: codes.ean };
        });
        const sku = items[0]?.sku || 'N/A';
        const ean = items[0]?.ean || 'N/A';
        return { id: o.name, source: sourceLabel, totalPrice: parseFloat(o.totalPriceSet?.shopMoney?.amount || 0), createdAt: o.createdAt, customer, currency: o.totalPriceSet?.shopMoney?.currencyCode || 'CLP', totalUnits, sku, ean, financialStatus: o.displayFinancialStatus, fulfillmentStatus: o.displayFulfillmentStatus, items };
    } catch (err) {
        console.error('Error normalizing Shopify order:', err, o);
        return null;
    }
}

function normalizeMeliOrder(o) {
    const buyer = o.buyer || {};
    const customer = [buyer.first_name, buyer.last_name].filter(Boolean).join(' ') || buyer.nickname || 'Invitado';
    const totalUnits = (o.order_items || []).reduce((acc, item) => acc + item.quantity, 0);
    const items = (o.order_items || []).map(oi => {
        const normalizedTitle = normalizeProductName(oi.item.title || 'Producto MELI');
        const codes = resolveProductCodes(normalizedTitle, oi.item.seller_sku);
        return { title: normalizedTitle, quantity: oi.quantity, price: parseFloat(oi.unit_price), sku: codes.sku, ean: codes.ean };
    });
    const sku = items[0]?.sku || 'N/A';
    const ean = items[0]?.ean || 'N/A';
    return {
        id: `ML-${o.id}`,
        source: 'Mercado Libre',
        totalPrice: parseFloat(o.total_amount || 0),
        createdAt: o.date_created,
        customer,
        currency: o.currency_id || 'CLP',
        totalUnits,
        sku,
        ean,
        items,
        shipping: {
            id: o.shipping?.id || null,
            status: o.shipping?.status || null,
            substatus: o.shipping?.substatus || null
        }
    };
}

function normalizeRipleyOrder(o) {
    const customer = o.customer ? `${o.customer.firstname} ${o.customer.lastname}` : 'Invitado Ripley';
    
    // Detectar si es el cliente con devolución de dinero solicitada en las fechas específicas (27/05/2026 y 28/06/2026)
    const isRefunded = (() => {
        const lowerCustomer = customer.toLowerCase();
        const isYecsson = lowerCustomer.includes('yecsson') && (lowerCustomer.includes('hernandez') || lowerCustomer.includes('hernández'));
        if (!isYecsson) return false;
        const orderDateStr = o.created_date || '';
        return orderDateStr.startsWith('2026-05-27') || orderDateStr.startsWith('2026-06-28');
    })();

    const totalUnits = isRefunded ? 0 : (o.order_lines || []).reduce((acc, line) => acc + line.quantity, 0);

    const items = (o.order_lines || []).map(line => {
        const normalizedTitle = normalizeProductName(line.product_title);
        const codes = resolveProductCodes(normalizedTitle, line.offer_sku);
        return {
            title: normalizedTitle,
            quantity: isRefunded ? 0 : line.quantity,
            price: isRefunded ? 0 : parseFloat(line.price_unit),
            sku: codes.sku,
            ean: codes.ean
        };
    });
    const sku = items[0]?.sku || 'N/A';
    const ean = items[0]?.ean || 'N/A';

    return {
        id: `RP-${o.order_id}`,
        source: 'Ripley',
        totalPrice: isRefunded ? 0 : parseFloat(o.total_price || 0),
        createdAt: o.created_date,
        customer,
        currency: 'CLP',
        totalUnits,
        sku,
        ean,
        items
    };
}

function normalizeSodimacOrder(o) {
    try {
        const customer = [o.CustomerFirstName, o.CustomerLastName].filter(Boolean).join(' ') || 'Invitado Sodimac';
        const rawItems = o.OrderItems || [];
        const totalUnits = rawItems.length;

        const items = rawItems.map(item => {
            const normalizedTitle = normalizeProductName(item.Name || 'Producto Sodimac');
            const codes = resolveProductCodes(normalizedTitle, item.Sku);
            return {
                title: normalizedTitle,
                quantity: 1,
                price: parseFloat(item.PaidPrice || item.ItemPrice || 0),
                sku: codes.sku,
                ean: codes.ean
            };
        });

        const sku = items[0]?.sku || 'N/A';
        const ean = items[0]?.ean || 'N/A';

        return {
            id: `SD-${o.OrderId || o.OrderNumber}`,
            source: 'Sodimac',
            totalPrice: parseFloat(o.Price || 0),
            createdAt: o.CreatedAt,
            customer,
            currency: 'CLP',
            totalUnits,
            sku,
            ean,
            items
        };
    } catch (err) {
        console.error('Error normalizing Sodimac order:', err, o);
        return null;
    }
}

async function fetchFilteredOrders(rawStartDate, rawEndDate, source = 'all') {
    const defaultStart = '2026-01-01';
    const defaultEnd = dayjs().tz(SHOP_TZ).format('YYYY-MM-DD');
    const startDate = (rawStartDate && rawStartDate !== 'undefined' && rawStartDate !== '') ? rawStartDate : defaultStart;
    const endDate = (rawEndDate && rawEndDate !== 'undefined' && rawEndDate !== '') ? rawEndDate : defaultEnd;
    const start = dayjs.tz(startDate, SHOP_TZ).startOf('day');
    const end = dayjs.tz(endDate, SHOP_TZ).endOf('day');
    const promises = [];
    const results = { shopify: [], meli: [], ripley: [], sodimac: [] };
    
    if (source === 'all' || source === 'shopify') {
        const queryStr = `status:any AND created_at:>=${start.toISOString()} AND created_at:<=${end.toISOString()}`;
        promises.push(getAllOrders(queryStr).then(data => { results.shopify = data.orders.edges.map(e => normalizeShopifyOrder(e.node)); return results.shopify; }).catch(err => { console.error('Shopify fetching failed:', err.message); return []; }));
    }
    if (source === 'all' || source === 'meli') {
        const mFrom = start.toISOString();
        const mTo = end.toISOString();
        promises.push(getMeliOrders(mFrom, mTo).then(orders => { results.meli = orders.map(normalizeMeliOrder); return results.meli; }).catch(err => { console.error('Mercado Libre fetching failed:', err.message); return []; }));
    }
    if (source === 'all' || source === 'ripley') {
        promises.push(getRipleyOrders(start.toISOString(), end.toISOString()).then(orders => { results.ripley = orders.map(normalizeRipleyOrder); return results.ripley; }).catch(err => { console.error('Ripley fetching failed:', err.message); return []; }));
    }
    if (source === 'all' || source === 'sodimac') {
        promises.push(getSodimacOrders(start.toISOString(), end.toISOString()).then(orders => {
            results.sodimac = orders.map(normalizeSodimacOrder);
            return results.sodimac;
        }).catch(err => {
            console.error('Sodimac fetching failed:', err.message);
            return [];
        }));
    }

    await Promise.all(promises);
    
    console.log(`Fetched lists: Shopify=${results.shopify.length}, Meli=${results.meli.length}, Ripley=${results.ripley.length}, Sodimac=${results.sodimac.length}`);
    
    const allOrders = [...results.shopify, ...results.meli, ...results.ripley, ...results.sodimac].filter(Boolean);

    const filteredOrders = allOrders.filter(o => {
        const orderDate = dayjs(o.createdAt).tz(SHOP_TZ);
        const isDateMatch = (orderDate.isAfter(start) || orderDate.isSame(start)) && (orderDate.isBefore(end) || orderDate.isSame(end));
        if (!isDateMatch) return false;
        if (source === 'all') return true;
        if (source === 'shopify') return o.source.includes('Shopify');
        if (source === 'ripley') return o.source === 'Ripley';
        if (source === 'meli') return o.source === 'Mercado Libre';
        if (source === 'sodimac') return o.source === 'Sodimac';
        return true;
    });
    return filteredOrders;
}

app.get('/api/dashboard', async (req, res) => {
    const { startDate, endDate, source = 'all' } = req.query;
    try {
        const initialDateStr = '2026-01-01';
        const todayStr = dayjs().tz(SHOP_TZ).format('YYYY-MM-DD');
        const defaultStart = dayjs().tz(SHOP_TZ).startOf('month').format('YYYY-MM-DD');
        const qStart = (startDate && startDate !== 'undefined' && startDate !== '') ? startDate : defaultStart;
        const qEnd = (endDate && endDate !== 'undefined' && endDate !== '') ? endDate : todayStr;
        const allOrders = await fetchFilteredOrders(initialDateStr, qEnd, source);
        const start = dayjs.tz(qStart + ' 00:00:00', SHOP_TZ);
        const end = dayjs.tz(qEnd + ' 23:59:59', SHOP_TZ);
        const filteredOrders = allOrders.filter(o => {
            const orderDate = dayjs(o.createdAt).tz(SHOP_TZ);
            return (orderDate.isAfter(start) || orderDate.isSame(start)) && (orderDate.isBefore(end) || orderDate.isSame(end));
        });
        const totalRevenue = filteredOrders.reduce((acc, o) => acc + o.totalPrice, 0);
        const totalOrders = filteredOrders.length;
        const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
        const productMap = {};
        filteredOrders.forEach(o => {
            o.items.forEach(item => {
                if (!productMap[item.title]) productMap[item.title] = { name: item.title, sales: 0, revenue: 0, sources: new Set() };
                productMap[item.title].sales += item.quantity;
                productMap[item.title].revenue += item.price * item.quantity;
                productMap[item.title].sources.add(o.source);
            });
        });
        const topProducts = Object.values(productMap).map(p => ({ ...p, sources: Array.from(p.sources) })).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
        const monthlyData = {};
        const trendStart = dayjs.tz('2026-01-01 00:00:00', SHOP_TZ);
        const trendEnd = dayjs.tz(qEnd + ' 23:59:59', SHOP_TZ);
        let tempDate = trendStart.clone().startOf('month');
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        while (tempDate.isBefore(trendEnd) || tempDate.isSame(trendEnd, 'month')) {
            const yearShort = tempDate.format('YY');
            const label = `${monthNames[tempDate.month()]} ${yearShort}`;
            const key = tempDate.format('YYYY-MM');
            monthlyData[key] = { label, revenue: 0, units: 0 };
            tempDate = tempDate.add(1, 'month');
        }
        allOrders.forEach(o => {
            const orderDate = dayjs(o.createdAt).tz(SHOP_TZ);
            const key = orderDate.format('YYYY-MM');
            if (monthlyData[key]) { monthlyData[key].revenue += o.totalPrice || 0; monthlyData[key].units += o.totalUnits || 0; }
        });
        const monthlyTrend = Object.values(monthlyData);
        res.json({ version: "v1.3.0", metrics: { totalRevenue, totalOrders, aov, currency: 'CLP' }, recentOrders: filteredOrders.sort((a, b) => dayjs(b.createdAt).diff(dayjs(a.createdAt))), topProducts, monthlyTrend });
    } catch (error) {
        console.error('API Error:', error.message);
        res.status(500).json({ error: 'Failed to aggregate data', details: error.message });
    }
});

app.get('/api/inventory', async (req, res) => {
    try {
        console.log('\nIncoming Unified Inventory Request...');
        
        // 1. Fetch from all 4 channels in parallel
        const [shopifyProducts, meliItems, ripleyOffers, sodimacProducts] = await Promise.all([
            getAllProductsWithInventory().catch(err => {
                console.error('Shopify inventory fetch failed:', err.message);
                return [];
            }),
            getMeliInventory().catch(err => {
                console.error('Mercado Libre inventory fetch failed:', err.message);
                return [];
            }),
            getRipleyInventory().catch(err => {
                console.error('Ripley inventory fetch failed:', err.message);
                return [];
            }),
            getSodimacInventory().catch(err => {
                console.error('Sodimac inventory fetch failed:', err.message);
                return [];
            })
        ]);
        
        // 2. Display names in Title Case matching the database products
        const displayNames = {
            'AHPEQPRE': 'Ahumador Pequeño Premium',
            'AHUMEPREM': 'Ahumador Mediano Premium',
            'AHUGRAPREM': 'Ahumador Grande Premium',
            'AHPEQBA': 'Ahumador Pequeño Basik',
            'AHUMEBA': 'Ahumador Mediano Basik',
            'AHUGRABA': 'Ahumador Grande Basik',
            'AHUMINI': 'Ahumador Mini Basik',
            'ASAPIC': 'Asador a Carbón Picnic',
            'RACVER': 'Canastilla de Verduras',
            'FORGRA': 'Forro Grande',
            'FORMED': 'Forro Mediano',
            'FORMIN': 'Forro Mini',
            'FORPEQ': 'Forro Pequeño',
            'ESPPES': 'Gancho Espina de Pescado Mediano',
            'ESPPESMIN': 'Gancho Espina de Pescado Mini',
            'GARPRE': 'Garfio Premium',
            'GAROSO': 'Garra de Oso',
            'KITGAN': 'Kit Ganchos x 6',
            'KITPIN': 'Kit Pinchos x 4',
            'KITPINMIN': 'Kit Pinchos x 4 Mini',
            'RACPES': 'Rack de Pescado',
            'RACPOL': 'Rack de Pollo',
            'RAHAMPEQ': 'Rack Multiusos x 3',
            'RACHAMMIN': 'Rack Multiusos x 3 Mini',
            'RAHAMGRA': 'Rack Multiusos x 4',
            'ACCVAP': 'Vaporizador'
        };

        const toTitleCase = (str) => {
            if (!str) return 'N/A';
            return str
                .toLowerCase()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        };

        const inventoryMap = {};
        skuDatabase.forEach(item => {
            inventoryMap[item.sku] = {
                sku: item.sku,
                ean: item.ean,
                title: displayNames[item.sku] || item.normalized,
                shopifyStock: 0,
                meliStock: 0,
                meliFullStock: 0,
                ripleyStock: 0,
                ripleyFullStock: 0,
                sodimacStock: 0,
                totalStock: 0
            };
        });
        
        // Helper to find or create entry in inventoryMap
        const getOrCreateEntry = (resolvedSku, resolvedEan, title) => {
            // First check by resolved SKU
            if (resolvedSku && resolvedSku !== 'N/A' && inventoryMap[resolvedSku]) {
                return inventoryMap[resolvedSku];
            }
            // Check by resolved EAN
            if (resolvedEan && resolvedEan !== 'N/A') {
                const foundByEan = Object.values(inventoryMap).find(item => item.ean === resolvedEan);
                if (foundByEan) return foundByEan;
            }
            // If not found in base database, check if already added as custom item
            const key = resolvedSku !== 'N/A' ? resolvedSku : (resolvedEan !== 'N/A' ? resolvedEan : title);
            if (!inventoryMap[key]) {
                inventoryMap[key] = {
                    sku: resolvedSku || 'N/A',
                    ean: resolvedEan || 'N/A',
                    title: toTitleCase(title),
                    shopifyStock: 0,
                    meliStock: 0,
                    meliFullStock: 0,
                    ripleyStock: 0,
                    ripleyFullStock: 0,
                    sodimacStock: 0,
                    totalStock: 0
                };
            }
            return inventoryMap[key];
        };
        
        // 3. Process Shopify Stock
        shopifyProducts.forEach(prod => {
            const variants = prod.variants?.edges || [];
            variants.forEach(edge => {
                const variant = edge.node;
                const variantTitle = variant.title && variant.title !== 'Default Title' ? `${prod.title} - ${variant.title}` : prod.title;
                const normalizedTitle = normalizeProductName(variantTitle);
                const codes = resolveProductCodes(normalizedTitle, variant.sku);
                const entry = getOrCreateEntry(codes.sku, codes.ean, normalizedTitle);
                entry.shopifyStock += variant.inventoryQuantity || 0;
            });
        });
        
        // 4. Process Mercado Libre Stock
        meliItems.forEach(item => {
            let sku = 'N/A';
            let ean = 'N/A';
            
            const skuAttr = item.attributes?.find(attr => attr.id === 'SELLER_SKU');
            if (skuAttr) sku = skuAttr.value_name;
            
            const gtinAttr = item.attributes?.find(attr => attr.id === 'GTIN');
            if (gtinAttr) ean = gtinAttr.value_name;
            
            const isMeliFull = item.shipping?.logistic_type === 'fulfillment';
            
            if (item.variations && item.variations.length > 0) {
                item.variations.forEach(v => {
                    let vSku = sku;
                    let vEan = ean;
                    const vSkuAttr = v.attributes?.find(attr => attr.id === 'SELLER_SKU');
                    if (vSkuAttr) vSku = vSkuAttr.value_name;
                    const vGtinAttr = v.attributes?.find(attr => attr.id === 'GTIN');
                    if (vGtinAttr) vEan = vGtinAttr.value_name;
                    
                    const varTitle = `${item.title} - ${v.attributes?.map(a => a.value_name).filter(Boolean).join(' ') || ''}`;
                    const normalizedTitle = normalizeProductName(varTitle);
                    const codes = resolveProductCodes(normalizedTitle, vSku);
                    const entry = getOrCreateEntry(codes.sku, codes.ean, normalizedTitle);
                    
                    if (isMeliFull) {
                        entry.meliFullStock += v.available_quantity || 0;
                    } else {
                        entry.meliStock += v.available_quantity || 0;
                    }
                });
            } else {
                const normalizedTitle = normalizeProductName(item.title);
                const codes = resolveProductCodes(normalizedTitle, sku);
                const entry = getOrCreateEntry(codes.sku, codes.ean, normalizedTitle);
                
                if (isMeliFull) {
                    entry.meliFullStock += item.available_quantity || 0;
                } else {
                    entry.meliStock += item.available_quantity || 0;
                }
            }
        });
        
        // 5. Process Ripley Stock
        ripleyOffers.forEach(offer => {
            const normalizedTitle = normalizeProductName(offer.product_title);
            const codes = resolveProductCodes(normalizedTitle, offer.shop_sku);
            const entry = getOrCreateEntry(codes.sku, codes.ean, normalizedTitle);
            
            const isRipleyFull = offer.fulfillment?.center?.code === 'Ripley Fulfillment' || offer.shop_sku.endsWith('-FF');
            if (isRipleyFull) {
                entry.ripleyFullStock += offer.quantity || 0;
            } else {
                entry.ripleyStock += offer.quantity || 0;
            }
        });
        
        // 6. Process Sodimac Stock
        sodimacProducts.forEach(prod => {
            const normalizedTitle = normalizeProductName(prod.Name || prod.Title);
            const codes = resolveProductCodes(normalizedTitle, prod.SellerSku || prod.Sku);
            const entry = getOrCreateEntry(codes.sku, codes.ean, normalizedTitle);
            entry.sodimacStock += parseInt(prod.Quantity || 0, 10);
        });
        
        // 7. Calculate total stocks and convert to array, clamping negative stocks to 0
        const result = Object.values(inventoryMap).map(item => {
            item.shopifyStock = Math.max(0, item.shopifyStock || 0);
            item.meliStock = Math.max(0, item.meliStock || 0);
            item.meliFullStock = Math.max(0, item.meliFullStock || 0);
            item.ripleyStock = Math.max(0, item.ripleyStock || 0);
            item.ripleyFullStock = Math.max(0, item.ripleyFullStock || 0);
            item.sodimacStock = Math.max(0, item.sodimacStock || 0);
            
            item.totalStock = item.shopifyStock + item.meliStock + item.meliFullStock + item.ripleyStock + item.ripleyFullStock + item.sodimacStock;
            return item;
        });
        
        // Sort by the position of SKU in skuDatabase, extra items at the end
        const dbOrder = {};
        skuDatabase.forEach((item, idx) => {
            dbOrder[item.sku] = idx;
        });
        
        result.sort((a, b) => {
            const indexA = dbOrder[a.sku];
            const indexB = dbOrder[b.sku];
            
            if (indexA !== undefined && indexB !== undefined) {
                return indexA - indexB;
            }
            if (indexA !== undefined) return -1;
            if (indexB !== undefined) return 1;
            
            return a.title.localeCompare(b.title);
        });
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            inventory: result
        });
        
    } catch (error) {
        console.error('Inventory API Error:', error);
        res.status(500).json({ error: 'Failed to aggregate inventory data', details: error.message });
    }
});

app.get('/api/meli/shipments/:shipmentId/label', async (req, res) => {
    try {
        const { shipmentId } = req.params;
        console.log(`[Server] Fetching Mercado Libre label for shipment ${shipmentId}`);
        const pdfBuffer = await getMeliLabel(shipmentId);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="label_${shipmentId}.pdf"`);
        res.send(pdfBuffer);
    } catch (err) {
        console.error('Error fetching Meli label:', err.message);
        res.status(500).json({ error: 'Failed to fetch shipping label', details: err.message });
    }
});

app.get('/api/meli-shipments', async (req, res) => {
    try {
        const startDate = dayjs().tz(SHOP_TZ).subtract(30, 'day').format('YYYY-MM-DD');
        const endDate = dayjs().tz(SHOP_TZ).format('YYYY-MM-DD');

        const meliOrders = await fetchFilteredOrders(startDate, endDate, 'meli');

        // Filter and sort by newest first
        const ordersWithShipping = meliOrders.filter(o => o.shipping?.id);
        ordersWithShipping.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Limit to max 20 to avoid rate limits
        const targetOrders = ordersWithShipping.slice(0, 20);

        const activeShipments = [];
        await Promise.all(targetOrders.map(async (o) => {
            try {
                const shipmentId = o.shipping.id;
                const shipmentData = await meliRequest('GET', `/shipments/${shipmentId}`);
                if (shipmentData) {
                    const status = shipmentData.status;
                    const substatus = shipmentData.substatus;

                    if (status !== 'delivered' && status !== 'cancelled') {
                        activeShipments.push({
                            id: o.id,
                            createdAt: o.createdAt,
                            customer: o.customer,
                            items: o.items.map(item => ({
                                title: item.title,
                                sku: item.sku,
                                ean: item.ean,
                                quantity: item.quantity,
                                price: item.price
                            })),
                            totalPrice: o.totalPrice,
                            shipping: {
                                id: shipmentId,
                                status: status || null,
                                substatus: substatus || null,
                                logisticType: shipmentData.logistic_type || null
                            }
                        });
                    }
                }
            } catch (err) {
                console.error(`Error fetching shipment details for ${o.id}:`, err.message);
            }
        }));

        // Sort newest first
        activeShipments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({
            success: true,
            count: activeShipments.length,
            shipments: activeShipments
        });
    } catch (error) {
        console.error('Error fetching Meli shipments:', error);
        res.status(500).json({ error: 'Failed to fetch Meli shipments', details: error.message });
    }
});

app.get('/api/export-excel', async (req, res) => {
    const { startDate, endDate, source = 'all' } = req.query;
    try {
        const filteredOrders = await fetchFilteredOrders(startDate, endDate, source);
        const displayRows = [];
        filteredOrders.forEach(o => {
            const formattedDate = dayjs(o.createdAt).tz(SHOP_TZ).format('DD/MM/YYYY');
            if (o.items && o.items.length > 0) {
                o.items.forEach(item => {
                    displayRows.push({ 'Fecha': formattedDate, 'Orden': (o.orderId || o.id || '').toString(), 'Canal': (o.source || '').toString(), 'Cliente': (o.customer || '').toString(), 'Producto': (item.title || '').toString(), 'Unidades': item.quantity || 0, 'Monto Total': (item.price || 0) * (item.quantity || 0), 'SKU': (item.sku || '').toString(), 'SKU EAN': (item.ean || '').toString() });
                });
            } else {
                displayRows.push({ 'Fecha': formattedDate, 'Orden': (o.id || '').toString(), 'Canal': (o.source || '').toString(), 'Cliente': (o.customer || '').toString(), 'Producto': 'N/A', 'Unidades': 0, 'Monto Total': 0, 'SKU': 'N/A', 'SKU EAN': 'N/A' });
            }
        });
        const worksheet = XLSX.utils.json_to_sheet(displayRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Detalle de Ventas");
        const maxLens = {};
        displayRows.forEach(row => {
            Object.keys(row).forEach(key => {
                const len = row[key] ? row[key].toString().length : 0;
                maxLens[key] = Math.max(maxLens[key] || key.length, len);
            });
        });
        worksheet['!cols'] = Object.keys(maxLens).map(key => ({ wch: Math.min(maxLens[key] + 3, 50) }));
        const dateStr = dayjs().format('YYYY-MM-DD');
        const timeStr = dayjs().format('HHmmss');
        const fileName = `ventas_unified_${dateStr}_${timeStr}.xlsx`;
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Excel Export Error:', error);
        res.status(500).json({ error: 'Error generating Excel file', details: error.message });
    }
});
app.get('/api/meli-auth', (req, res) => {
    const appId = process.env.MELI_APP_ID;
    const redirectUri = 'https://dashboard-ingrill-unificado.vercel.app/api/meli-callback';
    const authUrl = `https://auth.mercadolibre.cl/authorization?response_type=code&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    res.redirect(authUrl);
});

app.get('/api/meli-callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('No se recibió código de autorización');
    try {
        const body = new URLSearchParams();
        body.append('grant_type', 'authorization_code');
        body.append('client_id', process.env.MELI_APP_ID);
        body.append('client_secret', process.env.MELI_APP_SECRET);
        body.append('code', code);
        body.append('redirect_uri', 'https://dashboard-ingrill-unificado.vercel.app/api/meli-callback');
        const axios = require('axios');
        const response = await axios.post('https://api.mercadolibre.com/oauth/token', body, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
        const { error } = await supabase
            .from('meli_tokens')
            .update({
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token,
                expires_at: new Date(Date.now() + (response.data.expires_in || 21600) * 1000).toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', 'main');
        if (error) {
            console.error('Error guardando tokens ML:', error.message);
            return res.status(500).send('Error guardando tokens: ' + error.message);
        }
        res.send('<h2>✅ Mercado Libre conectado exitosamente</h2><p>Los tokens fueron guardados. Ya puedes cerrar esta ventana.</p>');
    } catch (err) {
        console.error('ML OAuth error:', err.response?.data || err.message);
        res.status(500).send('Error en OAuth: ' + JSON.stringify(err.response?.data || err.message));
    }
});
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Unified Dashboard Server running on port ${PORT}`);
    });
}
module.exports = app;
