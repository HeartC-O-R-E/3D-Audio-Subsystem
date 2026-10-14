const fs   = require('fs');
const path = require('path');

const BASE_DIR   = process.env.DEPLOY_ROOT
    ? path.resolve(process.env.DEPLOY_ROOT)
    : path.resolve(__dirname, '../../../.server');
const TARGET_DIR = path.join(BASE_DIR, 'server-data', 'resources', '[gamemodes]', '3d-audio');

const ITEMS_TO_COPY = [
    { src: 'dist',           isDir: true  },
    { src: 'assets',         isDir: true  },
    { src: 'fxmanifest.lua', isDir: false },
];

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
    }
}

function deploy() {
    console.log('[Deploy] 3d-audio →', TARGET_DIR);
    if (fs.existsSync(TARGET_DIR)) fs.rmSync(TARGET_DIR, { recursive: true });
    fs.mkdirSync(TARGET_DIR, { recursive: true });

    const sourceDir = path.resolve(__dirname, '..');
    for (const item of ITEMS_TO_COPY) {
        const src  = path.join(sourceDir, item.src);
        const dest = path.join(TARGET_DIR, item.src);
        if (!fs.existsSync(src)) { console.warn(`[Deploy] Not found, skipping: ${item.src}`); continue; }
        item.isDir ? copyDir(src, dest) : fs.copyFileSync(src, dest);
        console.log(`[Deploy] Copied: ${item.src}`);
    }
    console.log('[Deploy] Done.');
}

deploy();
