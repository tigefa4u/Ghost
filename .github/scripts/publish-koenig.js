#!/usr/bin/env node

/**
 * Publish Koenig packages to npm.
 *
 * Reads each koenig/*/package.json, checks if that version is already
 * published on the npm registry, and publishes any that are new.
 *
 * Usage:
 *   node .github/scripts/publish-koenig.js [--dry-run]
 */

const path = require('path');
const fs = require('fs');
const {execSync} = require('child_process');

const KOENIG_DIR = path.resolve(__dirname, '../../koenig');
const DRY_RUN = process.argv.includes('--dry-run');

function getKoenigPackages() {
    const entries = fs.readdirSync(KOENIG_DIR, {withFileTypes: true});
    const packages = [];

    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }

        const pkgJsonPath = path.join(KOENIG_DIR, entry.name, 'package.json');
        if (!fs.existsSync(pkgJsonPath)) {
            continue;
        }

        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

        // Skip private packages
        if (pkgJson.private) {
            continue;
        }

        packages.push({
            name: pkgJson.name,
            version: pkgJson.version,
            dir: path.join(KOENIG_DIR, entry.name),
            pkgJson
        });
    }

    return packages;
}

function isPublished(name, version) {
    try {
        const result = execSync(`npm view ${name}@${version} version 2>/dev/null`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
        return result === version;
    } catch {
        return false;
    }
}

function publishPackage(pkg) {
    const args = ['npm', 'publish', '--access', 'public'];

    if (DRY_RUN) {
        args.push('--dry-run');
    }

    console.log(`  Publishing ${pkg.name}@${pkg.version}...`);

    try {
        execSync(args.join(' '), {
            cwd: pkg.dir,
            stdio: 'inherit',
            env: {
                ...process.env,
                NPM_CONFIG_PROVENANCE: 'true'
            }
        });
        return true;
    } catch (err) {
        console.error(`  ✗ Failed to publish ${pkg.name}@${pkg.version}`);
        console.error(`    ${err.message}`);
        return false;
    }
}

async function main() {
    console.log(`\n📦 Koenig Package Publisher${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

    const packages = getKoenigPackages();
    console.log(`Found ${packages.length} publishable packages\n`);

    const toPublish = [];
    const alreadyPublished = [];
    const failed = [];

    // Check which packages need publishing
    for (const pkg of packages) {
        if (isPublished(pkg.name, pkg.version)) {
            alreadyPublished.push(pkg);
            console.log(`  ✓ ${pkg.name}@${pkg.version} — already published`);
        } else {
            toPublish.push(pkg);
            console.log(`  → ${pkg.name}@${pkg.version} — needs publishing`);
        }
    }

    if (toPublish.length === 0) {
        console.log('\nAll packages are up to date. Nothing to publish.');
        return;
    }

    console.log(`\nPublishing ${toPublish.length} package(s)...\n`);

    // Build all koenig packages first
    console.log('Building packages...');
    try {
        execSync('yarn nx run-many -t build --projects=\'@tryghost/kg-*,@tryghost/koenig-*,@tryghost/html-to-mobiledoc\'', {
            cwd: path.resolve(__dirname, '../..'),
            stdio: 'inherit'
        });
    } catch (err) {
        console.error('Build failed. Aborting publish.');
        process.exit(1);
    }

    console.log('');

    for (const pkg of toPublish) {
        const success = publishPackage(pkg);
        if (!success) {
            failed.push(pkg);
        }
    }

    // Summary
    console.log('\n--- Summary ---');
    console.log(`  Already published: ${alreadyPublished.length}`);
    console.log(`  Newly published:   ${toPublish.length - failed.length}`);
    if (failed.length > 0) {
        console.log(`  Failed:            ${failed.length}`);
        for (const pkg of failed) {
            console.log(`    ✗ ${pkg.name}@${pkg.version}`);
        }
        process.exit(1);
    }

    console.log('\nDone!');
}

main();
