#!/usr/bin/env node

/**
 * Version bump Koenig packages for release.
 *
 * Detects which koenig packages have changed since their last published
 * version, prompts for version bump type, updates package.json files,
 * and creates a release commit.
 *
 * Usage:
 *   node .github/scripts/ship-koenig.js
 *   node .github/scripts/ship-koenig.js --bump patch   # Skip prompts, use patch for all
 *   node .github/scripts/ship-koenig.js --bump minor
 */

const path = require('path');
const fs = require('fs');
const {execSync} = require('child_process');
const readline = require('readline/promises');

const semver = require('semver');

const KOENIG_DIR = path.resolve(__dirname, '../../koenig');
const ROOT_DIR = path.resolve(__dirname, '../..');

const FORCE_BUMP = (() => {
    const idx = process.argv.indexOf('--bump');
    if (idx !== -1 && process.argv[idx + 1]) {
        const type = process.argv[idx + 1];
        if (['patch', 'minor', 'major'].includes(type)) {
            return type;
        }
        console.error(`Unknown bump type: ${type}. Use patch, minor, or major.`);
        process.exit(1);
    }
    return null;
})();

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
        if (pkgJson.private) {
            continue;
        }

        packages.push({
            name: pkgJson.name,
            version: pkgJson.version,
            dir: path.join(KOENIG_DIR, entry.name),
            dirName: entry.name,
            pkgJsonPath,
            pkgJson
        });
    }

    return packages;
}

function getPublishedVersion(name) {
    try {
        return execSync(`npm view ${name} version 2>/dev/null`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
    } catch {
        return null;
    }
}

function hasChanges(pkg) {
    // Check for git changes in the package directory since last tag or commit
    try {
        const publishedVersion = getPublishedVersion(pkg.name);
        if (!publishedVersion) {
            return true; // Never published
        }

        // Check if the local version differs from npm
        if (pkg.version !== publishedVersion) {
            return true; // Already bumped
        }

        // Look for file changes in this package dir since the version was last changed
        const result = execSync(
            `git log -1 --format=%H -- "${pkg.dir}/package.json"`,
            {encoding: 'utf8', cwd: ROOT_DIR}
        ).trim();

        if (!result) {
            return false;
        }

        // Check if there are changes after the last package.json update
        const diffResult = execSync(
            `git diff --name-only ${result}..HEAD -- "${pkg.dir}"`,
            {encoding: 'utf8', cwd: ROOT_DIR}
        ).trim();

        return diffResult.length > 0;
    } catch {
        return true; // If in doubt, include it
    }
}

function updateVersion(pkg, newVersion) {
    const updated = {...pkg.pkgJson, version: newVersion};
    fs.writeFileSync(pkg.pkgJsonPath, JSON.stringify(updated, null, 2) + '\n');
}

async function main() {
    console.log('\n🚢 Koenig Package Shipper\n');

    // Ensure clean git state
    const gitStatus = execSync('git status --porcelain', {encoding: 'utf8', cwd: ROOT_DIR}).trim();
    if (gitStatus) {
        console.error('Working directory is not clean. Commit or stash your changes first.');
        console.error(gitStatus);
        process.exit(1);
    }

    // Run tests first
    console.log('Running tests...');
    try {
        execSync('yarn nx run-many -t test --projects=\'@tryghost/kg-*,@tryghost/koenig-*,@tryghost/html-to-mobiledoc\'', {
            cwd: ROOT_DIR,
            stdio: 'inherit'
        });
    } catch {
        console.error('\nTests failed. Fix them before shipping.');
        process.exit(1);
    }

    const packages = getKoenigPackages();
    console.log(`\nFound ${packages.length} publishable packages\n`);

    // Detect changed packages
    const changed = packages.filter(pkg => hasChanges(pkg));

    if (changed.length === 0) {
        console.log('No packages have changed since their last published version.');
        return;
    }

    console.log(`${changed.length} package(s) have changes:\n`);
    for (const pkg of changed) {
        console.log(`  ${pkg.name} (current: ${pkg.version})`);
    }

    const rl = readline.createInterface({input: process.stdin, output: process.stdout});
    const bumped = [];

    for (const pkg of changed) {
        let bumpType = FORCE_BUMP;

        if (!bumpType) {
            const answer = await rl.question(`\n  ${pkg.name} (${pkg.version}) — bump type [patch/minor/major/skip] (patch): `);
            bumpType = answer.trim().toLowerCase() || 'patch';

            if (bumpType === 'skip') {
                console.log(`  Skipping ${pkg.name}`);
                continue;
            }

            if (!['patch', 'minor', 'major'].includes(bumpType)) {
                console.error(`  Unknown bump type: ${bumpType}. Skipping.`);
                continue;
            }
        }

        const newVersion = semver.inc(pkg.version, bumpType);
        console.log(`  ${pkg.name}: ${pkg.version} → ${newVersion}`);
        updateVersion(pkg, newVersion);
        bumped.push({...pkg, newVersion});
    }

    rl.close();

    if (bumped.length === 0) {
        console.log('\nNo packages were bumped.');
        return;
    }

    // Stage and commit
    console.log('\nCreating release commit...');

    const bumpSummary = bumped.map(p => `  - ${p.name}: ${p.version} → ${p.newVersion}`).join('\n');

    for (const pkg of bumped) {
        execSync(`git add "${pkg.pkgJsonPath}"`, {cwd: ROOT_DIR});
    }

    const commitMsg = `Published new Koenig versions\n\n${bumpSummary}`;
    execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, {cwd: ROOT_DIR});

    console.log('\n✓ Release commit created.');
    console.log('  Push to main and trigger the publish-koenig workflow to publish to npm.');
    console.log(`\n  Bumped ${bumped.length} package(s):`);
    for (const pkg of bumped) {
        console.log(`    ${pkg.name}: ${pkg.version} → ${pkg.newVersion}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
