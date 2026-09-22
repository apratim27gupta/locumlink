import {
  parseClockTimeHm,
  utcDateTimePartsToMs,
  browseShiftStartActiveSql,
  parseJobDates,
  parseJobShifts,
  parseJobShiftsSlots,
  addClockHours,
  computeMatchFeeAmountCents,
  computeApplicationClaimedHours,
  clockTimeToDbTime,
  dbTimeToClockString,
  expandCalendarDateRange,
  getPostingRequiredDates,
  isPostingFullyCovered,
  finalizeAcceptDates,
  finalizeAcceptShiftIds,
  availabilityAfterFinalize,
} from './job-schedule.util';

const utcDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

describe('job-schedule.util', () => {
  describe('parseClockTimeHm', () => {
    it('parses HH:mm stored in the DB', () => {
      expect(parseClockTimeHm('17:30')).toEqual({ hours: 17, minutes: 30 });
      expect(parseClockTimeHm('9:05')).toEqual({ hours: 9, minutes: 5 });
      expect(parseClockTimeHm('09:05:00')).toEqual({ hours: 9, minutes: 5 });
    });

    it('matches HH:mm prefix even when suffix text is present', () => {
      expect(parseClockTimeHm('9:30 AM')).toEqual({ hours: 9, minutes: 30 });
      expect(parseClockTimeHm('')).toBeNull();
      expect(parseClockTimeHm(null)).toBeNull();
    });
  });

  describe('utcDateTimePartsToMs', () => {
    it('combines UTC calendar date and clock time', () => {
      const ms = utcDateTimePartsToMs('2026-06-20', '17:30');
      expect(ms).toBe(Date.UTC(2026, 5, 20, 17, 30, 0, 0));
    });
  });

  describe('parseJobDates', () => {
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    it('de-duplicates, sorts, and derives the min/max span', () => {
      const result = parseJobDates(
        ['2999-06-20', '2999-06-18', '2999-06-20', '2999-06-25'],
        { allowPast: true },
      );
      expect(result.dates.map(iso)).toEqual([
        '2999-06-18',
        '2999-06-20',
        '2999-06-25',
      ]);
      expect(iso(result.startDate)).toBe('2999-06-18');
      expect(iso(result.endDate)).toBe('2999-06-25');
    });

    it('stores each date as UTC midnight', () => {
      const [date] = parseJobDates(['2999-06-20'], { allowPast: true }).dates;
      expect(date.getTime()).toBe(Date.UTC(2999, 5, 20));
    });

    it('rejects an empty list', () => {
      expect(() => parseJobDates([], { allowPast: true })).toThrow();
    });

    it('rejects malformed dates', () => {
      expect(() => parseJobDates(['not-a-date'], { allowPast: true })).toThrow();
    });

    it('rejects past dates unless allowPast is set', () => {
      expect(() => parseJobDates(['2000-01-01'])).toThrow();
      expect(() =>
        parseJobDates(['2000-01-01'], { allowPast: true }),
      ).not.toThrow();
    });
  });

  describe('clockTimeToDbTime / dbTimeToClockString', () => {
    it('round-trips HH:mm through a UTC @db.Time value', () => {
      const dt = clockTimeToDbTime('13:45');
      expect(dt).not.toBeNull();
      expect(dt!.toISOString()).toBe('1970-01-01T13:45:00.000Z');
      expect(dbTimeToClockString(dt)).toBe('13:45');
    });

    it('returns null for blank/invalid input', () => {
      expect(clockTimeToDbTime('')).toBeNull();
      expect(clockTimeToDbTime(null)).toBeNull();
      expect(dbTimeToClockString(null)).toBeNull();
    });
  });

  describe('parseJobShifts', () => {
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    it('sorts, de-dupes (last wins), and derives span + posting-level times', () => {
      const result = parseJobShifts(
        [
          { date: '2999-06-20', startTime: '10:00', endTime: '14:00' },
          { date: '2999-06-18', startTime: '09:00', endTime: '17:00' },
          { date: '2999-06-20', startTime: '11:00', endTime: '15:00' },
        ],
        { allowPast: true },
      );
      expect(result.shifts.map((s) => iso(s.date))).toEqual([
        '2999-06-18',
        '2999-06-20',
      ]);
      expect(result.shifts[1].startTime).toBe('11:00');
      expect(iso(result.startDate)).toBe('2999-06-18');
      expect(iso(result.endDate)).toBe('2999-06-20');
      expect(result.startTime).toBe('09:00');
      expect(result.endTime).toBe('15:00');
    });

    it('allows shifts without times (null)', () => {
      const result = parseJobShifts([{ date: '2999-06-18' }], {
        allowPast: true,
      });
      expect(result.shifts[0].startTime).toBeNull();
      expect(result.shifts[0].endTime).toBeNull();
    });

    it('rejects an empty list, bad dates, and bad times', () => {
      expect(() => parseJobShifts([], { allowPast: true })).toThrow();
      expect(() =>
        parseJobShifts([{ date: 'nope' }], { allowPast: true }),
      ).toThrow();
      expect(() =>
        parseJobShifts([{ date: '2999-06-18', startTime: '99:99' }], {
          allowPast: true,
        }),
      ).toThrow();
    });

    it('rejects past dates unless allowPast is set', () => {
      expect(() => parseJobShifts([{ date: '2000-01-01' }])).toThrow();
    });
  });

  describe('parseJobShiftsSlots', () => {
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    it('computes end time from start + slot kind', () => {
      expect(addClockHours('08:00', 3.5)).toBe('11:30');
      expect(addClockHours('08:00', 7)).toBe('15:00');
      const result = parseJobShiftsSlots(
        [{ date: '2999-06-18', startTime: '08:00', slotKind: 'HALF' }],
        { allowPast: true },
      );
      expect(result.shifts[0].endTime).toBe('11:30');
      expect(result.shifts[0].slotKind).toBe('HALF');
      expect(iso(result.startDate)).toBe('2999-06-18');
    });

    it('allows two half slots on one day and rejects full+half mix', () => {
      const twoHalves = parseJobShiftsSlots(
        [
          { date: '2999-06-18', startTime: '08:00', slotKind: 'HALF' },
          { date: '2999-06-18', startTime: '12:00', slotKind: 'HALF' },
        ],
        { allowPast: true },
      );
      expect(twoHalves.shifts).toHaveLength(2);
      expect(() =>
        parseJobShiftsSlots(
          [
            { date: '2999-06-18', startTime: '08:00', slotKind: 'FULL' },
            { date: '2999-06-18', startTime: '12:00', slotKind: 'HALF' },
          ],
          { allowPast: true },
        ),
      ).toThrow(/not both/i);
    });

    it('rejects overlapping halves', () => {
      expect(() =>
        parseJobShiftsSlots(
          [
            { date: '2999-06-18', startTime: '08:00', slotKind: 'HALF' },
            { date: '2999-06-18', startTime: '10:00', slotKind: 'HALF' },
          ],
          { allowPast: true },
        ),
      ).toThrow(/overlap/i);
    });
  });

  describe('match fee hours', () => {
    it('tiers at 3.5 hours', () => {
      expect(computeMatchFeeAmountCents(0)).toBe(12500);
      expect(computeMatchFeeAmountCents(3.5)).toBe(12500);
      expect(computeMatchFeeAmountCents(3.51)).toBe(25000);
      expect(computeMatchFeeAmountCents(7)).toBe(25000);
    });

    it('sums claimed hours for SLOTS and LEGACY', () => {
      const slotsPosting = {
        scheduleModel: 'SLOTS',
        shifts: [
          {
            id: 's1',
            date: utcDate('2999-06-01'),
            shiftType: 'HALF_DAY',
            startTime: '08:00',
            endTime: '11:30',
          },
          {
            id: 's2',
            date: utcDate('2999-06-01'),
            shiftType: 'HALF_DAY',
            startTime: '12:00',
            endTime: '15:30',
          },
        ],
      };
      expect(
        computeApplicationClaimedHours(slotsPosting, {
          shiftClaims: [{ shiftId: 's1' }],
        }),
      ).toBe(3.5);
      expect(
        computeApplicationClaimedHours(slotsPosting, {
          shiftClaims: [{ shiftId: 's1' }, { shiftId: 's2' }],
        }),
      ).toBe(7);

      const legacy = {
        scheduleModel: 'LEGACY',
        startTime: '08:00',
        endTime: '11:30',
        shifts: [{ date: utcDate('2999-06-01') }],
      };
      expect(
        computeApplicationClaimedHours(legacy, {
          availabilityKind: 'FULL',
          availableDates: [],
        }),
      ).toBe(3.5);
    });

    it('covers SLOTS by shift ids', () => {
      const posting = {
        scheduleModel: 'SLOTS',
        shifts: [
          { id: 'a', date: utcDate('2999-06-01') },
          { id: 'b', date: utcDate('2999-06-01') },
        ],
      };
      expect(
        isPostingFullyCovered(posting, [
          { shiftClaims: [{ shiftId: 'a' }] },
        ]),
      ).toBe(false);
      expect(
        isPostingFullyCovered(posting, [
          { shiftClaims: [{ shiftId: 'a' }] },
          { shiftClaims: [{ shiftId: 'b' }] },
        ]),
      ).toBe(true);
      expect(
        finalizeAcceptShiftIds(
          { requestedShiftIds: ['a', 'b'] },
          posting,
          [{ shiftClaims: [{ shiftId: 'a' }] }],
        ),
      ).toEqual(['b']);
    });
  });

  describe('coverage helpers', () => {
    it('expands a continuous @db.Date range inclusively', () => {
      expect(expandCalendarDateRange(utcDate('2999-06-01'), utcDate('2999-06-03'))).toEqual([
        '2999-06-01',
        '2999-06-02',
        '2999-06-03',
      ]);
      expect(expandCalendarDateRange(utcDate('2999-06-03'), utcDate('2999-06-01'))).toEqual([]);
    });

    it('gets required days from shifts, else from the range', () => {
      expect(
        getPostingRequiredDates({ shifts: [{ date: utcDate('2999-06-05') }, { date: utcDate('2999-06-01') }] }),
      ).toEqual(['2999-06-01', '2999-06-05']);
      expect(
        getPostingRequiredDates({ startDate: utcDate('2999-06-01'), endDate: utcDate('2999-06-02'), shifts: [] }),
      ).toEqual(['2999-06-01', '2999-06-02']);
    });

    it('is fully covered by a single FULL application', () => {
      const posting = { shifts: [{ date: utcDate('2999-06-01') }, { date: utcDate('2999-06-02') }] };
      expect(isPostingFullyCovered(posting, [{ availabilityKind: 'FULL', availableDates: [] }])).toBe(true);
    });

    it('needs partial applications to union-cover every day', () => {
      const posting = {
        shifts: [
          { date: utcDate('2999-06-01') },
          { date: utcDate('2999-06-02') },
          { date: utcDate('2999-06-03') },
        ],
      };
      const partialA = { availabilityKind: 'PARTIAL', availableDates: ['2999-06-01', '2999-06-02'] };
      const partialB = { availabilityKind: 'PARTIAL', availableDates: ['2999-06-03'] };
      expect(isPostingFullyCovered(posting, [partialA])).toBe(false);
      expect(isPostingFullyCovered(posting, [partialA, partialB])).toBe(true);
    });

    it('gives overlapping days to the first accepter', () => {
      const required = ['2999-06-01', '2999-06-02', '2999-06-03'];
      const first = {
        availabilityKind: 'PARTIAL',
        availableDates: ['2999-06-01', '2999-06-02'],
      };
      const second = {
        availabilityKind: 'PARTIAL',
        availableDates: ['2999-06-02', '2999-06-03'],
      };
      expect(finalizeAcceptDates(first, required, [])).toEqual([
        '2999-06-01',
        '2999-06-02',
      ]);
      expect(finalizeAcceptDates(second, required, [first])).toEqual([
        '2999-06-03',
      ]);
      expect(finalizeAcceptDates(second, required, [first, { ...second, availableDates: ['2999-06-03'] }])).toEqual([]);
      expect(availabilityAfterFinalize(required, ['2999-06-03'])).toEqual({
        availabilityKind: 'PARTIAL',
        availableDates: ['2999-06-03'],
      });
      expect(availabilityAfterFinalize(required, required)).toEqual({
        availabilityKind: 'FULL',
        availableDates: [],
      });
      expect(availabilityAfterFinalize(required, required, 'PARTIAL')).toEqual({
        availabilityKind: 'PARTIAL',
        availableDates: required,
      });
    });
  });

  describe('browseShiftStartActiveSql', () => {
    it('returns a Prisma SQL fragment', () => {
      const sql = browseShiftStartActiveSql();
      expect(sql).toBeDefined();
      expect(typeof sql.text).toBe('string');
      expect(sql.text).toContain('start_date IS NULL');
      expect(sql.text).toContain("TIME '23:59:59'");
    });
  });
});
