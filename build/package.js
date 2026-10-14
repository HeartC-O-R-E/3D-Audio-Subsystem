/**
 * Stages a runnable resource into ./package/3d-audio/.
 *
 * The staged folder is deliberately named after the RESOURCE, not the repo:
 * in FiveM the resource name is the folder name, so a release archive must
 * carry `3d-audio/` at its root for `exports['3d-audio']` to resolve after the
 * user extracts it into their `resources/` directory.
 *
 * Only what a server actually needs is copied — no src/, no web/, no
 * package.json, no node_modules.
 */

const fs = require('fs');
const path = require('path');

const RESOURCE_NAME = '3d-audio';
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'package', RESOURCE_NAME);

const ITEMS = [
    { src: 'dist', isDir: true, required: true },
    { src: 'assets', isDir: true, required: true },
    { src: 'fxmanifest.lua', isDir: false, required: true },
    { src: 'config.json', isDir: false, required: true },
    { src: 'README.md', isDir: false, required: false },
    { src: 'LICENSE', isDir: false, required: false },
    { src: 'NOTICE', isDir: false, required: false },
];

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
    }
}

function dirSize(dir) {
    let total = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        total += entry.isDirectory() ? dirSize(p) : fs.statSync(p).size;
    }
    return total;
}

function main() {
    fs.rmSync(path.join(ROOT, 'package'), { recursive: true, force: true });
    fs.mkdirSync(OUT_DIR, { recursive: true });

    let missingRequired = false;

    for (const item of ITEMS) {
        const src = path.join(ROOT, item.src);
        const dest = path.join(OUT_DIR, item.src);

        if (!fs.existsSync(src)) {
            if (item.required) {
                console.error(`[package] MISSING required ${item.src} — run \`npm run build\` first`);
                missingRequired = true;
            } else {
                console.warn(`[package] skipping optional ${item.src} (not found)`);
            }
            continue;
        }

        item.isDir ? copyDir(src, dest) : fs.copyFileSync(src, dest);
        console.log(`[package] + ${item.src}`);
    }

    if (missingRequired) process.exit(1);

    const kb = (dirSize(OUT_DIR) / 1024).toFixed(0);
    console.log(`[package] staged ${path.relative(ROOT, OUT_DIR)} (${kb} KB)`);
}

main();
