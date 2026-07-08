const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const axios = require('axios');
const { meliRequest, getMeliInventory } = require('./meliConnector');
const { getRipleyInventory } = require('./ripleyConnector');

async function debugMeli() {
    console.log('--- DEBUG MELI ITEMS ---');
    try {
        const items = await getMeliInventory();
        console.log(`Found ${items.length} items.`);
        items.forEach(item => {
            console.log(`Item: ${item.title} (${item.id})`);
            console.log(`  Stock: ${item.available_quantity}`);
            console.log(`  Shipping:`, JSON.stringify(item.shipping, null, 2));
            const skuAttr = item.attributes?.find(attr => attr.id === 'SELLER_SKU');
            console.log(`  SKU: ${skuAttr ? skuAttr.value_name : 'N/A'}`);
        });
    } catch (err) {
        console.error(err);
    }
}

async function debugRipley() {
    console.log('\n--- DEBUG RIPLEY OFFERS ---');
    try {
        const offers = await getRipleyInventory();
        console.log(`Found ${offers.length} offers.`);
        if (offers.length > 0) {
            console.log('Sample Offer Keys:', Object.keys(offers[0]));
            // Find one that might have fulfillment info or print all offers with title, quantity, and potential fulfillment indicators
            offers.forEach(offer => {
                console.log(`Offer: ${offer.product_title} (SKU: ${offer.shop_sku})`);
                console.log(`  Quantity: ${offer.quantity}`);
                console.log(`  Active: ${offer.active}`);
                // Print any fields that might indicate fulfillment
                const fullFields = {};
                for (const key of Object.keys(offer)) {
                    if (key.toLowerCase().includes('fulfillment') || key.toLowerCase().includes('logistic') || key.toLowerCase().includes('ship') || key.toLowerCase().includes('lead') || key.toLowerCase().includes('origin') || key.toLowerCase().includes('channel')) {
                        fullFields[key] = offer[key];
                    }
                }
                console.log(`  Interesting Fields:`, fullFields);
            });
        }
    } catch (err) {
        console.error(err);
    }
}

async function run() {
    await debugMeli();
    await debugRipley();
}
run();
