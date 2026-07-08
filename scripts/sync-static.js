/**
 * scripts/sync-static.js
 * Copia client/ -> public/ usando fs.cpSync (Node.js 16.7+, multiplataforma).
 * No usa comandos de shell (cp, xcopy), funciona en Windows, macOS y Linux.
 *
 * Uso:  node scripts/sync-static.js
 *       node scripts/sync-static.js --clean   (borra public/ antes de copiar)
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'client');
const DEST   = path.join(ROOT, 'public');
const CLEAN  = process.argv.includes('--clean');

console.log('\n=== sync-static.js ===');
console.log(`  Origen : ${SOURCE}`);
console.log(`  Destino: ${DEST}`);

// Verificar que el origen existe
if (!fs.existsSync(SOURCE)) {
    console.error(`\n❌ No se encuentra la carpeta de origen: ${SOURCE}`);
    process.exit(1);
}

// Limpiar destino si se pidió --clean
if (CLEAN && fs.existsSync(DEST)) {
    console.log('  Limpiando public/ ...');
    fs.rmSync(DEST, { recursive: true, force: true });
}

// Copiar
const t0 = Date.now();
try {
    fs.cpSync(SOURCE, DEST, {
        recursive: true,
        force: true,           // Sobreescribir archivos existentes
        errorOnExist: false,
        preserveTimestamps: true,
    });
    const elapsed = Date.now() - t0;
    const fileCount = countFiles(DEST);
    console.log(`\n✅ Sincronización completada en ${elapsed}ms — ${fileCount} archivo(s) copiado(s)\n`);
} catch (err) {
    console.error(`\n❌ Error al copiar: ${err.message}`);
    process.exit(1);
}

function countFiles(dir) {
    let count = 0;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        entries.forEach(e => {
            if (e.isDirectory()) {
                count += countFiles(path.join(dir, e.name));
            } else {
                count++;
            }
        });
    } catch {}
    return count;
}
