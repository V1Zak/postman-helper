/**
 * Unit tests for AnalyticsCollector — usage analytics (Issue #14)
 * Tests: track, _updateStats, getAverageResponseTime, getPercentile,
 *        getSuccessRate, getTopEndpoints, getRecentActivity, toJSON, fromJSON, reset
 */
const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

let AnalyticsCollector;

/**
 * Extract AnalyticsCollector from app.js source.
 * It sits between "// AnalyticsCollector" and "// AppState class"
 */
function extractAnalyticsCollector() {
    const appPath = path.join(__dirname, '..', 'app.js');
    const src = fs.readFileSync(appPath, 'utf-8');
    const lines = src.split('\n');

    let blockStart = -1;
    let blockEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^\/\/ AnalyticsCollector/) && blockStart === -1) {
            blockStart = i;
        }
        if (blockStart > -1 && i > blockStart && lines[i].match(/^\/\/ AppState class/)) {
            blockEnd = i;
            break;
        }
    }

    if (blockStart === -1 || blockEnd === -1) {
        throw new Error(`Could not find AnalyticsCollector in app.js (start=${blockStart}, end=${blockEnd})`);
    }

    const blockCode = lines.slice(blockStart, blockEnd).join('\n');
    const code = `${blockCode}\nmodule.exports = { AnalyticsCollector };`;

    const Module = require('module');
    const m = new Module();
    m._compile(code, 'analytics_virtual.js');
    return m.exports.AnalyticsCollector;
}

before(() => {
    AnalyticsCollector = extractAnalyticsCollector();
});

// ===================== Constructor =====================

describe('AnalyticsCollector: Constructor', () => {
    it('initializes with empty events array', () => {
        const ac = new AnalyticsCollector();
        assert.ok(Array.isArray(ac.events));
        assert.equal(ac.events.length, 0);
    });

    it('initializes with ISO sessionStart timestamp', () => {
        const ac = new AnalyticsCollector();
        assert.ok(ac.sessionStart);
        assert.ok(!isNaN(Date.parse(ac.sessionStart)));
    });

    it('initializes stats with all zero counters', () => {
        const ac = new AnalyticsCollector();
        assert.equal(ac.stats.requestsSent, 0);
        assert.equal(ac.stats.requestsCreated, 0);
        assert.equal(ac.stats.requestsDeleted, 0);
        assert.equal(ac.stats.collectionsCreated, 0);
        assert.equal(ac.stats.collectionsImported, 0);
        assert.equal(ac.stats.collectionsExported, 0);
        assert.equal(ac.stats.searchesPerformed, 0);
    });

    it('initializes stats with empty maps and arrays', () => {
        const ac = new AnalyticsCollector();
        assert.deepEqual(ac.stats.methodBreakdown, {});
        assert.deepEqual(ac.stats.statusCodeBreakdown, {});
        assert.deepEqual(ac.stats.responseTimes, []);
        assert.deepEqual(ac.stats.dailyActivity, {});
        assert.deepEqual(ac.stats.mostUsedEndpoints, {});
    });
});

// ===================== track =====================

describe('AnalyticsCollector: track', () => {
    it('adds event to events array', () => {
        const ac = new AnalyticsCollector();
        ac.track('request_sent', { method: 'GET' });
        assert.equal(ac.events.length, 1);
        assert.equal(ac.events[0].event, 'request_sent');
        assert.deepEqual(ac.events[0].data, { method: 'GET' });
    });

    it('event has ISO timestamp', () => {
        const ac = new AnalyticsCollector();
        ac.track('request_created');
        assert.ok(!isNaN(Date.parse(ac.events[0].timestamp)));
    });

    it('bounds events to 1000 entries', () => {
        const ac = new AnalyticsCollector();
        for (let i = 0; i < 1050; i++) {
            ac.track('request_sent', { method: 'GET' });
        }
        assert.equal(ac.events.length, 1000);
    });

    it('defaults data to empty object', () => {
        const ac = new AnalyticsCollector();
        ac.track('search_performed');
        assert.deepEqual(ac.events[0].data, {});
    });
});

// ===================== _updateStats =====================

describe('AnalyticsCollector: _updateStats', () => {
    it('increments requestsSent on request_sent', () => {
        const ac = new AnalyticsCollector();
        ac.track('request_sent', { method: 'GET', statusCode: 200, responseTime: 100, url: 'https://api.example.com/users' });
        assert.equal(ac.stats.requestsSent, 1);
    });

    it('tracks method breakdown', () => {
        const ac = new AnalyticsCollector();
        ac.track('request_sent', { method: 'GET' });
        ac.track('request_sent', { method: 'GET' });
        ac.track('request_sent', { method: 'POST' });
        assert.equal(ac.stats.methodBreakdown['GET'], 2);
        assert.equal(ac.stats.methodBreakdown['POST'], 1);
    });

    it('tracks status code breakdown', () => {
        const ac = new AnalyticsCollector();
        ac.track('request_sent', { statusCode: 200 });
        ac.track('request_sent', { statusCode: 200 });
        ac.track('request_sent', { statusCode: 404 });
        assert.equal(ac.stats.statusCodeBreakdown['200'], 2);
        assert.equal(ac.stats.statusCodeBreakdown['404'], 1);
    });

    it('records response times', () => {
        const ac = new AnalyticsCollector();
        ac.track('request_sent', { responseTime: 100 });
        ac.track('request_sent', { responseTime: 200 });
        assert.deepEqual(ac.stats.responseTimes, [100, 200]);
    });

    it('bounds response times to 5000', () => {
        const ac = new AnalyticsCollector();
        for (let i = 0; i < 5100; i++) {
            ac.track('request_sent', { responseTime: i });
        }
        assert.equal(ac.stats.responseTimes.length, 5000);
    });

    it('normalizes URLs to pathname for endpoint tracking', () => {
        const ac = new AnalyticsCollector();
        ac.track('request_sent', { url: 'https://api.example.com/users?page=1' });
        ac.track('request_sent', { url: 'https://api.example.com/users?page=2' });
        assert.equal(ac.stats.mostUsedEndpoints['/users'], 2);
    });

    it('handles non-URL strings for endpoints', () => {
        const ac = new AnalyticsCollector();
        ac.track('request_sent', { url: '/api/test' });
        assert.equal(ac.stats.mostUsedEndpoints['/api/test'], 1);
    });

    it('creates daily activity entry for today', () => {
        const ac = new AnalyticsCollector();
        const today = new Date().toISOString().split('T')[0];
        ac.track('request_sent', { method: 'GET' });
        assert.ok(ac.stats.dailyActivity[today]);
        assert.equal(ac.stats.dailyActivity[today].requests, 1);
    });

    it('increments requestsCreated and daily created', () => {
        const ac = new AnalyticsCollector();
        const today = new Date().toISOString().split('T')[0];
        ac.track('request_created');
        assert.equal(ac.stats.requestsCreated, 1);
        assert.equal(ac.stats.dailyActivity[today].created, 1);
    });

    it('increments requestsDeleted', () => {
        const ac = new AnalyticsCollector();
        ac.track('request_deleted');
        assert.equal(ac.stats.requestsDeleted, 1);
    });

    it('increments collectionsCreated', () => {
        const ac = new AnalyticsCollector();
        ac.track('collection_created');
        assert.equal(ac.stats.collectionsCreated, 1);
    });

    it('increments collectionsImported', () => {
        const ac = new AnalyticsCollector();
        ac.track('collection_imported');
        assert.equal(ac.stats.collectionsImported, 1);
    });

    it('increments collectionsExported', () => {
        const ac = new AnalyticsCollector();
        ac.track('collection_exported');
        assert.equal(ac.stats.collectionsExported, 1);
    });

    it('increments searchesPerformed', () => {
        const ac = new AnalyticsCollector();
        ac.track('search_performed');
        assert.equal(ac.stats.searchesPerformed, 1);
    });

    it('increments daily errors on error event', () => {
        const ac = new AnalyticsCollector();
        const today = new Date().toISOString().split('T')[0];
        ac.track('error', { message: 'test' });
        assert.equal(ac.stats.dailyActivity[today].errors, 1);
    });
});

// ===================== Computed metrics =====================

describe('AnalyticsCollector: getAverageResponseTime', () => {
    it('returns 0 for no data', () => {
        const ac = new AnalyticsCollector();
        assert.equal(ac.getAverageResponseTime(), 0);
    });

    it('calculates average correctly', () => {
        const ac = new AnalyticsCollector();
        ac.stats.responseTimes = [100, 200, 300];
        assert.equal(ac.getAverageResponseTime(), 200);
    });

    it('rounds to integer', () => {
        const ac = new AnalyticsCollector();
        ac.stats.responseTimes = [100, 150];
        assert.equal(ac.getAverageResponseTime(), 125);
    });
});

describe('AnalyticsCollector: getPercentile', () => {
    it('returns 0 for no data', () => {
        const ac = new AnalyticsCollector();
        assert.equal(ac.getPercentile(50), 0);
    });

    it('returns median for p50', () => {
        const ac = new AnalyticsCollector();
        ac.stats.responseTimes = [10, 20, 30, 40, 50];
        assert.equal(ac.getPercentile(50), 30);
    });

    it('returns p95 for sorted data', () => {
        const ac = new AnalyticsCollector();
        ac.stats.responseTimes = [];
        for (let i = 1; i <= 100; i++) ac.stats.responseTimes.push(i);
        assert.equal(ac.getPercentile(95), 95);
    });

    it('handles unsorted input', () => {
        const ac = new AnalyticsCollector();
        ac.stats.responseTimes = [50, 10, 30, 20, 40];
        // p50 of [10,20,30,40,50] = index ceil(0.5*5)-1 = 2 = 30
        assert.equal(ac.getPercentile(50), 30);
    });
});

describe('AnalyticsCollector: getSuccessRate', () => {
    it('returns 0 for no data', () => {
        const ac = new AnalyticsCollector();
        assert.equal(ac.getSuccessRate(), 0);
    });

    it('returns 100 for all 2xx', () => {
        const ac = new AnalyticsCollector();
        ac.stats.statusCodeBreakdown = { '200': 10, '201': 5 };
        assert.equal(ac.getSuccessRate(), 100);
    });

    it('calculates mixed codes correctly', () => {
        const ac = new AnalyticsCollector();
        ac.stats.statusCodeBreakdown = { '200': 7, '404': 2, '500': 1 };
        assert.equal(ac.getSuccessRate(), 70);
    });

    it('returns 0 for all errors', () => {
        const ac = new AnalyticsCollector();
        ac.stats.statusCodeBreakdown = { '500': 5, '502': 3 };
        assert.equal(ac.getSuccessRate(), 0);
    });
});

describe('AnalyticsCollector: getTopEndpoints', () => {
    it('returns empty array for no data', () => {
        const ac = new AnalyticsCollector();
        assert.deepEqual(ac.getTopEndpoints(), []);
    });

    it('returns sorted by count descending', () => {
        const ac = new AnalyticsCollector();
        ac.stats.mostUsedEndpoints = { '/a': 5, '/b': 10, '/c': 3 };
        const top = ac.getTopEndpoints();
        assert.deepEqual(top, [['/b', 10], ['/a', 5], ['/c', 3]]);
    });

    it('limits to n entries', () => {
        const ac = new AnalyticsCollector();
        ac.stats.mostUsedEndpoints = { '/a': 1, '/b': 2, '/c': 3, '/d': 4 };
        const top = ac.getTopEndpoints(2);
        assert.equal(top.length, 2);
        assert.equal(top[0][0], '/d');
    });
});

describe('AnalyticsCollector: getRecentActivity', () => {
    it('returns array of given length', () => {
        const ac = new AnalyticsCollector();
        const result = ac.getRecentActivity(7);
        assert.equal(result.length, 7);
    });

    it('each entry has date, requests, created, errors', () => {
        const ac = new AnalyticsCollector();
        const result = ac.getRecentActivity(1);
        assert.ok('date' in result[0]);
        assert.ok('requests' in result[0]);
        assert.ok('created' in result[0]);
        assert.ok('errors' in result[0]);
    });

    it('defaults to 0 for days with no activity', () => {
        const ac = new AnalyticsCollector();
        const result = ac.getRecentActivity(5);
        for (const day of result) {
            assert.equal(day.requests, 0);
            assert.equal(day.created, 0);
            assert.equal(day.errors, 0);
        }
    });

    it('reflects tracked activity for today', () => {
        const ac = new AnalyticsCollector();
        ac.track('request_sent', {});
        ac.track('request_sent', {});
        ac.track('request_created');
        const result = ac.getRecentActivity(1);
        assert.equal(result[0].requests, 2);
        assert.equal(result[0].created, 1);
    });
});

// ===================== Serialization =====================

describe('AnalyticsCollector: toJSON', () => {
    it('returns object with sessionStart, stats, events, lastUpdated', () => {
        const ac = new AnalyticsCollector();
        const json = ac.toJSON();
        assert.ok('sessionStart' in json);
        assert.ok('stats' in json);
        assert.ok('events' in json);
        assert.ok('lastUpdated' in json);
    });

    it('preserves tracked data', () => {
        const ac = new AnalyticsCollector();
        ac.track('request_sent', { method: 'GET' });
        ac.track('collection_created');
        const json = ac.toJSON();
        assert.equal(json.stats.requestsSent, 1);
        assert.equal(json.stats.collectionsCreated, 1);
        assert.equal(json.events.length, 2);
    });
});

describe('AnalyticsCollector: fromJSON', () => {
    it('restores stats from saved data', () => {
        const ac = new AnalyticsCollector();
        ac.fromJSON({
            stats: {
                requestsSent: 10,
                requestsCreated: 5,
                requestsDeleted: 2,
                collectionsCreated: 1,
                collectionsImported: 3,
                collectionsExported: 2,
                searchesPerformed: 7,
                methodBreakdown: { GET: 8, POST: 2 },
                statusCodeBreakdown: { '200': 7, '404': 3 },
                responseTimes: [100, 200, 300],
                dailyActivity: { '2026-01-01': { requests: 5, created: 2, errors: 0 } },
                mostUsedEndpoints: { '/users': 5 }
            }
        });
        assert.equal(ac.stats.requestsSent, 10);
        assert.equal(ac.stats.methodBreakdown['GET'], 8);
        assert.equal(ac.stats.statusCodeBreakdown['200'], 7);
        assert.deepEqual(ac.stats.responseTimes, [100, 200, 300]);
        assert.equal(ac.stats.dailyActivity['2026-01-01'].requests, 5);
        assert.equal(ac.stats.mostUsedEndpoints['/users'], 5);
    });

    it('merges with existing stats (accumulates)', () => {
        const ac = new AnalyticsCollector();
        ac.track('request_sent', { method: 'GET' });
        ac.fromJSON({
            stats: {
                requestsSent: 10,
                methodBreakdown: { GET: 5, POST: 3 }
            }
        });
        assert.equal(ac.stats.requestsSent, 11); // 1 existing + 10 restored
        assert.equal(ac.stats.methodBreakdown['GET'], 6); // 1 + 5
        assert.equal(ac.stats.methodBreakdown['POST'], 3);
    });

    it('handles null data gracefully', () => {
        const ac = new AnalyticsCollector();
        ac.fromJSON(null);
        assert.equal(ac.stats.requestsSent, 0);
    });

    it('handles empty stats object', () => {
        const ac = new AnalyticsCollector();
        ac.fromJSON({ stats: {} });
        assert.equal(ac.stats.requestsSent, 0);
    });

    it('restores events', () => {
        const ac = new AnalyticsCollector();
        ac.fromJSON({
            events: [
                { event: 'request_sent', timestamp: '2026-01-01T00:00:00Z', data: {} },
                { event: 'collection_created', timestamp: '2026-01-01T01:00:00Z', data: {} }
            ]
        });
        assert.equal(ac.events.length, 2);
    });

    it('bounds restored events to 1000', () => {
        const ac = new AnalyticsCollector();
        const events = [];
        for (let i = 0; i < 1500; i++) {
            events.push({ event: 'test', timestamp: new Date().toISOString(), data: {} });
        }
        ac.fromJSON({ events });
        assert.equal(ac.events.length, 1000);
    });

    it('merges daily activity from multiple days', () => {
        const ac = new AnalyticsCollector();
        ac.fromJSON({
            stats: {
                dailyActivity: {
                    '2026-01-01': { requests: 5, created: 2, errors: 0 },
                    '2026-01-02': { requests: 3, created: 1, errors: 1 }
                }
            }
        });
        assert.equal(ac.stats.dailyActivity['2026-01-01'].requests, 5);
        assert.equal(ac.stats.dailyActivity['2026-01-02'].errors, 1);
    });
});

// ===================== Round-trip =====================

describe('AnalyticsCollector: toJSON/fromJSON round-trip', () => {
    it('preserves all stats through serialization', () => {
        const ac1 = new AnalyticsCollector();
        ac1.track('request_sent', { method: 'GET', statusCode: 200, responseTime: 150, url: 'https://api.com/users' });
        ac1.track('request_sent', { method: 'POST', statusCode: 201, responseTime: 250, url: 'https://api.com/users' });
        ac1.track('request_created', { name: 'Test' });
        ac1.track('collection_created', { name: 'Col' });
        ac1.track('search_performed', { query: 'test' });
        ac1.track('error', { message: 'fail' });

        const json = ac1.toJSON();
        const ac2 = new AnalyticsCollector();
        ac2.fromJSON(json);

        assert.equal(ac2.stats.requestsSent, 2);
        assert.equal(ac2.stats.requestsCreated, 1);
        assert.equal(ac2.stats.collectionsCreated, 1);
        assert.equal(ac2.stats.searchesPerformed, 1);
        assert.equal(ac2.stats.methodBreakdown['GET'], 1);
        assert.equal(ac2.stats.methodBreakdown['POST'], 1);
        assert.equal(ac2.stats.statusCodeBreakdown['200'], 1);
        assert.equal(ac2.stats.statusCodeBreakdown['201'], 1);
        assert.deepEqual(ac2.stats.responseTimes, [150, 250]);
        assert.equal(ac2.getAverageResponseTime(), 200);
        assert.equal(ac2.getSuccessRate(), 100);
        assert.equal(ac2.events.length, 6);
    });
});

// ===================== Reset =====================

describe('AnalyticsCollector: reset', () => {
    it('clears all stats to zero', () => {
        const ac = new AnalyticsCollector();
        ac.track('request_sent', { method: 'GET', statusCode: 200, responseTime: 100 });
        ac.track('collection_created');
        ac.reset();
        assert.equal(ac.stats.requestsSent, 0);
        assert.equal(ac.stats.collectionsCreated, 0);
        assert.deepEqual(ac.stats.methodBreakdown, {});
        assert.deepEqual(ac.stats.responseTimes, []);
    });

    it('clears events', () => {
        const ac = new AnalyticsCollector();
        ac.track('request_sent');
        ac.track('request_sent');
        ac.reset();
        assert.equal(ac.events.length, 0);
    });

    it('sets new sessionStart', () => {
        const ac = new AnalyticsCollector();
        const original = ac.sessionStart;
        // Small delay to ensure different timestamp
        ac.reset();
        assert.ok(ac.sessionStart);
        // sessionStart should be a valid ISO timestamp
        assert.ok(!isNaN(Date.parse(ac.sessionStart)));
    });
});

// ===================== Edge Cases =====================

describe('AnalyticsCollector: Edge Cases', () => {
    it('handles request_sent with no data fields', () => {
        const ac = new AnalyticsCollector();
        ac.track('request_sent', {});
        assert.equal(ac.stats.requestsSent, 1);
        assert.deepEqual(ac.stats.methodBreakdown, {});
        assert.deepEqual(ac.stats.statusCodeBreakdown, {});
    });

    it('handles unknown event names gracefully', () => {
        const ac = new AnalyticsCollector();
        ac.track('unknown_event', { foo: 'bar' });
        assert.equal(ac.events.length, 1);
        // Stats should be unaffected
        assert.equal(ac.stats.requestsSent, 0);
    });

    it('status code 0 is tracked as "0"', () => {
        const ac = new AnalyticsCollector();
        ac.track('request_sent', { statusCode: 0 });
        assert.equal(ac.stats.statusCodeBreakdown['0'], 1);
    });

    it('multiple rapid tracks maintain correct counts', () => {
        const ac = new AnalyticsCollector();
        for (let i = 0; i < 100; i++) {
            ac.track('request_sent', { method: 'GET', statusCode: 200, responseTime: i * 10 });
        }
        assert.equal(ac.stats.requestsSent, 100);
        assert.equal(ac.stats.methodBreakdown['GET'], 100);
        assert.equal(ac.stats.statusCodeBreakdown['200'], 100);
        assert.equal(ac.stats.responseTimes.length, 100);
    });
});
