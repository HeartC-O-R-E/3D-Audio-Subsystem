/**
 * Copies a built resource into a local FiveM server for development.
 *
 * The target is never guessed. It is resolved, in order, from:
 *   1. --to=<path>
 *   2. the FIVEM_RESOURCE_PATH environment variable
 *   3. a .deploy.json in the repo root:  { "target": "C:/fxserver/resources/3d-audio" }
 * ...and if none is set, this exits with an error rather than writing anywhere.
 *
 * An existing config.json at the target is never overwritten, so your local
 * tuning survives a redeploy.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function resolveTarget() {
    const argTo = process.argv.slice(2).find(a => a.startsWith('--to='));
    if (argTo) return path.resolve(argTo.slice('--to='.length));

    if (process.env.FIVEM_RESOURCE_PATH) return path.resolve(process.env.FIVEM_RESOURCE_PATH);

    const deployFile = path.join(ROOT, '.deploy.json');
    if (fs.existsSync(deployFile)) {
        try {
            const { target } = JSON.parse(fs.readFileSync(deployFile, 'utf8'));
            if (typeof target === 'string' && target.trim() !== '') return path.resolve(target);
        } catch (e) {
            console.error(`[dev-deploy] .deploy.json is not valid JSON: ${e.message}`);
            process.exit(1);
        }
    }
    return null;
}

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
    }
}

function main() {
    const target = resolveTarget();

    if (!target) {
        console.error([
            '[dev-deploy] No deploy target configured. Pick one:',
            '',
            '  npm run dev:deploy -- --to="C:/fxserver/resources/3d-audio"',
            '  FIVEM_RESOURCE_PATH="C:/fxserver/resources/3d-audio" npm run dev:deploy',
            '  echo \'{ "target": "C:/fxserver/resources/3d-audio" }\' > .deploy.json',
            '',
            'Note the target folder must be named 3d-audio — in FiveM the resource',
            'name is the folder name, and exports are keyed on it.',
        ].join('\n'));
        process.exit(1);
    }

    if (!fs.existsSync(path.join(ROOT, 'dist'))) {
        console.error('[dev-deploy] ./dist does not exist — run `npm run build` first');
        process.exit(1);
    }

    // Safety: only write into a directory that is already a resource or empty.
    // Guards against a mistyped path wiping something unrelated.
    if (fs.existsSync(target)) {
        const entries = fs.readdirSync(target);
        const looksLikeResource = entries.includes('fxmanifest.lua') || entries.includes('__resource.lua');
        if (entries.length > 0 && !looksLikeResource) {
            console.error(`[dev-deploy] refusing to write to ${target}`);
            console.error('[dev-deploy] it is neither empty nor an existing FiveM resource (no fxmanifest.lua)');
            process.exit(1);
        }
    } else {
        fs.mkdirSync(target, { recursive: true });
    }

    console.log(`[dev-deploy] → ${target}`);

    // Replace generated content only.
    for (const dir of ['dist', 'assets']) {
        fs.rmSync(path.join(target, dir), { recursive: true, force: true });
        copyDir(path.join(ROOT, dir), path.join(target, dir));
        console.log(`[dev-deploy] copied ${dir}/`);
    }

    fs.copyFileSync(path.join(ROOT, 'fxmanifest.lua'), path.join(target, 'fxmanifest.lua'));
    console.log('[dev-deploy] copied fxmanifest.lua');

    const targetConfig = path.join(target, 'config.json');
    if (fs.existsSync(targetConfig)) {
        console.log('[dev-deploy] kept existing config.json');
    } else {
        fs.copyFileSync(path.join(ROOT, 'config.json'), targetConfig);
        console.log('[dev-deploy] copied config.json');
    }

    console.log('[dev-deploy] done — restart the resource in your server console');
}

main();
