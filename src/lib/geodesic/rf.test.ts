import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESERT_PRESETS,
  analyzeVhfLink,
  computeBearingDeg,
  computeFsplDb,
  haversineDistanceKm,
  interpolateRoute,
} from './rf';

test('Haversine distance and bearing compute accurate geodesic values', () => {
  const preset = DESERT_PRESETS[0];
  const dist = haversineDistanceKm(preset.clinic, preset.townPost);
  assert.ok(dist > 30 && dist < 40, `Expected ~34 km, got ${dist}`);

  const bearing = computeBearingDeg(preset.clinic, preset.townPost);
  assert.ok(bearing > 330 && bearing < 355, `Expected NNW bearing, got ${bearing}`);
});

test('FSPL increases accurately with distance at 146.52 MHz', () => {
  const loss10 = computeFsplDb(10, 146.52);
  const loss20 = computeFsplDb(20, 146.52);
  assert.ok(Math.abs(loss20 - loss10 - 6.02) < 0.05);
});

test('Canyon ridge blocks direct VHF LOS when Medic enters canyon shadow without repeater', () => {
  const preset = DESERT_PRESETS[0];
  // Place Medic just south-east behind the canyon ridge relative to Town Post
  const shadowedMedic = { lat: 24.952, lon: 55.535, elevationM: 150 };
  const directBlocked = analyzeVhfLink(shadowedMedic, preset.townPost, preset, false);
  assert.equal(directBlocked.obstructed, true);
  assert.ok(directBlocked.diffractionLossDb > 15);
  assert.equal(directBlocked.linkQuality, 'BLOCKED');

  // With Hilltop Repeater enabled, link recovers
  const viaRepeater = analyzeVhfLink(shadowedMedic, preset.townPost, preset, true);
  assert.equal(viaRepeater.viaRepeater, true);
  assert.ok(viaRepeater.rxSignalDbm > directBlocked.rxSignalDbm);
});

test('Route interpolation clamps cleanly at start and end waypoints', () => {
  const wps = DESERT_PRESETS[0].waypoints;
  const start = interpolateRoute(wps, 0);
  const end = interpolateRoute(wps, 1);
  assert.equal(start.coord.lat, wps[0].lat);
  assert.equal(end.coord.lat, wps[wps.length - 1].lat);
  assert.ok(end.totalKm > 30);
});
