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
    document.getElementById('download-csv-btn').addEventListener('click', downloadExcel);
    document.getElementById('barrel-select').addEventListener('change', updateBarrelAnalysis);
});

function initializeFilters() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Flatpickr setup
    const fpConfig = {
        locale: 'es',
        dateFormat: 'Y-m-d',
        onChange: fetchData,
        disableMobile: "true"
    };

    flatpickr("#date-start", { ...fpConfig, defaultDate: firstDay });
    flatpickr("#date-end", { ...fpConfig, defaultDate: now });
}

async function fetchData() {
    const loading = document.getElementById('loading');
    const source = document.getElementById('source-select').value;
    const startDate = document.getElementById('date-start').value;
    const endDate = document.getElementById('date-end').value;

    loading.style.display = 'flex';

    try {
        const url = new URL(`${API_BASE}/dashboard`);
        if (source) url.searchParams.append('source', source);
        if (startDate) url.searchParams.append('startDate', startDate);
        if (endDate) url.searchParams.append('endDate', endDate);

        const res = await fetch(url);
        const data = await res.json();
        console.log('API Response:', data);

        updateDashboard(data);
    } catch (err) {
        console.error('Fetch Error:', err);
        alert('Error al obtener datos unificados');
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
    document.getElementById('total-revenue').innerText = formatCurrency(metrics.totalRevenue || 0);
    document.getElementById('total-orders').innerText = metrics.totalOrders || 0;
    document.getElementById('avg-order-value').innerText = formatCurrency(metrics.aov || 0);

    // Render Lists
    renderUnitsList(topProducts);
    renderRevenueList(topProducts);
    renderRecentOrders(recentOrders);

    // Global Breakdowns
    const globalRevenueBreakdown = { shopify: 0, meli: 0, ripley: 0 };
    const globalOrdersBreakdown = { shopify: 0, meli: 0, ripley: 0 };
    
    recentOrders.forEach(o => {
        const source = String(o.source).toLowerCase();
        let key = 'shopify';
        if (source.includes('ripley')) key = 'ripley';
        else if (source.includes('mercado libre')) key = 'meli';
        
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
    const originRevenue = { 'Shopify': 0, 'Mercado Libre': 0, 'Ripley': 0 };
    orders.forEach(o => {
        const source = String(o.source);
        if (source.includes('Shopify')) originRevenue['Shopify'] += o.totalPrice;
        else if (source.includes('Mercado Libre')) originRevenue['Mercado Libre'] += o.totalPrice;
        else if (source.includes('Ripley')) originRevenue['Ripley'] += o.totalPrice;
    });

    const originLabels = Object.keys(originRevenue);
    const originValues = Object.values(originRevenue);
    const originColors = ['#96bf48', '#ffe600', '#f97316']; // Shopify Green, Meli Yellow, Ripley Orange

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
        { name: 'Ripley', key: 'ripley', class: 'ripley' }
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
    
    const barrelUnitsBreakdown = { shopify: 0, meli: 0, ripley: 0 };
    const barrelRevenueBreakdown = { shopify: 0, meli: 0, ripley: 0 };
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
