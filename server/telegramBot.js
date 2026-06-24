const { Telegraf } = require('telegraf');
const path = require('path');
const dayjs = require('dayjs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { getOrders } = require('./shopifyConnector');
const { getMeliOrders } = require('./meliConnector');

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken || botToken.includes('BOTFATHER')) {
    console.warn('⚠️  Telegram Bot Token no encontrado o es el valor por defecto. El bot no se iniciará.');
    module.exports = { startBot: () => {} };
} else {
    const bot = new Telegraf(botToken);

    // Middleware de Seguridad: Solo tú (o el admin) puede usar a Lex
    const authorizedChatId = process.env.TELEGRAM_CHAT_ID;
    bot.use((ctx, next) => {
        if (authorizedChatId && ctx.chat.id.toString() !== authorizedChatId) {
            console.log(`🔒 Intento de acceso no autorizado desde Chat ID: ${ctx.chat.id}`);
            return ctx.reply(`Lo siento, no tengo permiso para hablar contigo. Mi dueño es Lex.`);
        }
        return next();
    });

    bot.start((ctx) => {
        ctx.reply('👋 ¡Hola! Soy Lex, tu asistente de Ingrill.\n\nEstoy listo para ayudarte a controlar tu negocio desde aquí. Usa /resumen para empezar.');
    });

    bot.command('resumen', async (ctx) => {
        try {
            await ctx.reply('⏳ Generando resumen de ventas de hoy... un momento.');
            
            const start = dayjs().startOf('day').toISOString();
            const end = dayjs().endOf('day').toISOString();

            // Fetch Shopify Data
            const shopifyData = await getOrders(50);
            const todayOrders = shopifyData.orders.edges.filter(e => dayjs(e.node.createdAt).isAfter(dayjs().startOf('day')));
            const shopifyRevenue = todayOrders.reduce((acc, e) => acc + parseFloat(e.node.totalPriceSet.shopMoney.amount), 0);

            // Fetch MELI Data
            const meliOrders = await getMeliOrders(start, end);
            const meliRevenue = meliOrders.reduce((acc, o) => acc + parseFloat(o.total_amount), 0);

            const totalRevenue = shopifyRevenue + meliRevenue;

            ctx.replyWithMarkdown(
                `📊 *Resumen Ingrill (Hoy)*\n\n` +
                `🛍️ *Shopify:* ${todayOrders.length} pedidos - $${shopifyRevenue.toLocaleString('es-CL')}\n` +
                `🟡 *Meli:* ${meliOrders.length} pedidos - $${meliRevenue.toLocaleString('es-CL')}\n\n` +
                `💰 *Total:* *$${totalRevenue.toLocaleString('es-CL')}*`
            );
        } catch (err) {
            console.error('Error in /resumen:', err);
            ctx.reply('❌ Error al generar el resumen: ' + err.message);
        }
    });

    bot.command('shopify', async (ctx) => {
        try {
            const data = await getOrders(5);
            let msg = '📦 *Últimos 5 Pedidos Shopify:*\n\n';
            data.orders.edges.forEach(e => {
                const o = e.node;
                msg += `🔹 ${o.name} - $${parseFloat(o.totalPriceSet.shopMoney.amount).toLocaleString('es-CL')} (${o.sourceName})\n`;
            });
            ctx.replyWithMarkdown(msg);
        } catch (err) {
            ctx.reply('❌ Error Shopify: ' + err.message);
        }
    });

    bot.command('logistica', (ctx) => {
        ctx.reply('🚚 *Control Logístico (Lex Maestro)*\n\nEn la próxima actualización de Lex (Browser Maestro), podré acceder a Shipit y Falabella directamente para darte el estado de tus envios.\n\nPróximamente...');
    });

    const startBot = () => {
        bot.launch()
            .then(() => console.log('🤖 Lex Telegram Bot is ONLINE'))
            .catch(err => console.error('Error starting Telegraf:', err));
    };

    module.exports = { startBot };
}
