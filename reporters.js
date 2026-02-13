// Postman Helper — Report Formatters for CI/CD output
// ConsoleReporter, JUnitReporter, JSONReporter

/**
 * Human-readable console output with pass/fail icons.
 */
class ConsoleReporter {
    format(results) {
        const lines = [];
        lines.push('');
        lines.push(`  ${results.collection}`);
        lines.push('');

        for (const req of results.requests) {
            if (req.error) {
                lines.push(`  \u2717 ${req.method} ${req.name} — ERROR: ${req.error}`);
            } else {
                const icon = req.testResults.failures > 0 ? '\u2717' : '\u2713';
                const status = req.status ? ` [${req.status}]` : '';
                lines.push(`  ${icon} ${req.method} ${req.name}${status} (${req.responseTime}ms)`);
                for (const test of req.testResults.results) {
                    lines.push(`    ${test.passed ? '\u2713' : '\u2717'} ${test.name}`);
                }
            }
        }

        lines.push('');

        const parts = [];
        if (results.passed > 0) parts.push(`${results.passed} passing`);
        if (results.failures > 0) parts.push(`${results.failures} failing`);
        if (results.errors > 0) parts.push(`${results.errors} errors`);
        if (results.skipped > 0) parts.push(`${results.skipped} skipped`);
        if (parts.length === 0) parts.push('0 requests');

        lines.push(`  ${parts.join(', ')} (${results.duration}ms)`);
        lines.push('');

        return lines.join('\n');
    }
}

/**
 * JUnit XML format for CI systems (GitHub Actions, Jenkins, etc).
 */
class JUnitReporter {
    format(results) {
        const esc = (s) => String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        const lines = [];
        lines.push('<?xml version="1.0" encoding="UTF-8"?>');

        const totalTests = results.requests.reduce(
            (sum, r) => sum + Math.max(r.testResults.total, r.error ? 1 : 0), 0
        );
        const totalFailures = results.requests.reduce(
            (sum, r) => sum + r.testResults.failures, 0
        );
        const totalErrors = results.errors || 0;

        lines.push(
            `<testsuites name="${esc(results.collection)}" ` +
            `tests="${totalTests}" failures="${totalFailures}" ` +
            `errors="${totalErrors}" time="${(results.duration / 1000).toFixed(3)}">`
        );

        for (const req of results.requests) {
            const suiteTests = req.error ? 1 : req.testResults.total;
            const suiteFailures = req.testResults.failures;
            const suiteErrors = req.error ? 1 : 0;
            const suiteTime = (req.responseTime / 1000).toFixed(3);

            lines.push(
                `  <testsuite name="${esc(req.name)}" tests="${suiteTests}" ` +
                `failures="${suiteFailures}" errors="${suiteErrors}" time="${suiteTime}">`
            );

            if (req.error) {
                lines.push(`    <testcase name="Request Execution" time="${suiteTime}">`);
                lines.push(`      <error message="${esc(req.error)}"/>`);
                lines.push('    </testcase>');
            } else {
                for (const test of req.testResults.results) {
                    const testTime = (req.responseTime / 1000).toFixed(3);
                    if (test.passed) {
                        lines.push(`    <testcase name="${esc(test.name)}" time="${testTime}"/>`);
                    } else {
                        lines.push(`    <testcase name="${esc(test.name)}" time="${testTime}">`);
                        const msg = test.error ? esc(test.error) : 'Assertion failed';
                        lines.push(`      <failure message="${msg}"/>`);
                        lines.push('    </testcase>');
                    }
                }
            }

            lines.push('  </testsuite>');
        }

        lines.push('</testsuites>');
        return lines.join('\n');
    }
}

/**
 * Raw JSON output — just pretty-printed results object.
 */
class JSONReporter {
    format(results) {
        return JSON.stringify(results, null, 2);
    }
}

/**
 * Look up a reporter by name string.
 */
function getReporter(name) {
    switch ((name || 'console').toLowerCase()) {
        case 'junit': case 'xml': return new JUnitReporter();
        case 'json': return new JSONReporter();
        case 'console': default: return new ConsoleReporter();
    }
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ConsoleReporter, JUnitReporter, JSONReporter, getReporter };
}
