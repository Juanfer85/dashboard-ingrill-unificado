/**
 * test_kpi_aggregators.js
 * Verifica la lógica de agregación de KPIs con datos vacíos, nulos o malformados.
 * NO hace llamadas a APIs externas. Usa dayjs localmente.
 */
'use strict';

const path  = require('path');
const dayjs = require(path.join(__dirname, '../node_modules/dayjs'));

let passed = 0;
let failed = 0;

function assert(description, fn) {
    try {
        fn();
        console.log(`  ✅ ${description}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ ${description}\n     ${err.message}`);
        failed++;
    }
}

// ── Reimplementación mínima de la lógica de agregación de /api/dashboard ──────
// Extraída del handler en server/index.js para testearla de forma aislada.
function aggregateKPIs(filteredOrders) {
    const totalRevenue = filteredOrders.reduce((acc, o) => acc + (o.totalPrice || 0), 0);
    const uniqueOrderIds = new Set(filteredOrders.map((o, idx) => o.id || `mock-${idx}`));
    const totalOrders  = uniqueOrderIds.size;
    const aov          = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const productMap = {};
    filteredOrders.forEach(o => {
        (o.items || []).forEach(item => {
            if (!item || !item.title) return;
            if (!productMap[item.title]) productMap[item.title] = { name: item.title, sales: 0, revenue: 0 };
            productMap[item.title].sales   += (item.quantity || 0);
            productMap[item.title].revenue += (item.price || 0) * (item.quantity || 0);
        });
    });
    const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    return { totalRevenue, totalOrders, aov, topProducts };
}

function aggregateMonthlyTrend(allOrders, qEnd) {
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const monthlyData  = {};
    const trendStart   = dayjs('2026-01-01');
    const endMonthKey  = dayjs(qEnd).format('YYYY-MM');
    let tempDate       = trendStart.startOf('month');

    // Comparar strings YYYY-MM (lexicográfico) — evita dependencia de plugins dayjs
    while (tempDate.format('YYYY-MM') <= endMonthKey) {
        const key   = tempDate.format('YYYY-MM');
        const label = `${monthNames[tempDate.month()]} ${tempDate.format('YY')}`;
        monthlyData[key] = { label, revenue: 0, units: 0 };
        tempDate = tempDate.add(1, 'month');
        if (tempDate.year() > 2030) break;
    }

    allOrders.forEach(o => {
        const key = dayjs(o.createdAt).format('YYYY-MM');
        if (monthlyData[key]) {
            monthlyData[key].revenue += (o.totalPrice  || 0);
            monthlyData[key].units   += (o.totalUnits  || 0);
        }
    });
    return Object.values(monthlyData);
}

// ── Tests ─────────────────────────────────────────────────────────────────────
console.log('\n=== test_kpi_aggregators.js: KPI Aggregators ===\n');

// 1. Array vacío
console.log('-- Caso 1: Array vacío --');
assert('totalRevenue = 0 con []', () => {
    const { totalRevenue } = aggregateKPIs([]);
    if (totalRevenue !== 0) throw new Error(`Esperado 0, recibido ${totalRevenue}`);
});
assert('totalOrders = 0 con []', () => {
    const { totalOrders } = aggregateKPIs([]);
    if (totalOrders !== 0) throw new Error(`Esperado 0, recibido ${totalOrders}`);
});
assert('aov = 0 con [] (sin división por 0)', () => {
    const { aov } = aggregateKPIs([]);
    if (aov !== 0) throw new Error(`Esperado 0, recibido ${aov}`);
    if (!isFinite(aov)) throw new Error(`aov no es finito: ${aov}`);
});
assert('topProducts = [] con []', () => {
    const { topProducts } = aggregateKPIs([]);
    if (!Array.isArray(topProducts) || topProducts.length !== 0) throw new Error(`Esperado [], recibido ${JSON.stringify(topProducts)}`);
});

// 2. Órdenes con items: null / undefined
console.log('\n-- Caso 2: Órdenes con items nulos --');
assert('No lanza error cuando items es null', () => {
    const orders = [{ totalPrice: 100000, items: null, createdAt: '2026-07-01T00:00:00Z', totalUnits: 1 }];
    aggregateKPIs(orders); // No debe lanzar
});
assert('No lanza error cuando items es undefined', () => {
    const orders = [{ totalPrice: 80000, createdAt: '2026-07-01T00:00:00Z', totalUnits: 1 }];
    aggregateKPIs(orders);
});
assert('No lanza error cuando items tiene un elemento null', () => {
    const orders = [{ totalPrice: 50000, items: [null, undefined], createdAt: '2026-07-01T00:00:00Z', totalUnits: 1 }];
    aggregateKPIs(orders);
});

// 3. Órdenes con totalPrice: undefined o NaN
console.log('\n-- Caso 3: totalPrice inválido --');
assert('totalRevenue no es NaN cuando totalPrice es undefined', () => {
    const orders = [{ totalPrice: undefined, items: [], createdAt: '2026-07-01T00:00:00Z', totalUnits: 0 }];
    const { totalRevenue } = aggregateKPIs(orders);
    if (isNaN(totalRevenue)) throw new Error(`totalRevenue es NaN`);
    if (totalRevenue !== 0) throw new Error(`Esperado 0, recibido ${totalRevenue}`);
});
assert('totalRevenue correcto con mezcla de válidos e inválidos', () => {
    const orders = [
        { totalPrice: 100000, items: [], createdAt: '2026-07-01T00:00:00Z', totalUnits: 1 },
        { totalPrice: undefined, items: [], createdAt: '2026-07-02T00:00:00Z', totalUnits: 0 },
        { totalPrice: 50000, items: [], createdAt: '2026-07-03T00:00:00Z', totalUnits: 1 },
    ];
    const { totalRevenue, totalOrders } = aggregateKPIs(orders);
    if (totalRevenue !== 150000) throw new Error(`Esperado 150000, recibido ${totalRevenue}`);
    if (totalOrders  !== 3)      throw new Error(`Esperado 3, recibido ${totalOrders}`);
});

// 4. Cálculo de topProducts
console.log('\n-- Caso 4: Agregación de topProducts --');
assert('topProducts agrega correctamente ventas por producto', () => {
    const orders = [
        { totalPrice: 120000, items: [{ title: 'Barril Mini', quantity: 2, price: 60000 }], createdAt: '2026-07-01T00:00:00Z', totalUnits: 2 },
        { totalPrice: 60000,  items: [{ title: 'Barril Mini', quantity: 1, price: 60000 }], createdAt: '2026-07-02T00:00:00Z', totalUnits: 1 },
    ];
    const { topProducts } = aggregateKPIs(orders);
    const barril = topProducts.find(p => p.name === 'Barril Mini');
    if (!barril)            throw new Error('Barril Mini no está en topProducts');
    if (barril.sales !== 3) throw new Error(`Esperado 3 ventas, recibido ${barril.sales}`);
    if (barril.revenue !== 180000) throw new Error(`Esperado 180000 revenue, recibido ${barril.revenue}`);
});

assert('topProducts tiene máximo 10 elementos', () => {
    const orders = Array.from({ length: 15 }, (_, i) => ({
        totalPrice: 10000,
        items: [{ title: `Producto ${i}`, quantity: 1, price: 10000 }],
        createdAt: '2026-07-01T00:00:00Z',
        totalUnits: 1,
    }));
    const { topProducts } = aggregateKPIs(orders);
    if (topProducts.length > 10) throw new Error(`Esperado máx 10, recibido ${topProducts.length}`);
});

// 5. Monthly trend con array vacío
console.log('\n-- Caso 5: Monthly Trend con datos vacíos --');
assert('aggregateMonthlyTrend no lanza error con []', () => {
    aggregateMonthlyTrend([], '2026-07-08');
});
assert('aggregateMonthlyTrend retorna array de meses', () => {
    const trend = aggregateMonthlyTrend([], '2026-07-08');
    if (!Array.isArray(trend) || trend.length === 0) throw new Error('Debería retornar al menos 1 mes');
    if (typeof trend[0].label !== 'string') throw new Error('Cada mes debe tener un label string');
    if (typeof trend[0].revenue !== 'number') throw new Error('Cada mes debe tener revenue number');
});
assert('aggregateMonthlyTrend revenue = 0 con [] órdenes', () => {
    const trend = aggregateMonthlyTrend([], '2026-07-08');
    const allZero = trend.every(m => m.revenue === 0);
    if (!allZero) throw new Error('Todo revenue debería ser 0 con array vacío');
});
assert('aggregateMonthlyTrend calcula revenue correctamente', () => {
    const orders = [
        { totalPrice: 500000, totalUnits: 3, createdAt: '2026-07-01T12:00:00Z' },
        { totalPrice: 200000, totalUnits: 1, createdAt: '2026-07-05T12:00:00Z' },
    ];
    const trend = aggregateMonthlyTrend(orders, '2026-07-08');
    const jul = trend.find(m => m.label.startsWith('Jul'));
    if (!jul) throw new Error('No se encontró mes Julio en el trend');
    if (jul.revenue !== 700000) throw new Error(`Esperado 700000, recibido ${jul.revenue}`);
    if (jul.units !== 4) throw new Error(`Esperado 4 unidades, recibido ${jul.units}`);
});

// ── Resultado ─────────────────────────────────────────────────────────────────
console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron\n`);
if (failed > 0) process.exit(1);
