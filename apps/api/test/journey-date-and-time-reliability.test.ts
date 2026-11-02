import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidTimeString,
  parseTimeToMinutes,
  computeDurationMins,
  formatMinutes,
  addDaysToDate,
  calculateArrivalDate,
  evaluateConnectionFeasibility,
} from '../src/common/utils/railwayDateTime.js';
import {
  selectCandidateJunctions,
  COMMON_INTERCHANGE_JUNCTIONS,
} from '../src/modules/journeys/AlternativeJourneyService.js';

describe('Phase 3, 4, 5, 8 & 9 — Strict Time Validation, Overnight Rollovers & Junction Discovery Suite', () => {

  describe('Phase 5 — Strict 24-Hour Time Validation', () => {
    it('accepts valid 24-hour time boundaries (00:00 to 23:59)', () => {
      assert.equal(isValidTimeString('00:00'), true);
      assert.equal(isValidTimeString('00:59'), true);
      assert.equal(isValidTimeString('12:30'), true);
      assert.equal(isValidTimeString('23:59'), true);
      assert.equal(isValidTimeString('08:15'), true);
      assert.equal(isValidTimeString('8:15'), true);
      assert.equal(isValidTimeString('  16:45  '), true);
    });

    it('strictly rejects impossible hours, minutes, and malformed strings', () => {
      assert.equal(isValidTimeString('24:00'), false, '24:00 must be rejected');
      assert.equal(isValidTimeString('23:60'), false, '23:60 must be rejected');
      assert.equal(isValidTimeString('25:90'), false, '25:90 must be rejected');
      assert.equal(isValidTimeString('99:99'), false, '99:99 must be rejected');
      assert.equal(isValidTimeString('12:75'), false, '12:75 must be rejected');
      assert.equal(isValidTimeString('invalid'), false, 'invalid text must be rejected');
      assert.equal(isValidTimeString(null), false, 'null must be rejected');
      assert.equal(isValidTimeString(undefined), false, 'undefined must be rejected');
      assert.equal(isValidTimeString(''), false, 'empty string must be rejected');
      assert.equal(isValidTimeString('   '), false, 'whitespace must be rejected');
      assert.equal(isValidTimeString('12'), false, 'missing minutes must be rejected');
      assert.equal(isValidTimeString('12:'), false, 'trailing colon must be rejected');
      assert.equal(isValidTimeString(':45'), false, 'missing hour must be rejected');
    });

    it('parses valid times to minutes from midnight and returns null for invalid times', () => {
      assert.equal(parseTimeToMinutes('00:00'), 0);
      assert.equal(parseTimeToMinutes('01:30'), 90);
      assert.equal(parseTimeToMinutes('12:00'), 720);
      assert.equal(parseTimeToMinutes('23:59'), 1439);

      assert.equal(parseTimeToMinutes('24:00'), null);
      assert.equal(parseTimeToMinutes('25:90'), null);
      assert.equal(parseTimeToMinutes('invalid'), null);
      assert.equal(parseTimeToMinutes(null), null);
    });

    it('computes duration without producing NaN or negative values', () => {
      // Same day: 10:00 to 14:30 = 270 mins (4h 30m)
      assert.equal(computeDurationMins('10:00', '14:30'), 270);

      // Overnight midnight rollover: 22:00 to 06:00 = 480 mins (8h)
      assert.equal(computeDurationMins('22:00', '06:00'), 480);

      // Invalid inputs return null
      assert.equal(computeDurationMins('invalid', '14:30'), null);
      assert.equal(computeDurationMins('10:00', '25:90'), null);
      assert.equal(computeDurationMins(null as any, '14:30'), null);
    });

    it('formats duration minutes cleanly', () => {
      assert.equal(formatMinutes(45), '45m');
      assert.equal(formatMinutes(120), '2h');
      assert.equal(formatMinutes(125), '2h 05m');
      assert.equal(formatMinutes(150), '2h 30m');
      assert.equal(formatMinutes(null), 'Schedule Pending');
      assert.equal(formatMinutes(0), 'Schedule Pending');
      assert.equal(formatMinutes(-10), 'Schedule Pending');
    });
  });

  describe('Phase 4 — Overnight Journey and Multi-day Arrival Date Correction', () => {
    it('handles leap year calendar arithmetic correctly', () => {
      // 2024 is leap year
      assert.equal(addDaysToDate('2024-02-28', 1), '2024-02-29');
      assert.equal(addDaysToDate('2024-02-29', 1), '2024-03-01');
      // 2026 is non-leap year
      assert.equal(addDaysToDate('2026-02-28', 1), '2026-03-01');
    });

    it('handles year boundary calendar arithmetic correctly', () => {
      assert.equal(addDaysToDate('2026-12-31', 1), '2027-01-01');
    });

    it('calculates same-day arrival date when train arrives on departure date', () => {
      const depDate = '2026-11-10';
      const arrDate = calculateArrivalDate(depDate, '06:00', '18:00', 720);
      assert.equal(arrDate, '2026-11-10');
    });

    it('calculates next-day arrival date when train departs late and crosses midnight', () => {
      const depDate = '2026-11-10';
      // Departs 22:30, arrives 06:15 next morning (duration 465 mins / 7h 45m)
      const arrDate = calculateArrivalDate(depDate, '22:30', '06:15', 465);
      assert.equal(arrDate, '2026-11-11');
    });

    it('calculates multi-day arrival for long-distance journeys exceeding 24 hours', () => {
      const depDate = '2026-11-10';
      // Departs 08:00, duration is 1800 mins (30 hours) -> arrives next day at 14:00
      const arrDate1 = calculateArrivalDate(depDate, '08:00', '14:00', 1800);
      assert.equal(arrDate1, '2026-11-11');

      // Departs 10:00, duration is 3000 mins (50 hours / 2 days + 2 hours) -> arrives on day 3
      const arrDate2 = calculateArrivalDate(depDate, '10:00', '12:00', 3000);
      assert.equal(arrDate2, '2026-11-12');
    });

    it('preserves provider-supplied arrival date if valid and consistent', () => {
      const depDate = '2026-11-10';
      const arrDate = calculateArrivalDate(depDate, '20:00', '08:00', 720, '2026-11-11');
      assert.equal(arrDate, '2026-11-11');
    });
  });

  describe('Phase 3 — Connecting Journey Date Handling & Layover Feasibility', () => {
    it('evaluates same-day connecting journey with valid layover buffer', () => {
      // Leg 1 arrives on 2026-11-10 at 14:00
      // Leg 2 departs on 2026-11-10 at 16:30 (layover 150 mins / 2h 30m)
      const res = evaluateConnectionFeasibility('2026-11-10', '14:00', '16:30', 45, 480);
      assert.ok(res);
      assert.equal(res.isFeasible, true);
      assert.equal(res.leg2DepDate, '2026-11-10');
      assert.equal(res.layoverMinutes, 150);
    });

    it('evaluates overnight connecting journey when Leg 2 departs the following morning', () => {
      // Leg 1 arrives on 2026-11-10 at 23:15
      // Leg 2 departs at 02:45 next morning (layover 210 mins / 3h 30m)
      const res = evaluateConnectionFeasibility('2026-11-10', '23:15', '02:45', 45, 480);
      assert.ok(res);
      assert.equal(res.isFeasible, true);
      assert.equal(res.leg2DepDate, '2026-11-11', 'Leg 2 must board on the next calendar day');
      assert.equal(res.layoverMinutes, 210);
    });

    it('rejects connection when layover is below minimum safety buffer (< 45 mins)', () => {
      // Leg 1 arrives at 14:00, Leg 2 departs at 14:30 (layover 30 mins -> too tight)
      const res = evaluateConnectionFeasibility('2026-11-10', '14:00', '14:30', 45, 480);
      assert.equal(res, null, 'Layover < 45 mins must be rejected');
    });

    it('rejects connection when layover exceeds maximum constraint (> 8 hours / 480 mins)', () => {
      // Leg 1 arrives at 10:00, Leg 2 departs at 19:00 (layover 540 mins / 9h)
      const res = evaluateConnectionFeasibility('2026-11-10', '10:00', '19:00', 45, 480);
      assert.equal(res, null, 'Layover > 480 mins must be rejected');
    });
  });

  describe('Phase 8 & 9 — Same-Train Alternatives & Route-Aware Junction Discovery', () => {
    it('route-aware junction selection prioritizes North-South corridor hubs for NDLS <-> MAS', () => {
      const candidates = selectCandidateJunctions('NDLS', 'MAS');
      assert.ok(candidates.length > 0);
      assert.ok(candidates.length <= 5, 'Must limit candidate junctions to prevent excessive fanout');

      const codes = candidates.map((c) => c.code);
      assert.ok(codes.includes('BPL') || codes.includes('NGP') || codes.includes('ET') || codes.includes('VGLJ'));
      assert.ok(!codes.includes('NDLS'), 'Must exclude origin from candidate junctions');
      assert.ok(!codes.includes('MAS'), 'Must exclude destination from candidate junctions');
    });

    it('route-aware junction selection prioritizes East corridor hubs for NDLS <-> HWH', () => {
      const candidates = selectCandidateJunctions('NDLS', 'HWH');
      const codes = candidates.map((c) => c.code);
      assert.ok(codes.includes('CNB') || codes.includes('PCOI'));
      assert.ok(!codes.includes('NDLS'));
      assert.ok(!codes.includes('HWH'));
    });

    it('never includes origin or destination as an interchange junction', () => {
      for (const junc of COMMON_INTERCHANGE_JUNCTIONS) {
        const candidates = selectCandidateJunctions(junc.code, 'LKO');
        const codes = candidates.map((c) => c.code);
        assert.ok(!codes.includes(junc.code), `Origin ${junc.code} must not appear in candidates`);
      }
    });
  });
});
