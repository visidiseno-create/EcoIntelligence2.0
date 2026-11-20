import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGeoOpsAlerts, evaluateReadinessState, sanitizeWorkerUrl } from './geoOpsHealth';

test('sanitizeWorkerUrl strips embedded credentials and query params cleanly', () => {
  assert.equal(sanitizeWorkerUrl('http://user:secret@127.0.0.1:8081/?token=abc#frag'), 'http://127.0.0.1:8081');
  assert.equal(sanitizeWorkerUrl('ftp://bad-proto.local'), null);
  assert.equal(sanitizeWorkerUrl(''), null);
});

test('evaluateGeoOpsAlerts returns zero alerts under healthy nominal operating conditions', () => {
  const alerts = evaluateGeoOpsAlerts({
    workerConfigured: true,
    workerReachable: true,
    postgisConfigured: true,
    postgisConnected: true,
    totalRequests: 25,
    errorRatePct: 4,
    avgLatencyMs: 28,
    rssMb: 180,
    sysTotalMb: 8192,
    heapUsedMb: 90,
    heapTotalMb: 150,
    runningJobs: 1,
    failedJobs: 0,
    stalledJobs: 0,
    diskFreeMb: 20480,
    diskTotalMb: 40960,
  });
  assert.equal(alerts.length, 0);
});

test('evaluateGeoOpsAlerts detects all 8 production fault scenarios cleanly', () => {
  const downWorkerAlerts = evaluateGeoOpsAlerts({
    workerConfigured: true,
    workerReachable: false,
    workerError: 'ECONNREFUSED',
    postgisConfigured: true,
    postgisConnected: false,
    totalRequests: 10,
    errorRatePct: 50,
    avgLatencyMs: 2200,
    rssMb: 1800,
    sysTotalMb: 2048,
    heapUsedMb: 490,
    heapTotalMb: 500,
    runningJobs: 9,
    failedJobs: 6,
    stalledJobs: 2,
    diskFreeMb: 200,
    diskTotalMb: 10000,
  });
  const codes = new Set(downWorkerAlerts.map((a) => a.code));
  assert.ok(codes.has('WORKER_DOWN'));
  assert.ok(codes.has('HIGH_ERROR_RATE'));
  assert.ok(codes.has('HIGH_MEMORY'));
  assert.ok(codes.has('QUEUE_SATURATED'));
  assert.ok(codes.has('LOW_STORAGE'));
  assert.ok(codes.has('STALLED_JOBS'));
  assert.ok(codes.has('HIGH_LATENCY'));

  const pgDownAlerts = evaluateGeoOpsAlerts({
    workerConfigured: true,
    workerReachable: true,
    postgisConfigured: true,
    postgisConnected: false,
    totalRequests: 0,
    errorRatePct: 0,
    avgLatencyMs: 5,
    rssMb: 100,
    sysTotalMb: 4096,
    heapUsedMb: 40,
    heapTotalMb: 80,
    runningJobs: 0,
    failedJobs: 0,
    stalledJobs: 0,
    diskFreeMb: 5000,
    diskTotalMb: 10000,
  });
  assert.deepEqual(pgDownAlerts.map((a) => a.code), ['POSTGIS_DOWN']);
});

test('evaluateReadinessState blocks readiness when worker or postgis is degraded', () => {
  assert.equal(
    evaluateReadinessState({
      dbWritable: true,
      workerConfigured: true,
      workerReachable: true,
      postgisConfigured: true,
      postgisConnected: true,
    }).ready,
    true
  );
  assert.equal(
    evaluateReadinessState({
      dbWritable: true,
      workerConfigured: true,
      workerReachable: false,
      postgisConfigured: true,
      postgisConnected: false,
    }).ready,
    false
  );
  assert.equal(
    evaluateReadinessState({
      dbWritable: true,
      workerConfigured: true,
      workerReachable: true,
      postgisConfigured: true,
      postgisConnected: false,
    }).ready,
    false
  );
});
