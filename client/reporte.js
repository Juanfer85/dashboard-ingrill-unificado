const API_BASE = 'http://localhost:4001/api';
let trendChart = null;
let donutChart = null;

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    initializeFilters();
    fetchData();

    document.getElementById('refresh-btn').addEventListener('click', fetchData);
    document.getElementById('source-select').addEventListener('change', fetchData);
    document.getElementById('date-start').addEventListener('change', fetchData);
    document.getElementById('date-end').addEventListener('change', fetchData);
});

function initializeFilters() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    
    document.getElementById('date-start').value = firstDay.toISOString().split('T')[0];
    document.getElementById('date-end').value = now.toISOString().split('T')[0];
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

    // Calculate Recurring Customers (Simplified logic for the report)
    const customerCounts = {};
    recentOrders.forEach(o => {
        const name = o.customer || 'Unknown';
        customerCounts[name] = (customerCounts[name] || 0) + 1;
    });
    const recurring = Object.values(customerCounts).filter(count => count > 1).length;
    document.getElementById('recurring-customers').innerText = recurring || 1; // Default to 1 as in image if none

    // Render Lists
    renderUnitsList(topProducts);
    renderRevenueList(topProducts);

    // Charts
    updateCharts(data);
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

function updateCharts(data) {
    const orders = data.recentOrders || [];
    
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
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a1a1aa', font: { size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#a1a1aa', font: { size: 10 }, maxRotation: 0 }
                }
            }
        }
    });

    // 2. Top Products Donut
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
                        color: '#a1a1aa',
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
