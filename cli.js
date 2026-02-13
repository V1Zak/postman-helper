#!/usr/bin/env node
// Postman Helper CLI — Run collections from the command line for CI/CD

const fs = require('fs');
const path = require('path');
const { CollectionRunner } = require('./runner');
const { getReporter } = require('./reporters');

const VERSION = '1.0.0';

/**
 * Parse CLI arguments into an options object.
 */
function parseArgs(args) {
    const opts = {
        collection: null,
        environment: null,
        reporter: 'console',
        output: null,
        bail: false,
        timeout: 30000,
        delay: 0,
        verbose: false
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '-c': case '--collection':
                opts.collection = args[++i];
                break;
            case '-e': case '--environment':
                opts.environment = args[++i];
                break;
            case '-r': case '--reporter':
                opts.reporter = args[++i];
                break;
            case '-o': case '--output':
                opts.output = args[++i];
                break;
            case '--bail':
                opts.bail = true;
                break;
            case '--timeout':
                opts.timeout = parseInt(args[++i], 10);
                break;
            case '--delay':
                opts.delay = parseInt(args[++i], 10);
                break;
            case '--verbose':
                opts.verbose = true;
                break;
            case '-v': case '--version':
                console.log(`postman-helper v${VERSION}`);
                process.exit(0);
                break;
            case '-h': case '--help':
                printHelp();
                process.exit(0);
                break;
            default:
                // If it looks like a file path and no collection yet, treat as collection
                if (!opts.collection && !args[i].startsWith('-')) {
                    opts.collection = args[i];
                }
                break;
        }
    }

    return opts;
}

function printHelp() {
    console.log(`
  Postman Helper CLI — Run collections from the command line

  Usage:
    postman-helper -c <collection.json> [options]

  Options:
    -c, --collection <path>   Path to collection JSON file (required)
    -e, --environment <path>  Path to environment JSON file
    -r, --reporter <type>     Reporter: console (default), json, junit
    -o, --output <path>       Write report to file instead of stdout
    --bail                    Stop on first failure
    --timeout <ms>            Request timeout in milliseconds (default: 30000)
    --delay <ms>              Delay between requests (default: 0)
    --verbose                 Show detailed output
    -v, --version             Show version
    -h, --help                Show this help

  Exit codes:
    0  All tests passed (or no tests)
    1  One or more test failures
    2  Runtime error (bad args, missing file, etc.)

  Examples:
    postman-helper -c collection.json
    postman-helper -c api.json -e staging.json -r junit -o results.xml
    postman-helper -c api.json --bail --timeout 10000
`);
}

/**
 * Load environment variables from a JSON file.
 * Supports both Postman environment format {values: [{key, value, enabled}]}
 * and simple {key: value} format.
 */
function loadEnvironment(envPath) {
    const raw = fs.readFileSync(envPath, 'utf-8');
    const data = JSON.parse(raw);

    if (data.values && Array.isArray(data.values)) {
        // Postman environment format
        const vars = {};
        for (const v of data.values) {
            if (v.enabled !== false) {
                vars[v.key] = v.value;
            }
        }
        return vars;
    }

    // Simple key-value object
    return data;
}

/**
 * Main entry point.
 */
async function main(args) {
    const options = parseArgs(args || process.argv.slice(2));

    if (!options.collection) {
        console.error('Error: --collection path is required. Use --help for usage.');
        process.exit(2);
    }

    // Resolve path relative to cwd
    const collectionPath = path.resolve(options.collection);
    if (!fs.existsSync(collectionPath)) {
        console.error(`Error: Collection file not found: ${collectionPath}`);
        process.exit(2);
    }

    let collectionData;
    try {
        collectionData = JSON.parse(fs.readFileSync(collectionPath, 'utf-8'));
    } catch (err) {
        console.error(`Error: Failed to parse collection JSON: ${err.message}`);
        process.exit(2);
    }

    let envVars = {};
    if (options.environment) {
        const envPath = path.resolve(options.environment);
        if (!fs.existsSync(envPath)) {
            console.error(`Error: Environment file not found: ${envPath}`);
            process.exit(2);
        }
        try {
            envVars = loadEnvironment(envPath);
        } catch (err) {
            console.error(`Error: Failed to parse environment JSON: ${err.message}`);
            process.exit(2);
        }
    }

    const runner = new CollectionRunner({
        timeout: options.timeout,
        bail: options.bail,
        verbose: options.verbose,
        delay: options.delay
    });

    let results;
    try {
        results = await runner.run(collectionData, envVars);
    } catch (err) {
        console.error(`Error: Runner failed: ${err.message}`);
        process.exit(2);
    }

    const reporter = getReporter(options.reporter);
    const output = reporter.format(results);

    if (options.output) {
        const outputPath = path.resolve(options.output);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, output, 'utf-8');
        if (options.verbose) {
            console.log(`Report written to ${outputPath}`);
        }
    } else {
        console.log(output);
    }

    // Exit code: 0 = all pass, 1 = failures/errors
    const exitCode = (results.failures > 0 || results.errors > 0) ? 1 : 0;
    process.exit(exitCode);
}

// Run if invoked directly
if (require.main === module) {
    main().catch(err => {
        console.error(`Fatal: ${err.message}`);
        process.exit(2);
    });
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseArgs, loadEnvironment, main, printHelp, VERSION };
}
