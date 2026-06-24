const termsMap = {
    'Mini': ['barril', 'mini'],
    'Pequeño Basik': ['barril', 'pequeño', 'basik'],
    'Mediano Basik': ['barril', 'mediano', 'basik'],
    'Grande Basik': ['barril', 'grande', 'basik'],
    'Pequeño Premium': ['barril', 'pequeño', 'premium'],
    'Mediano Premium': ['barril', 'mediano', 'premium'],
    'Grande Premium': ['barril', 'grande', 'premium']
};

const negativeTerms = ['rack', 'funda', 'gancho', 'garfio', 'espina', 'kit', 'accesorio'];

function getGeneralSource(sourceName) {
    const s = String(sourceName).toLowerCase();
    if (s.includes('ripley')) return 'Ripley';
    if (s.includes('mercado libre')) return 'Mercado Libre';
    if (s.includes('shopify')) return 'Shopify';
    return 'Otro';
}

async function run() {
    try {
        console.log("Fetching data from API...");
        const res = await fetch('http://localhost:4001/api/dashboard?startDate=2026-03-01&endDate=2026-04-30');
        const data = await res.json();
        
        let report = {};
        for (const key in termsMap) {
            report[key] = { 
                totalUnits: 0, 
                totalRevenue: 0,
                channels: {
                    'Shopify': { units: 0, revenue: 0 },
                    'Mercado Libre': { units: 0, revenue: 0 },
                    'Ripley': { units: 0, revenue: 0 },
                    'Otro': { units: 0, revenue: 0 }
                }
            };
        }

        const orders = data.recentOrders || [];
        
        orders.forEach(o => {
            if (!o.items) return;
            const channel = getGeneralSource(o.source);
            
            o.items.forEach(item => {
                const title = (item.title || '').toLowerCase();
                const qty = item.quantity || 0;
                const price = item.price || 0;

                // Check negative terms
                const hasNegative = negativeTerms.some(neg => title.includes(neg));
                if (hasNegative) return;

                // Match with barrel types
                for (const [type, requiredTerms] of Object.entries(termsMap)) {
                    const matches = requiredTerms.every(term => {
                        if (term === 'pequeño') {
                            return title.includes('pequeño') || title.includes('pequeno');
                        }
                        return title.includes(term);
                    });

                    if (matches) {
                        report[type].totalUnits += qty;
                        report[type].totalRevenue += (price * qty);
                        
                        report[type].channels[channel].units += qty;
                        report[type].channels[channel].revenue += (price * qty);
                    }
                }
            });
        });

        console.log("=== Reporte de Ventas Barriles Ahumadores POR CANAL (1 Marzo - 30 Abril 2026) ===");
        
        let grandTotalUnits = 0;
        let grandTotalRevenue = 0;
        let channelTotals = {
            'Shopify': { units: 0, revenue: 0 },
            'Mercado Libre': { units: 0, revenue: 0 },
            'Ripley': { units: 0, revenue: 0 }
        };

        for (const [type, stats] of Object.entries(report)) {
            console.log(`\n▶ ${type}: ${stats.totalUnits} unidades | $${stats.totalRevenue.toLocaleString('es-CL')} CLP`);
            
            if (stats.totalUnits > 0) {
                for (const [ch, chStats] of Object.entries(stats.channels)) {
                    if (chStats.units > 0) {
                        console.log(`    - ${ch}: ${chStats.units} uds | $${chStats.revenue.toLocaleString('es-CL')}`);
                        if(channelTotals[ch]) {
                            channelTotals[ch].units += chStats.units;
                            channelTotals[ch].revenue += chStats.revenue;
                        }
                    }
                }
            }
            
            grandTotalUnits += stats.totalUnits;
            grandTotalRevenue += stats.totalRevenue;
        }
        
        console.log("\n=========================================================================");
        console.log("RESUMEN TOTAL POR CANALES:");
        for (const [ch, chStats] of Object.entries(channelTotals)) {
            console.log(`- ${ch}: ${chStats.units} uds | $${chStats.revenue.toLocaleString('es-CL')} CLP`);
        }
        console.log("-------------------------------------------------------------------------");
        console.log(`GRAN TOTAL: ${grandTotalUnits} unidades | $${grandTotalRevenue.toLocaleString('es-CL')} CLP`);
        
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
