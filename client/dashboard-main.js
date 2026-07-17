// v=16.2 - polyfills de CDNs, fallback de fechas y correccion de sintaxis activa
window.lucide = window.lucide || { createIcons: () => { console.warn("Lucide no cargó."); } };
if (typeof Chart === 'undefined') {
    window.Chart = class DummyChart {
        constructor() { console.warn("Chart.js no cargó."); }
        destroy() {}
    };
}

const API_BASE = '/api';
let trendChart = null;
let donutChart = null;
let originChart = null;

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    initializeFilters();
    fetchData();

    // Lógica de tema
    const themeBtn = document.getElementById('theme-toggle');
    if (localStorage.getItem('theme') === 'light') {
        document.body.setAttribute('data-theme', 'light');
        if (themeBtn) themeBtn.innerHTML = '<i data-lucide="moon"></i>';
        lucide.createIcons();
    }

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const isLight = document.body.getAttribute('data-theme') === 'light';
            if (isLight) {
                document.body.removeAttribute('data-theme');
                localStorage.setItem('theme', 'dark');
                themeBtn.innerHTML = '<i data-lucide="sun"></i>';
            } else {
                document.body.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
                themeBtn.innerHTML = '<i data-lucide="moon"></i>';
            }
            lucide.createIcons();
            // Si las gráficas necesitan refrescarse para el color del texto, se puede llamar aquí
            if (trendChart) fetchData(); 
        });
    }

    document.getElementById('refresh-btn').addEventListener('click', fetchData);
    document.getElementById('source-select').addEventListener('change', fetchData);

    // Banner de error resiliente: cerrar y reintentar
    const bannerClose = document.getElementById('api-error-close');
    const bannerRetry = document.getElementById('api-error-retry');
    if (bannerClose) bannerClose.addEventListener('click', hideApiError);
    if (bannerRetry) bannerRetry.addEventListener('click', () => { hideApiError(); fetchData(); });
    document.getElementById('download-csv-btn').addEventListener('click', downloadExcel);
    document.getElementById('barrel-select').addEventListener('change', updateBarrelAnalysis);

    // Navegación de Pestañas
    const tabSalesBtn = document.getElementById('tab-sales');
    const tabInventoryBtn = document.getElementById('tab-inventory');
    const tabInvasBtn = document.getElementById('tab-invas');
    const tabClaimsBtn = document.getElementById('tab-claims');
    
    const salesContent = document.getElementById('sales-tab-content');
    const inventoryContent = document.getElementById('inventory-tab-content');
    const invasContent = document.getElementById('invas-tab-content');
    const claimsContent = document.getElementById('claims-tab-content');
    
    const tabs = [
        { btn: tabSalesBtn, content: salesContent, onShow: null },
        { btn: tabInventoryBtn, content: inventoryContent, onShow: () => { if (!window.inventoryData) fetchInventory(); } },
        { btn: tabInvasBtn, content: invasContent, onShow: () => { if (!window.invasData) fetchInvasInventory(); } },
        { btn: tabClaimsBtn, content: claimsContent, onShow: () => { fetchClaims(); } }
    ];

    tabs.forEach(tab => {
        if (tab.btn && tab.content) {
            tab.btn.addEventListener('click', () => {
                tabs.forEach(t => {
                    t.btn?.classList.remove('active');
                    t.content?.classList.remove('active');
                });
                tab.btn.classList.add('active');
                tab.content.classList.add('active');
                lucide.createIcons();
                if (tab.onShow) tab.onShow();
            });
        }
    });

    const refreshInvBtn = document.getElementById('refresh-inventory-btn');
    if (refreshInvBtn) {
        refreshInvBtn.addEventListener('click', fetchInventory);
    }

    const refreshInvasBtn = document.getElementById('refresh-invas-btn');
    if (refreshInvasBtn) {
        refreshInvasBtn.addEventListener('click', fetchInvasInventory);
    }

    const invSearchInput = document.getElementById('inventory-search');
    if (invSearchInput) {
        invSearchInput.addEventListener('input', () => {
            const query = invSearchInput.value.toLowerCase().trim();
            if (!window.inventoryData) return;
            const filtered = window.inventoryData.filter(item => 
                (item.title || '').toLowerCase().includes(query) ||
                (item.sku || '').toLowerCase().includes(query) ||
                (item.ean || '').toLowerCase().includes(query)
            );
            renderInventory(filtered);
        });
    }

    const invasSearchInput = document.getElementById('invas-search');
    if (invasSearchInput) {
        invasSearchInput.addEventListener('input', () => {
            const query = invasSearchInput.value.toLowerCase().trim();
            if (!window.invasData) return;
            const filtered = window.invasData.filter(item => 
                (item.nombre || '').toLowerCase().includes(query)
            );
            renderInvasInventory(filtered);
        });
    }

    const claimsSearchInput = document.getElementById('claims-search');
    if (claimsSearchInput) {
        claimsSearchInput.addEventListener('input', () => {
            filterClaims();
        });
    }
});

function initializeFilters() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const formatDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const r = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${r}`;
    };

    const startInput = document.getElementById('date-start');
    const endInput = document.getElementById('date-end');

    if (startInput) startInput.value = formatDate(firstDay);
    if (endInput) endInput.value = formatDate(now);

    if (typeof flatpickr !== 'undefined') {
        const fpConfig = {
            locale: 'es',
            dateFormat: 'Y-m-d',
            onChange: fetchData,
            disableMobile: "true"
        };
        flatpickr("#date-start", fpConfig);
        flatpickr("#date-end", fpConfig);
    } else {
        console.warn("Flatpickr is not loaded, using native HTML5 date inputs instead.");
    }
}

async function fetchMeliShipments() {
    try {
        const res = await fetch(`${API_BASE}/meli-shipments`);
        const data = await res.json();
        if (data && data.success) {
            renderMeliShipments(data.shipments);
        }
    } catch (err) {
        console.error('Error fetching Meli shipments:', err);
    }
}

async function fetchMeliShipmentStatus() {
    try {
        const res = await fetch(`${API_BASE}/meli-shipment-status`);
        const data = await res.json();
        if (data && data.success) {
            renderMeliShipmentStatus(data);
        }
    } catch (err) {
        console.error('Error fetching Meli shipment status:', err);
    }
}

// ─── Banner de Error Resiliente ─────────────────────────────────────────────
const TRANSIENT_CODES = new Set([0, 408, 429, 500, 502, 503, 504]);

const ERROR_MESSAGES = {
    401: { title: 'Acceso no autorizado (401)', detail: 'Revisa las credenciales de autenticación en las variables de entorno.' },
    403: { title: 'Sin permisos (403)',          detail: 'Tu usuario no tiene acceso a este recurso. Verifica los tokens de API.' },
    404: { title: 'Endpoint no encontrado (404)', detail: 'La ruta de la API no existe. Verifica que el servidor esté actualizado.' },
    429: { title: 'Rate Limit alcanzado (429)',   detail: 'Se han enviado demasiadas solicitudes. Los datos se reintentarán pronto.' },
    500: { title: 'Error interno del servidor (500)', detail: 'El backend encontró un error. Revisa los logs de Vercel.' },
    502: { title: 'Puerta de enlace (502)',       detail: 'El servidor no responde. Puede ser un reinicio temporal.' },
    503: { title: 'Servicio no disponible (503)', detail: 'El servidor está sobrecargado o reiniciando. Intenta de nuevo.' },
    0:   { title: 'Sin conexión a la red',       detail: 'Verifica tu conexión a internet e intenta de nuevo.' },
};

function showApiError(statusCode, fallbackMessage) {
    const banner  = document.getElementById('api-error-banner');
    const titleEl = document.getElementById('api-error-title');
    const detailEl = document.getElementById('api-error-detail');
    const retryBtn = document.getElementById('api-error-retry');
    if (!banner) return;

    const isTransient = TRANSIENT_CODES.has(statusCode);
    const msg = ERROR_MESSAGES[statusCode] || {
        title: isTransient ? 'Error de conexión transitorio' : `Error del servidor (${statusCode})`,
        detail: fallbackMessage || 'No se pudieron obtener los datos.'
    };

    titleEl.textContent  = msg.title;
    detailEl.textContent = msg.detail;
    retryBtn.style.display = isTransient ? 'inline-block' : 'none';

    banner.classList.remove('transient', 'permanent', 'visible');
    // Force reflow so animation re-triggers
    void banner.offsetWidth;
    banner.classList.add(isTransient ? 'transient' : 'permanent', 'visible');
}

function hideApiError() {
    const banner = document.getElementById('api-error-banner');
    if (banner) banner.classList.remove('visible');
}

async function fetchData() {
    const loading = document.getElementById('loading');
    const source = document.getElementById('source-select').value;

    // Obtener fechas con fallback robusto: si Flatpickr no inicializó, usar mes actual por defecto
    let startDate = document.getElementById('date-start').value;
    let endDate = document.getElementById('date-end').value;

    // Validar que sean fechas reales en formato YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate)) {
        const now = new Date();
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-01`;
    }
    if (!dateRegex.test(endDate)) {
        const now = new Date();
        endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    }

    loading.style.display = 'flex';

    try {
        const url = new URL(`${API_BASE}/dashboard`, window.location.origin);
        if (source) url.searchParams.append('source', source);
        url.searchParams.append('startDate', startDate);
        url.searchParams.append('endDate', endDate);

        const res = await fetch(url);

        if (!res.ok) {
            const statusCode = res.status;
            let errDetail = '';
            try { const errJson = await res.json(); errDetail = errJson.details || errJson.error || ''; } catch {}
            showApiError(statusCode, errDetail);
            return;
        }

        hideApiError();
        const data = await res.json();
        console.log('API Response:', data);

        updateDashboard(data);
        await fetchMeliShipments();
        await fetchMeliShipmentStatus();
    } catch (err) {
        console.error('Fetch Error:', err);
        showApiError(0, err.message); // 0 = error de red
    } finally {
        loading.style.display = 'none';
    }
}

function updateDashboard(data) {
    if (!data) return;
    
    const metrics = data.metrics || {};
    const recentOrders = data.recentOrders || [];
    const topProducts = data.topProducts || [];

    // Main Metrics
    const totalUnits = metrics.totalUnits ?? recentOrders.reduce((sum, order) => sum + (order.totalUnits || 0), 0);
    document.getElementById('total-revenue').innerText = formatCurrency(metrics.totalRevenue || 0);
    document.getElementById('total-orders').innerText = metrics.totalOrders || 0;
    document.getElementById('total-units').innerText = totalUnits;
    document.getElementById('avg-order-value').innerText = formatCurrency(metrics.aov || 0);

    // Render Lists
    renderUnitsList(topProducts);
    renderRevenueList(topProducts);
    renderRecentOrders(recentOrders);

    // Global Breakdowns
    const globalRevenueBreakdown = { shopify: 0, meli: 0, ripley: 0, sodimac: 0 };
    const globalOrdersBreakdown = { shopify: 0, meli: 0, ripley: 0, sodimac: 0 };
    
    recentOrders.forEach(o => {
        const source = String(o.source).toLowerCase();
        let key = 'shopify';
        if (source.includes('ripley')) key = 'ripley';
        else if (source.includes('mercado libre')) key = 'meli';
        else if (source.includes('sodimac')) key = 'sodimac';
        
        globalRevenueBreakdown[key] += (o.totalPrice || 0);
        globalOrdersBreakdown[key] += 1;
    });

    renderBreakdown('total-revenue-breakdown', globalRevenueBreakdown, metrics.totalRevenue);
    renderBreakdown('total-orders-breakdown', globalOrdersBreakdown, metrics.totalOrders);

    // Charts
    updateCharts(data);
    
    updateBarrelAnalysis();
}

function renderUnitsList(products) {
    const container = document.getElementById('top-units-list');
    // Sort by sales (units)
    const sorted = [...products].sort((a, b) => b.sales - a.sales).slice(0, 5);
    
    container.innerHTML = sorted.map((p, i) => `
        <div class="list-item">
            <div class="item-info">
                <div class="item-rank">${i + 1}</div>
                <div class="item-details">
                    <h4>${p.name}</h4>
                    <p>ARTICULO INGRILL</p>
                </div>
            </div>
            <div class="item-stat">${p.sales} uds</div>
        </div>
    `).join('');
}

function renderRevenueList(products) {
    const container = document.getElementById('top-revenue-list');
    // Sort by revenue
    const sorted = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    
    container.innerHTML = sorted.map((p, i) => `
        <div class="list-item">
            <div class="item-info">
                <div class="item-rank">${i + 1}</div>
                <div class="item-details">
                    <h4>${p.name}</h4>
                    <p>ARTICULO INGRILL</p>
                </div>
            </div>
            <div class="item-stat revenue">${formatCurrency(p.revenue)}</div>
        </div>
    `).join('');
}

function renderRecentOrders(orders) {
    const container = document.getElementById('recent-orders-list');
    if (!container) return;

    const displayRows = [];

    // Flatten all items into rows
    orders.forEach(o => {
        if (o.items && o.items.length > 0) {
            o.items.forEach(item => {
                displayRows.push({
                    ...o,
                    itemTitle: item.title,
                    itemQuantity: item.quantity,
                    itemPrice: item.price,
                    itemSku: item.sku,
                    itemEan: item.ean
                });
            });
        } else {
            // Fallback for orders with no items
            displayRows.push({
                ...o,
                itemTitle: 'N/A',
                itemQuantity: 0,
                itemPrice: 0,
                itemSku: 'N/A',
                itemEan: 'N/A'
            });
        }
    });

    console.log(`Render Recent Orders: Received ${orders.length} orders. Flattened into ${displayRows.length} rows.`);
    
    window.currentDisplayRows = displayRows;

    // Update the record count in the header
    const recordCountEl = document.getElementById('record-count');
    if (recordCountEl) {
        recordCountEl.innerText = `Mostrando ${displayRows.length} registros`;
    }

    if (displayRows.length === 0) {
        container.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 3rem; color: var(--text-secondary);">No hay registros para mostrar.</td></tr>';
        return;
    }

    container.innerHTML = displayRows.map(o => {
        let logoPath = 'logos/logo_shopify.png';
        let label = o.source;

        const sourceLower = String(o.source).toLowerCase();
        
        if (sourceLower.includes('ripley')) {
            logoPath = 'logos/Logo_Ripley.svg.png';
            label = 'Ripley';
        } else if (sourceLower.includes('mercado libre')) {
            logoPath = 'logos/logo_meli.jpg';
            label = 'Mercado Libre';
        } else if (sourceLower.includes('shopify web')) {
            logoPath = 'logos/logo_shopify.png';
            label = 'Shopify Web';
        } else if (sourceLower.includes('shopify pos')) {
            logoPath = 'logos/logo_shopify.png';
            label = 'Shopify POS';
        } else if (sourceLower.includes('sodimac')) {
            logoPath = 'logos/logo_sodimac.png';
            label = 'Sodimac';
        }
        
        return `
            <tr>
                <td class="nowrap" style="opacity: 0.8;">${new Date(o.createdAt).toLocaleDateString('es-CL').replace(/-/g, '/')}</td>
                <td class="nowrap">
                    <span class="order-id">#${(o.orderId || o.id || '---').toString().slice(-8)}</span>
                </td>
                <td class="nowrap">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <img src="${logoPath}" alt="${label}" style="width: 20px; height: 20px; object-fit: contain; border-radius: 2px;">
                        <span style="font-size: 0.75rem; font-weight: 700;">${label}</span>
                    </div>
                </td>
                <td class="text-wrap">
                    <span class="customer-name">${o.customer || 'N/A'}</span>
                </td>
                <td class="text-wrap">
                    <span style="font-size: 0.75rem; font-weight: 500; color: var(--text-secondary);">${o.itemTitle || 'Sin título'}</span>
                </td>
                <td style="font-weight: 700; text-align: center;">${o.itemQuantity || 0}</td>
                <td class="nowrap" style="font-weight: 800; color: var(--text-primary); text-align: right;">${formatCurrency(o.itemPrice * o.itemQuantity)}</td>
                <td class="nowrap" style="text-align: center;">
                    <span class="sku-tag">${o.itemSku || 'N/A'}</span>
                </td>
                <td class="nowrap" style="text-align: center;">
                    <span class="sku-tag" style="background: rgba(249, 115, 22, 0.1); color: #f97316; border: 1px solid rgba(249, 115, 22, 0.2);">${o.itemEan || 'N/A'}</span>
                </td>
            </tr>
        `;

    }).join('');
}


function updateCharts(data) {
    const orders = data.recentOrders || [];
    const isLight = document.body.getAttribute('data-theme') === 'light';
    const textColor = isLight ? '#52525b' : '#a1a1aa';
    
    // 1. Sales Trend (Monthly Fixed)
    const monthlyTrend = data.monthlyTrend || [];
    const trendLabels = monthlyTrend.map(v => v.label);
    const trendRevenues = monthlyTrend.map(v => v.revenue);
    const trendUnits = monthlyTrend.map(v => v.units);
    
    const maxRevenue = Math.max(...trendRevenues, 0);

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(document.getElementById('sales-trend-chart'), {
        type: 'bar',
        data: {
            labels: trendLabels,
            datasets: [
                {
                    type: 'line',
                    label: 'Tendencia',
                    data: trendRevenues,
                    borderColor: '#14b8a6', // Teal line
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: false,
                    tension: 0.4
                },
                {
                    type: 'bar',
                    label: 'Ventas',
                    data: trendRevenues,
                    backgroundColor: '#c2410c', // Rust-orange bars
                    borderRadius: 4,
                    barPercentage: 0.6,
                    categoryPercentage: 0.8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    filter: function(tooltipItem) {
                        return tooltipItem.datasetIndex === 1; // Only show tooltip for the bar chart
                    },
                    callbacks: {
                        title: function(context) {
                            return context[0].label;
                        },
                        label: function(context) {
                            const index = context.dataIndex;
                            const revenue = trendRevenues[index];
                            const units = trendUnits[index];
                            const pct = maxRevenue > 0 ? Math.round((revenue / maxRevenue) * 100) : 0;
                            
                            return [
                                `Ventas: ${formatCurrency(revenue)}`,
                                `Unidades: ${units} uds`,
                                `Comparativo: ${pct}% del mejor mes`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' },
                    ticks: { color: textColor, font: { size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: textColor, font: { size: 10 }, maxRotation: 0 }
                }
            }
        }
    });

    // 2. Origin Breakdown
    const originRevenue = { 'Shopify': 0, 'Mercado Libre': 0, 'Ripley': 0, 'Sodimac': 0 };
    orders.forEach(o => {
        const source = String(o.source);
        if (source.includes('Shopify')) originRevenue['Shopify'] += o.totalPrice;
        else if (source.includes('Mercado Libre')) originRevenue['Mercado Libre'] += o.totalPrice;
        else if (source.includes('Ripley')) originRevenue['Ripley'] += o.totalPrice;
        else if (source.includes('Sodimac')) originRevenue['Sodimac'] += o.totalPrice;
    });

    const originLabels = Object.keys(originRevenue);
    const originValues = Object.values(originRevenue);
    const originColors = ['#96bf48', '#fb923c', '#8b5dbc', '#00875a']; // Shopify Green, Meli Yellow (now Orange-Peach), Ripley Purple, Sodimac Green

    if (originChart) originChart.destroy();
    originChart = new Chart(document.getElementById('origin-revenue-chart'), {
        type: 'pie',
        data: {
            labels: originLabels,
            datasets: [{
                data: originValues,
                backgroundColor: originColors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: textColor, font: { size: 10 }, usePointStyle: true }
                }
            }
        }
    });

    // 3. Top Products Donut
    const top5 = (data.topProducts || []).slice(0, 5);
    const donutLabels = top5.map(p => p.name);
    const donutValues = top5.map(p => p.revenue);
    const colors = ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5'];

    if (donutChart) donutChart.destroy();
    donutChart = new Chart(document.getElementById('top-products-donut'), {
        type: 'doughnut',
        data: {
            labels: donutLabels,
            datasets: [{
                data: donutValues,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        usePointStyle: true,
                        padding: 15,
                        font: { size: 10 }
                    }
                }
            }
        }
    });
}

function formatCurrency(val) {
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0
    }).format(val);
}

function renderBreakdown(containerId, channelData, total) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!total || total === 0) {
        container.innerHTML = '';
        return;
    }

    const channels = [
        { name: 'Shopify', key: 'shopify', class: 'shopify' },
        { name: 'Meli', key: 'meli', class: 'meli' },
        { name: 'Ripley', key: 'ripley', class: 'ripley' },
        { name: 'Sodimac', key: 'sodimac', class: 'sodimac' }
    ];

    container.innerHTML = channels.map(c => {
        const value = channelData[c.key] || 0;
        const percentage = ((value / total) * 100).toFixed(1);
        if (value === 0 || percentage === "0.0") return '';
        return `<div class="channel-tag ${c.class}">${c.name} <span>${percentage}%</span></div>`;
    }).join('');
}

async function downloadExcel() {
    console.log('Iniciando descarga Excel...');
    const source = document.getElementById('source-select').value;
    const startDate = document.getElementById('date-start').value;
    const endDate = document.getElementById('date-end').value;

    const url = new URL(`${API_BASE}/export-excel`, window.location.origin);
    if (source) url.searchParams.append('source', source);
    if (startDate) url.searchParams.append('startDate', startDate);
    if (endDate) url.searchParams.append('endDate', endDate);

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Error en servidor');
        const blob = await res.blob();
        const fileName = `ventas_unified_${new Date().toISOString().slice(0,10)}.xlsx`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (err) {
        console.error('Error en descarga:', err);
        alert('Error al generar el archivo Excel');
    }
}

function showExcelToast(fileName, filePath) {
    const existing = document.getElementById('excel-success-toast');
    if (existing) existing.remove();

    if (!document.getElementById('excel-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'excel-toast-styles';
        style.textContent = `
            .excel-toast {
                position: fixed;
                bottom: 2rem;
                right: 2rem;
                background: rgba(20, 20, 20, 0.95);
                border: 1px solid #f97316;
                box-shadow: 0 10px 40px rgba(249, 115, 22, 0.15);
                color: #ffffff;
                padding: 1.25rem 1.5rem;
                border-radius: 1rem;
                z-index: 99999;
                max-width: 420px;
                backdrop-filter: blur(10px);
                animation: toast-fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
            }
            .excel-toast-header {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                font-weight: 700;
                font-size: 1rem;
                color: #f97316;
            }
            .excel-toast-body {
                font-size: 0.875rem;
                color: #a1a1aa;
                line-height: 1.4;
            }
            .excel-toast-actions {
                display: flex;
                gap: 0.5rem;
                margin-top: 0.25rem;
            }
            .excel-toast-btn {
                background: #f97316;
                border: 1px solid #f97316;
                color: #ffffff;
                padding: 0.4rem 0.8rem;
                border-radius: 0.5rem;
                font-size: 0.75rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 0.35rem;
            }
            .excel-toast-btn:hover {
                background: #ea580c;
                border-color: #ea580c;
            }
            .excel-toast-btn.sec {
                background: transparent;
                border: 1px solid #27272a;
                color: #a1a1aa;
            }
            .excel-toast-btn.sec:hover {
                background: rgba(255,255,255,0.05);
                color: #ffffff;
            }
            @keyframes toast-fade-in {
                from { opacity: 0; transform: translateY(1rem) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes toast-fade-out {
                from { opacity: 1; transform: translateY(0) scale(1); }
                to { opacity: 0; transform: translateY(1rem) scale(0.95); }
            }
        `;
        document.head.appendChild(style);
    }

    const toast = document.createElement('div');
    toast.id = 'excel-success-toast';
    toast.className = 'excel-toast';
    
    toast.innerHTML = `
        <div class="excel-toast-header">
            <span style="font-size: 1.25rem;">📊</span>
            <span>Excel Generado Exitosamente</span>
        </div>
        <div class="excel-toast-body">
            El archivo se guardó directamente en tu carpeta de **Descargas**:<br>
            <code style="display:block; margin-top:0.4rem; padding:0.35rem 0.5rem; background:rgba(0,0,0,0.3); border-radius:0.25rem; font-family:monospace; font-size:0.75rem; word-break:break-all; color:#fb923c;">${fileName}</code>
        </div>
        <div class="excel-toast-actions">
            <button class="excel-toast-btn" id="toast-open-dir-btn">
                📂 Abrir en Carpeta
            </button>
            <button class="excel-toast-btn sec" id="toast-close-btn">
                Cerrar
            </button>
        </div>
    `;

    document.body.appendChild(toast);

    // Bind event handlers dynamically to avoid any backslash/character escaping syntax errors
    document.getElementById('toast-open-dir-btn').addEventListener('click', () => {
        openGeneratedFolder(filePath);
    });

    document.getElementById('toast-close-btn').addEventListener('click', () => {
        toast.remove();
    });
    
    setTimeout(() => {
        const t = document.getElementById('excel-success-toast');
        if (t) {
            t.style.animation = 'toast-fade-out 0.4s ease forwards';
            setTimeout(() => t.remove(), 400);
        }
    }, 12000);
}

window.openGeneratedFolder = async function(filePath) {
    try {
        await fetch(`${API_BASE}/open-file?path=${encodeURIComponent(filePath)}`);
    } catch (err) {
        console.error('Error al abrir archivo:', err);
    }
}

function updateBarrelAnalysis() {
    const type = document.getElementById('barrel-select').value;
    if (!window.currentDisplayRows) return;
    
    let units = 0;
    let revenue = 0;
    
    const termsMap = {
        'Mini': ['barril', 'mini'],
        'Pequeño Basik': ['barril', 'pequeño', 'basik'],
        'Mediano Basik': ['barril', 'mediano', 'basik'],
        'Grande Basik': ['barril', 'grande', 'basik'],
        'Pequeño Premium': ['barril', 'pequeño', 'premium'],
        'Mediano Premium': ['barril', 'mediano', 'premium'],
        'Grande Premium': ['barril', 'grande', 'premium']
    };
    
    // Palabras negativas para excluir accesorios (fundas, racks, ganchos, etc.)
    const negativeTerms = ['rack', 'funda', 'gancho', 'garfio', 'espina', 'kit', 'accesorio'];
    
    const requiredTerms = termsMap[type] || [];
    
    const barrelUnitsBreakdown = { shopify: 0, meli: 0, ripley: 0, sodimac: 0 };
    const barrelRevenueBreakdown = { shopify: 0, meli: 0, ripley: 0, sodimac: 0 };
    let totalGlobalUnits = 0;
 
    window.currentDisplayRows.forEach(row => {
        totalGlobalUnits += (row.itemQuantity || 0);
        
        const title = (row.itemTitle || '').toLowerCase();
        
        // Check negative terms first
        const hasNegative = negativeTerms.some(neg => title.includes(neg));
        if (hasNegative) return;
        
        const matches = requiredTerms.every(term => {
            if (term === 'pequeño') {
                return title.includes('pequeño') || title.includes('pequeno');
            }
            return title.includes(term);
        });
        
        if (matches) {
            const qty = (row.itemQuantity || 0);
            const rev = ((row.itemPrice || 0) * (row.itemQuantity || 0));
            
            units += qty;
            revenue += rev;

            const source = String(row.source).toLowerCase();
            let channelKey = 'shopify';
            if (source.includes('ripley')) channelKey = 'ripley';
            else if (source.includes('mercado libre')) channelKey = 'meli';
            else if (source.includes('sodimac')) channelKey = 'sodimac';

            barrelUnitsBreakdown[channelKey] += qty;
            barrelRevenueBreakdown[channelKey] += rev;
        }
    });
    
    document.getElementById('barrel-units').innerText = units;
    document.getElementById('barrel-revenue').innerText = formatCurrency(revenue);

    // Get total global metrics for reference
    const globalTotalRevenue = parseFloat(document.getElementById('total-revenue').innerText.replace(/[^0-9]/g, '')) || 1;

    renderBreakdown('barrel-units-breakdown', barrelUnitsBreakdown, totalGlobalUnits);
    renderBreakdown('barrel-revenue-breakdown', barrelRevenueBreakdown, globalTotalRevenue);
}

async function fetchInventory() {
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'flex';
    
    try {
        const res = await fetch(`${API_BASE}/inventory-channels`);
        const data = await res.json();
        
        if (data.success && data.inventory) {
            window.inventoryData = data.inventory;
            
            // Calcular Métricas
            let totalSkus = data.inventory.length;
            let shopifyStock = 0;
            let meliLocal = 0;
            let meliFull = 0;
            let ripleyLocal = 0;
            let ripleyFull = 0;
            let sodimacStock = 0;
            
            data.inventory.forEach(item => {
                shopifyStock += item.shopifyStock || 0;
                meliLocal += item.meliStock || 0;
                meliFull += item.meliFullStock || 0;
                ripleyLocal += item.ripleyStock || 0;
                ripleyFull += item.ripleyFullStock || 0;
                sodimacStock += item.sodimacStock || 0;
            });
            
            document.getElementById('inv-total-products').innerText = totalSkus;
            document.getElementById('inv-shopify-stock').innerText = shopifyStock;
            document.getElementById('inv-meli-stock').innerText = meliLocal + meliFull;
            document.getElementById('inv-ripley-stock').innerText = ripleyLocal + ripleyFull;
            document.getElementById('inv-sodimac-stock').innerText = sodimacStock;
            
            // Renderizar desgloses en las tarjetas de métricas
            const meliBreakdownEl = document.getElementById('inv-meli-breakdown');
            if (meliBreakdownEl) {
                meliBreakdownEl.innerHTML = `
                    <div class="channel-tag meli">Local <span>${meliLocal}</span></div>
                    <div class="channel-tag meli" style="background:rgba(255,230,0,0.08); border-color:rgba(255,230,0,0.15);">Full <span>${meliFull}</span></div>
                `;
            }
            const ripleyBreakdownEl = document.getElementById('inv-ripley-breakdown');
            if (ripleyBreakdownEl) {
                ripleyBreakdownEl.innerHTML = `
                    <div class="channel-tag ripley">Local <span>${ripleyLocal}</span></div>
                    <div class="channel-tag ripley" style="background:rgba(139,93,188,0.08); border-color:rgba(139,93,188,0.15);">Full <span>${ripleyFull}</span></div>
                `;
            }
            
            renderInventory(data.inventory);
        } else {
            alert('Error al sincronizar inventario');
        }
    } catch (err) {
        console.error('Fetch Inventory Error:', err);
        alert('Error de conexión con el servidor de inventario');
    } finally {
        if (loading) loading.style.display = 'none';
        lucide.createIcons();
    }
}

function renderInventory(items) {
    const container = document.getElementById('inventory-list');
    const recordCountEl = document.getElementById('inv-record-count');
    
    if (!container) return;
    
    if (recordCountEl) {
        recordCountEl.innerText = `Mostrando ${items.length} productos`;
    }
    
    if (items.length === 0) {
        container.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 3rem; color: var(--text-secondary);">No se encontraron productos.</td></tr>';
        return;
    }
    
    container.innerHTML = items.map(item => {
        const totalStock = item.totalStock || 0;
        
        // Highlight stock values
        const getStockCell = (stock, colorClass) => {
            if (stock > 0) {
                return `<span style="font-weight: 700; color: ${colorClass};">${stock}</span>`;
            }
            return `<span style="color: var(--text-secondary); opacity: 0.5;">0</span>`;
        };
        
        return `
            <tr>
                <td class="text-wrap">
                    <span style="font-weight: 600; font-size: 0.85rem; color: var(--text-primary);">${item.title}</span>
                </td>
                <td class="nowrap">
                    <span class="sku-tag">${item.sku || 'N/A'}</span>
                </td>
                <td class="nowrap">
                    <span class="sku-tag" style="background: rgba(255,255,255,0.03); color: var(--text-secondary); border: 1px solid var(--border);">${item.ean || 'N/A'}</span>
                </td>
                <td style="text-align: center;">${getStockCell(item.shopifyStock, 'var(--stock-shopify)')}</td>
                <td style="text-align: center;">${getStockCell(item.meliStock, 'var(--stock-meli)')}</td>
                <td style="text-align: center; background: rgba(255, 230, 0, 0.015);">${getStockCell(item.meliFullStock, 'var(--stock-meli-full)')}</td>
                <td style="text-align: center;">${getStockCell(item.ripleyStock, 'var(--stock-ripley)')}</td>
                <td style="text-align: center; background: rgba(249, 115, 22, 0.015);">${getStockCell(item.ripleyFullStock, 'var(--stock-ripley-full)')}</td>
                <td style="text-align: center;">${getStockCell(item.sodimacStock, 'var(--stock-sodimac)')}</td>
                <td style="text-align: center; font-weight: 800; font-size: 0.9rem; background: rgba(255,255,255,0.02);">${totalStock}</td>
            </tr>
        `;
    }).join('');
}

function formatMeliDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const monthsEs = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const day = date.getDate();
    const month = monthsEs[date.getMonth()];
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${hours}:${minutes}`;
}

function renderMeliShipments(shipments) {
    const grid = document.getElementById('meli-shipments-grid');
    const countEl = document.getElementById('meli-shipments-count');
    if (!grid) return;

    const activeMeli = shipments || [];

    // Sort newest first
    activeMeli.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (countEl) {
        countEl.innerText = `${activeMeli.length} envíos`;
    }

    if (activeMeli.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-secondary); background: rgba(255,255,255,0.01); border-radius: 1rem; border: 1px dashed var(--border);">
                <i data-lucide="check-circle" style="width: 32px; height: 32px; color: #10b981; margin-bottom: 0.75rem;"></i>
                <div style="font-weight: 600; font-size: 0.95rem; color: var(--text-primary);">¡Todo despachado!</div>
                <div style="font-size: 0.8rem; margin-top: 0.25rem;">No hay envíos de Mercado Libre en proceso para el rango seleccionado.</div>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    grid.innerHTML = activeMeli.map(o => {
        const dateFormatted = formatMeliDate(o.createdAt);
        const productsHtml = o.items.map(item => 
            `<strong>${item.title}</strong> (SKU: ${item.sku}) x${item.quantity}`
        ).join('<br>');

        const totalFormatted = formatCurrency(o.totalPrice) + ' CLP';
        
        // Check printed status
        const isPrinted = o.shipping?.substatus === 'printed';
        const labelStatusClass = isPrinted ? 'printed' : 'pending';
        const labelStatusText = isPrinted ? 'Etiqueta impresa' : 'Pendiente de impresión';
        const labelIcon = isPrinted ? 'check-circle-2' : 'clock';

        return `
            <div class="shipment-card">
                <div class="shipment-header">
                    <span>${o.id} — ${dateFormatted}</span>
                </div>
                <div class="shipment-detail">
                    <div>Cliente: <strong>${o.customer}</strong></div>
                    <div style="margin-top: 0.25rem; line-height: 1.4;">Producto: ${productsHtml}</div>
                    <div style="margin-top: 0.25rem;">Total: <strong>${totalFormatted}</strong></div>
                </div>
                <div class="shipment-footer">
                    <span class="label-status ${labelStatusClass}">
                        <i data-lucide="${labelIcon}" style="width: 12px; height: 12px;"></i> ${labelStatusText}
                    </span>
                    <button class="btn-reprint" onclick="reprintMeliLabel('${o.shipping?.id}')">
                        <i data-lucide="printer" style="width: 12px; height: 12px;"></i> ${isPrinted ? 'Reimprimir etiqueta' : 'Imprimir etiqueta'}
                    </button>
                </div>
            </div>
        `;
    }).join('');

    lucide.createIcons();
}

function renderMeliShipmentStatus(data) {
    const todayList = data.today || [];
    const prepList = data.preparation || [];
    const deliveredList = data.delivered || [];

    // Update badges
    const todayBadge = document.getElementById('meli-status-today-badge');
    const prepBadge = document.getElementById('meli-status-prep-badge');
    const deliveredBadge = document.getElementById('meli-status-delivered-badge');
    const updateTimeEl = document.getElementById('meli-status-update-time');

    if (todayBadge) todayBadge.innerText = todayList.length;
    if (prepBadge) prepBadge.innerText = prepList.length;
    if (deliveredBadge) deliveredBadge.innerText = deliveredList.length;

    const totalDistinct = new Set([
        ...todayList.map(s => s.id),
        ...prepList.map(s => s.id),
        ...deliveredList.map(s => s.id)
    ]).size;

    if (updateTimeEl) {
        updateTimeEl.innerText = `${totalDistinct} envíos en total`;
    }

    const renderColumn = (list, containerId, emptyMsg) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (list.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-secondary); font-size: 0.8rem; background: rgba(255,255,255,0.005); border-radius: 0.75rem; border: 1px dashed var(--border);">
                    ${emptyMsg}
                </div>
            `;
            return;
        }

        container.innerHTML = list.map(s => {
            const dateFormatted = formatMeliDate(s.createdAt);
            const productsHtml = s.items.map(item => 
                `<strong>${item.title}</strong> (SKU: ${item.sku}) x${item.quantity}`
            ).join('<br>');
            
            const totalFormatted = formatCurrency(s.totalPrice) + ' CLP';

            // Determine status label and class
            const status = s.shipping?.status || 'unknown';
            let labelText = 'Desconocido';
            let labelClass = 'pending';
            let labelIcon = 'clock';

            if (status === 'delivered') {
                labelText = 'Entregado';
                labelClass = 'delivered';
                labelIcon = 'check-circle';
            } else if (status === 'shipped') {
                labelText = 'En camino';
                labelClass = 'shipped';
                labelIcon = 'truck';
            } else if (status === 'ready_to_ship') {
                labelText = 'Listo para despacho';
                labelClass = 'ready_to_ship';
                labelIcon = 'package';
            } else if (status === 'handling') {
                labelText = 'En preparación';
                labelClass = 'handling';
                labelIcon = 'cpu';
            } else if (status === 'pending') {
                labelText = 'Pendiente';
                labelClass = 'pending';
                labelIcon = 'clock';
            }

            // Flex / Full indicator
            const isFull = s.shipping?.logisticType === 'fulfillment';
            const isFlex = s.shipping?.logisticType === 'self_service';
            let logisticsBadge = '';
            if (isFull) {
                logisticsBadge = '<span class="badge" style="background: rgba(251, 146, 60, 0.15); color: #fb923c; font-size: 0.65rem; border: 1px solid rgba(251, 146, 60, 0.3);">FULL</span>';
            } else if (isFlex) {
                logisticsBadge = '<span class="badge" style="background: rgba(16, 185, 129, 0.1); color: #10b981; font-size: 0.65rem; border: 1px solid rgba(16, 185, 129, 0.2);">FLEX</span>';
            }

            return `
                <div class="meli-status-card">
                    <div class="meli-status-card-header">
                        <span>#${s.orderId}</span>
                        <span style="font-size: 0.75rem; color: var(--text-secondary);">${dateFormatted}</span>
                    </div>
                    <div class="meli-status-card-client">
                        Cliente: <strong>${s.customer}</strong>
                    </div>
                    <div class="meli-status-card-products">
                        ${productsHtml}
                    </div>
                    <div class="meli-status-card-footer">
                        <span class="label-status ${labelClass}" style="font-size: 0.7rem; padding: 0.15rem 0.5rem;">
                            <i data-lucide="${labelIcon}" style="width: 10px; height: 10px;"></i> ${labelText}
                        </span>
                        <div style="display: flex; align-items: center; gap: 0.35rem;">
                            ${logisticsBadge}
                            <span class="meli-status-card-price">${totalFormatted}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };

    renderColumn(todayList, 'meli-status-today-list', 'No hay envíos registrados hoy.');
    renderColumn(prepList, 'meli-status-prep-list', 'No hay envíos en preparación.');
    renderColumn(deliveredList, 'meli-status-delivered-list', 'No hay envíos entregados recientemente.');

    lucide.createIcons();
}

function reprintMeliLabel(shippingId) {
    if (!shippingId || shippingId === 'null') {
        alert('ID de envío no válido.');
        return;
    }
    const labelUrl = `${API_BASE}/meli/shipments/${shippingId}/label`;
    window.open(labelUrl, '_blank');
}

async function fetchInvasInventory() {
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'flex';
    
    const countEl = document.getElementById('invas-record-count');
    const listEl = document.getElementById('invas-list');
    
    if (countEl) countEl.innerText = 'Cargando inventario...';
    if (listEl) {
        listEl.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 3rem; color: var(--text-secondary);">Cargando inventario...</td></tr>';
    }

    try {
        const res = await fetch(`${API_BASE}/inventory`);
        if (!res.ok) {
            throw new Error(`Server returned status ${res.status}`);
        }
        const data = await res.json();
        
        if (Array.isArray(data)) {
            // Keep original order from source CSV/Google Sheet file
            
            window.invasData = data;
            
            if (data.length === 0) {
                if (countEl) countEl.innerText = 'Mostrando 0 productos';
                if (listEl) {
                    listEl.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 3rem; color: var(--text-secondary);">No hay datos de inventario disponibles</td></tr>';
                }
            } else {
                renderInvasInventory(data);
            }
        } else {
            throw new Error('Data is not an array');
        }
    } catch (err) {
        console.error('Fetch INVAS Inventory Error:', err);
        if (countEl) countEl.innerText = 'Error';
        if (listEl) {
            listEl.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 3rem; color: #f87171; font-weight: 600;">No se pudo cargar el inventario, intenta de nuevo</td></tr>';
        }
    } finally {
        if (loading) loading.style.display = 'none';
        lucide.createIcons();
    }
}

function renderInvasInventory(items) {
    const container = document.getElementById('invas-list');
    const recordCountEl = document.getElementById('invas-record-count');
    
    if (!container) return;
    
    if (recordCountEl) {
        recordCountEl.innerText = `Mostrando ${items.length} productos`;
    }
    
    if (items.length === 0) {
        container.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 3rem; color: var(--text-secondary);">No se encontraron productos.</td></tr>';
        return;
    }
    
    container.innerHTML = items.map(item => {
        const disponible = item.disponible !== undefined ? item.disponible : 0;
        const actualizado = item.actualizado || 'N/A';
        const codigo = item.codigo || 'N/A';
        const nombre = item.nombre || 'N/A';
        
        let rowClass = '';
        if (disponible === 0) {
            rowClass = 'class="row-alert-red"';
        } else if (disponible > 0 && disponible < 5) {
            rowClass = 'class="row-alert-yellow"';
        }
        
        return `
            <tr ${rowClass}>
                <td class="nowrap">
                    <span class="sku-tag" style="background: rgba(255,255,255,0.03); color: var(--text-secondary); border: 1px solid var(--border);">${codigo}</span>
                </td>
                <td class="text-wrap" style="font-weight: 600; font-size: 0.85rem;">
                    ${nombre}
                </td>
                <td style="text-align: center; font-weight: 700;">
                    ${disponible}
                </td>
                <td style="text-align: center; font-weight: 500; opacity: 0.8;">
                    ${actualizado}
                </td>
            </tr>
        `;
    }).join('');
}

// ==========================================
// FUNCIONES Y MÓDULOS DE RECLAMOS ML (POSVENTA)
// ==========================================
window.activeClaimsTags = new Set();
window.claimsData = [];
window.claimsSessionMessages = new Map();
window.claimsStatusOverrides = new Map();

async function fetchClaims() {
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'flex';
    
    try {
        const res = await fetch(`${API_BASE}/meli-claims`);
        const data = await res.json();
        
        if (data && data.success) {
            window.claimsData = data.claims;
            filterClaims();
        } else {
            console.error('Error in fetchClaims response:', data);
        }
    } catch (err) {
        console.error('Fetch Claims Error:', err);
    } finally {
        if (loading) loading.style.display = 'none';
        lucide.createIcons();
    }
}

function renderClaims(claims) {
    const container = document.getElementById('claims-list');
    const recordCountEl = document.getElementById('claims-record-count');
    const badgeCountEl = document.getElementById('claims-badge-count');
    const metricsToAttendCountEl = document.getElementById('metrics-to-attend-count');
    
    if (!container) return;
    
    // Count active/opened claims
    const activeClaims = claims.filter(c => {
        const claimId = c.id;
        const override = window.claimsStatusOverrides.get(claimId);
        return override !== 'resolved' && c.status === 'opened';
    });

    if (recordCountEl) {
        recordCountEl.innerText = `${claims.length} venta${claims.length === 1 ? '' : 's'}`;
    }
    if (badgeCountEl) {
        badgeCountEl.innerText = activeClaims.length;
    }
    if (metricsToAttendCountEl) {
        metricsToAttendCountEl.innerText = activeClaims.length;
    }

    if (claims.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 4rem; color: var(--text-secondary); background: var(--card-bg); border-radius: 1.5rem; border: 1px dashed var(--border);">
                <i data-lucide="check-circle" style="width: 48px; height: 48px; color: #10b981; margin-bottom: 1rem;"></i>
                <div style="font-weight: 700; font-size: 1.1rem; color: var(--text-primary);">¡Sin reclamos pendientes!</div>
                <p style="font-size: 0.85rem; margin-top: 0.5rem; max-width: 400px; margin-left: auto; margin-right: auto;">
                    No tienes reclamos abiertos que coincidan con la búsqueda o filtros aplicados. ¡Excelente servicio al cliente!
                </p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    const svgMiniBasik = `
        <svg width="48" height="60" viewBox="0 0 48 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="silver-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#8a8d90" />
                    <stop offset="50%" stop-color="#d5d7db" />
                    <stop offset="100%" stop-color="#707275" />
                </linearGradient>
            </defs>
            <rect x="12" y="18" width="24" height="34" rx="2" fill="url(#silver-grad)" stroke="#4b4d4f" stroke-width="1.5" />
            <path d="M12 18 C12 10, 36 10, 36 18 Z" fill="url(#silver-grad)" stroke="#4b4d4f" stroke-width="1.5" />
            <rect x="20" y="6" width="8" height="4" rx="1" fill="#a0522d" stroke="#5c2e16" stroke-width="1" />
            <line x1="22" y1="10" x2="22" y2="12" stroke="#4b4d4f" stroke-width="1.5" />
            <line x1="26" y1="10" x2="26" y2="12" stroke="#4b4d4f" stroke-width="1.5" />
            <circle cx="24" cy="14" r="2.5" fill="#f4f4f5" stroke="#4b4d4f" stroke-width="1" />
            <line x1="24" y1="14" x2="25.5" y2="12.5" stroke="#ef4444" stroke-width="0.75" />
            <path d="M14 52 L10 58" stroke="#374151" stroke-width="2" stroke-linecap="round" />
            <path d="M34 52 L38 58" stroke="#374151" stroke-width="2" stroke-linecap="round" />
            <path d="M24 52 L24 59" stroke="#374151" stroke-width="2" stroke-linecap="round" />
            <path d="M12 28 H8 V32 H12" stroke="#4b4d4f" stroke-width="1.5" fill="none" />
            <path d="M36 28 H40 V32 H36" stroke="#4b4d4f" stroke-width="1.5" fill="none" />
            <text x="24" y="36" fill="#374151" font-size="5" font-weight="bold" text-anchor="middle" opacity="0.3" font-family="sans-serif">INGRILL</text>
        </svg>
    `;

    const svgBbqMovil = `
        <svg width="48" height="60" viewBox="0 0 48 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="dark-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#1f2937" />
                    <stop offset="50%" stop-color="#4b5563" />
                    <stop offset="100%" stop-color="#111827" />
                </linearGradient>
            </defs>
            <rect x="10" y="16" width="28" height="34" rx="3" fill="url(#dark-grad)" stroke="#0f172a" stroke-width="1.5" />
            <path d="M10 16 C10 8, 38 8, 38 16 Z" fill="url(#dark-grad)" stroke="#0f172a" stroke-width="1.5" />
            <path d="M18 10 H30" stroke="#f97316" stroke-width="2" stroke-linecap="round" />
            <line x1="20" y1="10" x2="20" y2="12" stroke="#0f172a" stroke-width="1.5" />
            <line x1="28" y1="10" x2="28" y2="12" stroke="#0f172a" stroke-width="1.5" />
            <line x1="14" y1="50" x2="10" y2="58" stroke="#374151" stroke-width="2" />
            <line x1="34" y1="50" x2="38" y2="58" stroke="#374151" stroke-width="2" />
            <circle cx="10" cy="58" r="3" fill="#1f2937" stroke="#111827" stroke-width="1" />
            <circle cx="10" cy="58" r="1" fill="#9ca3af" />
            <circle cx="38" cy="58" r="3" fill="#1f2937" stroke="#111827" stroke-width="1" />
            <circle cx="38" cy="58" r="1" fill="#9ca3af" />
            <line x1="12" y1="54" x2="36" y2="54" stroke="#4b5563" stroke-width="1.5" />
            <path d="M38 24 H44 V26 H38" stroke="#4b5563" stroke-width="1.5" fill="none" />
            <rect x="42" y="22" width="4" height="8" rx="0.5" fill="#d97706" opacity="0.8" />
        </svg>
    `;

    const svgDefaultItem = `
        <svg width="48" height="60" viewBox="0 0 48 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="12" y="20" width="24" height="24" rx="2" fill="#27272a" stroke="#4b4d4f" stroke-width="1.5" />
            <path d="M12 20 L24 10 L36 20 Z" fill="#3f3f46" stroke="#4b4d4f" stroke-width="1.5" />
            <circle cx="24" cy="32" r="4" fill="#a1a1aa" />
        </svg>
    `;

    container.innerHTML = claims.map(c => {
        const claimId = c.id;
        const override = window.claimsStatusOverrides.get(claimId);
        
        let statusText = c.actionText;
        let subText = c.subtext;
        let showRepAlert = c.highlight;
        let isResolved = false;
        
        if (override === 'resolved') {
            statusText = "Reclamo cerrado y resuelto";
            subText = "El caso ha sido solucionado. No afecta tu reputación.";
            showRepAlert = null;
            isResolved = true;
        }

        // Determinar imagen del producto
        let pImgSvg = svgDefaultItem;
        const titleLower = c.productTitle.toLowerCase();
        if (titleLower.includes('mini')) {
            pImgSvg = svgMiniBasik;
        } else if (titleLower.includes('bbq') || titleLower.includes('20 personas') || titleLower.includes('asador')) {
            pImgSvg = svgBbqMovil;
        }

        // Configurar badges
        const badgesHtml = (c.badges || []).map(b => {
            if (b === 'FLEX') return `<span class="badge badge-flex">FLEX</span>`;
            return `<span class="badge badge-meli">ML</span>`;
        }).join('');

        // Configurar mensaje de chat preview
        // Check if there are session messages
        const sessionMsgs = window.claimsSessionMessages.get(claimId) || [];
        let previewSender = c.lastMessage.sender;
        let previewText = c.lastMessage.text;
        
        if (sessionMsgs.length > 0) {
            const lastSessionMsg = sessionMsgs[sessionMsgs.length - 1];
            previewSender = lastSessionMsg.sender;
            previewText = lastSessionMsg.text;
        }

        // Avatar inicial bubble
        let avatarInitials = "ML";
        if (previewSender !== "Mercado Libre" && previewSender !== "Sistema" && previewSender !== "Tú") {
            const parts = previewSender.split(' ');
            avatarInitials = parts.map(p => p.charAt(0)).slice(0, 2).join('').toUpperCase();
        } else if (previewSender === "Tú") {
            avatarInitials = "YO";
        }

        const avatarClass = (previewSender === "Mercado Libre" || previewSender === "Sistema") ? "mediator" : "";

        // Reason Icon
        const isDamaged = c.reasonId === 'damaged_product';
        const reasonIconClass = isDamaged ? "" : "incomplete";

        return `
            <div class="claim-card" id="claim-card-${claimId}">
                <!-- Left Product Column -->
                <div class="claim-product-col">
                    <div class="claim-product-img">${pImgSvg}</div>
                    <div class="claim-product-info">
                        <span class="claim-order-num">#${c.orderId}</span>
                        <h4 class="claim-product-title">${c.productTitle}</h4>
                        <span class="claim-product-price">
                            ${c.quantity} unidad${c.quantity === 1 ? '' : 's'} &bull; <strong>${formatCurrency(c.price)}</strong>
                        </span>
                        <div class="claim-badge-container">${badgesHtml}</div>
                    </div>
                </div>

                <!-- Middle Status and Message Column -->
                <div class="claim-status-col">
                    <div class="claim-reason-header">
                        <span class="claim-reason-icon ${reasonIconClass}">
                            <i data-lucide="${isDamaged ? 'alert-triangle' : 'help-circle'}" style="width: 12px; height: 12px;"></i>
                        </span>
                        <span>${c.reasonText}</span>
                    </div>
                    <div class="claim-action-title">${statusText}</div>
                    <div class="claim-action-subtext">${subText}</div>
                    
                    <div class="claim-message-preview" onclick="openAttendClaimModal('${claimId}')">
                        <div class="claim-message-avatar ${avatarClass}">${avatarInitials}</div>
                        <div class="claim-message-text">
                            <strong>${previewSender}:</strong> ${previewText}
                        </div>
                    </div>
                </div>

                <!-- Right Action Column -->
                <div class="claim-action-col">
                    <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                        <div class="claim-reputation-alert">
                            ${showRepAlert ? `<i data-lucide="shield-alert" style="width: 14px; height: 14px;"></i> ${showRepAlert}` : ''}
                        </div>
                        <button class="claim-menu-btn" onclick="alert('Acciones de administración del reclamo')">
                            <i data-lucide="more-vertical" style="width: 16px; height: 16px;"></i>
                        </button>
                    </div>
                    
                    ${isResolved ? `
                        <button class="btn-attend-claim" style="background:#27272a; color:var(--text-secondary); cursor:default;" disabled>
                            Cerrado
                        </button>
                    ` : `
                        <button class="btn-attend-claim" onclick="openAttendClaimModal('${claimId}')">
                            Atender reclamo
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');

    lucide.createIcons();
}

function filterClaims() {
    const query = document.getElementById('claims-search')?.value.toLowerCase().trim() || "";
    
    let filtered = window.claimsData;
    
    // Apply search query
    if (query) {
        filtered = filtered.filter(c => 
            c.orderId.includes(query) ||
            c.productTitle.toLowerCase().includes(query) ||
            c.reasonText.toLowerCase().includes(query)
        );
    }
    
    // Apply tags
    if (window.activeClaimsTags.size > 0) {
        filtered = filtered.filter(c => {
            let matches = false;
            if (window.activeClaimsTags.has('reputation') && c.highlight) matches = true;
            if (window.activeClaimsTags.has('damaged') && c.reasonId === 'damaged_product') matches = true;
            if (window.activeClaimsTags.has('incomplete') && c.reasonId === 'incomplete_product') matches = true;
            if (window.activeClaimsTags.has('bot') && c.lastMessage && c.lastMessage.role === 'mediator') matches = true;
            return matches;
        });
    }
    
    renderClaims(filtered);
}

function toggleClaimsTag(tag) {
    const btn = document.getElementById(`tag-${tag}`);
    if (!btn) return;
    
    if (window.activeClaimsTags.has(tag)) {
        window.activeClaimsTags.delete(tag);
        btn.classList.remove('active');
    } else {
        window.activeClaimsTags.add(tag);
        btn.classList.add('active');
    }
    
    filterClaims();
}

function clearClaimsFilter() {
    const searchInput = document.getElementById('claims-search');
    if (searchInput) searchInput.value = "";
    
    // Remove active tag styling
    window.activeClaimsTags.clear();
    ['reputation', 'incomplete', 'damaged', 'bot'].forEach(tag => {
        document.getElementById(`tag-${tag}`)?.classList.remove('active');
    });
    
    // Hide filter badge
    const badge = document.getElementById('filter-badge-to-attend');
    if (badge) badge.style.display = "none";
    
    filterClaims();
}

// Modal handling
window.currentModalClaimId = null;

function openAttendClaimModal(claimId) {
    const claim = window.claimsData.find(c => c.id.toString() === claimId.toString());
    if (!claim) return;
    
    window.currentModalClaimId = claimId;
    
    // Populate header
    document.getElementById('modal-claim-title').innerHTML = `
        <i data-lucide="alert-circle" style="color: #ef4444; width:20px; height:20px;"></i> Atender Reclamo #${claimId}
    `;
    
    // Populate product details
    const titleEl = document.getElementById('modal-product-title');
    const orderIdEl = document.getElementById('modal-order-id');
    const priceEl = document.getElementById('modal-product-price');
    const buyerEl = document.getElementById('modal-buyer-name');
    const imgContainer = document.getElementById('modal-product-img-container');
    
    if (titleEl) titleEl.innerText = claim.productTitle;
    if (orderIdEl) orderIdEl.innerText = `Orden: #${claim.orderId}`;
    if (priceEl) priceEl.innerText = formatCurrency(claim.price);
    if (buyerEl) {
        buyerEl.innerText = `Comprador: ${claim.buyerName || 'Usuario ML'}`;
    }
    
    // Set SVG image
    const svgMiniBasik = `
        <svg width="48" height="48" viewBox="0 0 48 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="12" y="18" width="24" height="34" rx="2" fill="#d5d7db" stroke="#4b4d4f" stroke-width="1.5" />
            <path d="M12 18 C12 10, 36 10, 36 18 Z" fill="#d5d7db" stroke="#4b4d4f" stroke-width="1.5" />
            <circle cx="24" cy="14" r="2.5" fill="#f4f4f5" stroke="#4b4d4f" stroke-width="1" />
        </svg>
    `;
    const svgBbqMovil = `
        <svg width="48" height="48" viewBox="0 0 48 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="16" width="28" height="34" rx="3" fill="#4b5563" stroke="#0f172a" stroke-width="1.5" />
            <path d="M10 16 C10 8, 38 8, 38 16 Z" fill="#4b5563" stroke="#0f172a" stroke-width="1.5" />
        </svg>
    `;
    
    if (imgContainer) {
        imgContainer.innerHTML = claim.productTitle.toLowerCase().includes('mini') ? svgMiniBasik : svgBbqMovil;
    }
    
    // Load and render chat messages
    renderModalChat(claim);
    
    // Display Modal
    const modal = document.getElementById('attend-claim-modal');
    if (modal) modal.style.display = "flex";
    
    lucide.createIcons();
    
    // Scroll chat to bottom
    setTimeout(() => {
        const chatMessages = document.getElementById('modal-chat-messages');
        if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 50);
}

function renderModalChat(claim) {
    const chatContainer = document.getElementById('modal-chat-messages');
    if (!chatContainer) return;
    
    const claimId = claim.id;
    let msgs = claim.messages || [];
    
    // Fallback if no messages are present
    if (msgs.length === 0 && claim.lastMessage) {
        msgs = [{
            sender: claim.lastMessage.sender,
            role: claim.lastMessage.sender === 'Comprador' ? 'buyer' : (claim.lastMessage.sender === 'Tú' ? 'seller' : 'mediator'),
            text: claim.lastMessage.text,
            time: 'Hace un momento'
        }];
    }
    
    // Get session messages for this claim
    const sessionMsgs = window.claimsSessionMessages.get(claimId) || [];
    const allMsgs = [...msgs, ...sessionMsgs];
    
    chatContainer.innerHTML = allMsgs.map(m => {
        let bubbleClass = "buyer";
        if (m.role === "mediator") bubbleClass = "mediator";
        else if (m.role === "seller") bubbleClass = "seller";
        
        return `
            <div class="chat-bubble ${bubbleClass}">
                <div style="font-weight: 700; font-size: 0.75rem; margin-bottom: 0.15rem;">${m.sender}</div>
                <div>${m.text}</div>
                <span class="chat-bubble-meta">${m.time}</span>
            </div>
        `;
    }).join('');
}

function closeAttendClaimModal() {
    const modal = document.getElementById('attend-claim-modal');
    if (modal) modal.style.display = "none";
    window.currentModalClaimId = null;
}

async function sendModalChatMessage() {
    const input = document.getElementById('modal-chat-input-text');
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();
    input.value = "";
    
    const claimId = window.currentModalClaimId;
    if (!claimId) return;

    if (!window.claimsSessionMessages.has(claimId)) {
        window.claimsSessionMessages.set(claimId, []);
    }
    window.claimsSessionMessages.get(claimId).push({
        sender: "Tú",
        role: "seller",
        text: text,
        time: "Ahora mismo"
    });

    const claim = window.claimsData.find(c => c.id.toString() === claimId.toString());
    if (claim) {
        renderModalChat(claim);
        filterClaims();
        
        // Scroll chat to bottom
        const chatMessages = document.getElementById('modal-chat-messages');
        if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
            await fetch(`${API_BASE}/meli-claims/${claimId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });
        } catch (err) {
            console.error('Error posting claim message to backend:', err);
        }
    }
}

async function resolveClaimAction(action) {
    const claimId = window.currentModalClaimId;
    if (!claimId) return;
    
    let actionWord = "reembolsar";
    if (action === 'return') actionWord = "aceptar devolución";
    else if (action === 'support') actionWord = "escalar el caso";
    
    if (!confirm(`¿Estás seguro que deseas ${actionWord} para este reclamo?`)) return;

    window.claimsStatusOverrides.set(claimId, 'resolved');
    closeAttendClaimModal();
    filterClaims();

    try {
        await fetch(`${API_BASE}/meli-claims/${claimId}/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action })
        });
    } catch (err) {
        console.error('Error resolving claim in backend:', err);
    }
}

// Global functions for inline handlers
window.closeAttendClaimModal = closeAttendClaimModal;
window.sendModalChatMessage = sendModalChatMessage;
window.resolveClaimAction = resolveClaimAction;
window.toggleClaimsTag = toggleClaimsTag;
window.clearClaimsFilter = clearClaimsFilter;
window.fetchClaims = fetchClaims;


