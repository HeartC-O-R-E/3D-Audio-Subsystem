const esbuild = require('esbuild');

const IS_WATCH_MODE = process.env.IS_WATCH_MODE;

const TARGET_ENTRIES = [
    {
        target: 'es2020',
        entryPoints: ['./src/server/index.ts'],
        outfile: './dist/server/index.js',
        platform: 'node',
    },
    {
        target: 'es2020',
        entryPoints: ['./src/client/index.ts'],
        outfile: './dist/client/index.js',
        platform: 'browser',
    },
];

const buildBundle = async () => {
    try {
        const baseOptions = {
            logLevel: 'info',
            bundle: true,
            charset: 'utf8',
            minifyWhitespace: true,
            absWorkingDir: process.cwd(),
            external: [],
        };

        for (const targetOpts of TARGET_ENTRIES) {
            const mergedOpts = { ...baseOptions, ...targetOpts };
            if (IS_WATCH_MODE) {
                const ctx = await esbuild.context(mergedOpts);
                await ctx.watch();
                console.log(`[ESBuild Watch] Watching ${targetOpts.entryPoints[0]}...`);
            } else {
                const { errors } = await esbuild.build(mergedOpts);
                if (errors.length) {
                    console.error(`[ESBuild] Bundle failed with ${errors.length} errors`);
                    process.exit(1);
                }
            }
        }

        if (!IS_WATCH_MODE) {
            console.log('[ESBuild] Build completed successfully');
        }
    } catch (e) {
        console.error('[ESBuild] Build failed:', e);
        process.exit(1);
    }
};

buildBundle().catch(() => process.exit(1));
