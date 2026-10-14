/**
 * Guards against drift between the three places a default lives:
 *
 *   1. config.json              — what operators actually edit
 *   2. src/shared/config.ts     — DEFAULT_CONFIG, used by server + client
 *   3. web/src/config.ts        — DEFAULT_NUI_CONFIG, the NUI's fallback
 *
 * (3) is a hand-maintained copy because the NUI is a separate tsconfig and
 * module graph and cannot import from src/shared. This check makes the
 * duplication safe: if the copies disagree, CI fails.
 *
 * Run: node build/check-config-sync.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

/** Bundle a TS module to CJS with esbuild and require it, so we compare real values. */
function loadTsModule(relPath) {
    const esbuild = path.join(ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild');
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), '3d-audio-sync-')), 'mod.js');
    execFileSync(process.execPath, [
        esbuild,
        path.join(ROOT, relPath),
        '--bundle',
        '--platform=node',
        '--format=cjs',
        `--outfile=${out}`,
        '--log-level=error',
    ], { stdio: 'inherit' });
    return require(out);
}

const failures = [];

function compare(label, a, b, pathPrefix = '') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
        const p = pathPrefix ? `${pathPrefix}.${k}` : k;
        const av = a[k];
        const bv = b[k];
        if (!(k in a)) { failures.push(`${label}: ${p} missing on the left`); continue; }
        if (!(k in b)) { failures.push(`${label}: ${p} missing on the right`); continue; }
        if (av !== null && bv !== null && typeof av === 'object' && typeof bv === 'object') {
            compare(label, av, bv, p);
        } else if (av !== bv) {
            failures.push(`${label}: ${p} differs — ${JSON.stringify(av)} vs ${JSON.stringify(bv)}`);
        }
    }
}

const shared = loadTsModule('src/shared/config.ts');
const nui = loadTsModule('web/src/config.ts');
const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

// 1. config.json must validate to exactly DEFAULT_CONFIG, so deleting the file
//    changes nothing.
const { config: merged, warnings } = shared.mergeConfig(shipped);
for (const w of warnings) failures.push(`config.json: ${w}`);
compare('config.json vs DEFAULT_CONFIG', merged, shared.DEFAULT_CONFIG);

// 2. The NUI fallback must agree with the shared defaults on every shared key.
compare('web/src/config.ts vs DEFAULT_CONFIG', nui.DEFAULT_NUI_CONFIG, shared.toNuiConfig(shared.DEFAULT_CONFIG));

if (failures.length > 0) {
    console.error('[check-config-sync] FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}

console.log('[check-config-sync] config.json, DEFAULT_CONFIG and DEFAULT_NUI_CONFIG agree');
