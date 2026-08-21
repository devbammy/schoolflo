const {
  __test__: { buildAttention },
} = require('../../src/services/adminOverviewService');

/**
 * The attention worklist is the whole point of the admin overview: it decides
 * what an admin sees first, and a wrong ranking means a school chases unmarked
 * registers while ₦2m sits uncollected. It is pure — signals in, ranked list
 * out — so it is worth pinning down precisely.
 */

const quietSignals = () => ({
  context: { term: 'First Term', academicYear: '2024/2025', hasCalendar: true },
  attendance: {
    Present: 380,
    Absent: 12,
    Late: 8,
    Excused: 0,
    marked: 400,
    rate: 97,
    baselineRate: 96.5,
    delta: 0.5,
    classesMarked: 6,
    classesTotal: 6,
    unmarkedClasses: [],
    isSchoolDay: true,
  },
  fees: {
    billed: 1000,
    collected: 950,
    outstanding: 50,
    collectionRate: 95,
    studentsOwing: 1,
    overdue: { students: 0, amount: 0, structures: [] },
    hasStructures: true,
  },
  academics: {
    staleSubmissions: 0,
    unpublishedResults: 0,
    closedAssignments: 0,
  },
  comms: { stuckAnnouncements: 0 },
});

const idsOf = (items) => items.map((i) => i.id);

describe('buildAttention', () => {
  it('returns nothing when the school is running normally', () => {
    expect(buildAttention(quietSignals())).toEqual([]);
  });

  it('ranks critical items above warnings above info', () => {
    const s = quietSignals();
    s.comms.stuckAnnouncements = 3; // info
    s.academics.unpublishedResults = 40; // warning
    s.fees.overdue = { students: 20, amount: 500000, structures: [] }; // critical

    expect(idsOf(buildAttention(s))).toEqual([
      'fees-overdue',
      'unpublished-results',
      'stuck-announcements',
    ]);
  });

  it('every item carries an action the admin can click', () => {
    const s = quietSignals();
    s.context.hasCalendar = false;
    s.attendance.unmarkedClasses = [{ name: 'JSS1' }];
    s.attendance.classesMarked = 5;
    s.fees.overdue = { students: 4, amount: 90000, structures: [] };
    s.academics.staleSubmissions = 9;
    s.academics.unpublishedResults = 2;
    s.comms.stuckAnnouncements = 1;

    const items = buildAttention(s);
    expect(items.length).toBeGreaterThan(4);
    items.forEach((item) => {
      expect(item.action.to).toMatch(/^\/admin\//);
      expect(item.action.label).toBeTruthy();
      expect(item.title).toBeTruthy();
    });
  });

  describe('attendance', () => {
    it('escalates to critical when no class has marked a register', () => {
      const s = quietSignals();
      s.attendance.classesMarked = 0;
      s.attendance.unmarkedClasses = [
        { name: 'JSS1' },
        { name: 'JSS2' },
        { name: 'SS1' },
      ];

      const item = buildAttention(s).find(
        (i) => i.id === 'attendance-unmarked',
      );
      expect(item.severity).toBe('critical');
      expect(item.detail).toBe('JSS1, JSS2, SS1.');
    });

    it('summarises rather than lists when many classes are outstanding', () => {
      const s = quietSignals();
      s.attendance.classesMarked = 1;
      s.attendance.unmarkedClasses = ['A', 'B', 'C', 'D', 'E', 'F'].map(
        (n) => ({
          name: n,
        }),
      );

      const item = buildAttention(s).find(
        (i) => i.id === 'attendance-unmarked',
      );
      expect(item.detail).toBe('A, B, C, D and 2 more.');
    });

    it('stays silent on a non-school day', () => {
      const s = quietSignals();
      s.attendance.isSchoolDay = false;
      s.attendance.classesMarked = 0;
      s.attendance.unmarkedClasses = [{ name: 'JSS1' }];

      expect(idsOf(buildAttention(s))).not.toContain('attendance-unmarked');
    });

    it('flags a dip only once it clears the noise threshold', () => {
      const s = quietSignals();
      s.attendance.rate = 92.5;
      s.attendance.delta = -4;
      expect(idsOf(buildAttention(s))).not.toContain('attendance-dip');

      s.attendance.delta = -6;
      expect(
        buildAttention(s).find((i) => i.id === 'attendance-dip').severity,
      ).toBe('warning');

      s.attendance.delta = -12;
      expect(
        buildAttention(s).find((i) => i.id === 'attendance-dip').severity,
      ).toBe('critical');
    });

    it('does not report a dip when there is no register to compare', () => {
      const s = quietSignals();
      s.attendance.marked = 0;
      s.attendance.delta = -30;
      expect(idsOf(buildAttention(s))).not.toContain('attendance-dip');
    });
  });

  describe('fees', () => {
    it('names the largest overdue structure so the admin knows where to start', () => {
      const s = quietSignals();
      s.fees.overdue = {
        students: 31,
        amount: 1250000,
        structures: [
          { title: 'JSS1 Tuition', amount: 900000 },
          { title: 'SS1 Tuition', amount: 350000 },
        ],
      };

      const item = buildAttention(s).find((i) => i.id === 'fees-overdue');
      expect(item.title).toContain('₦1,250,000');
      expect(item.title).toContain('31 students');
      expect(item.detail).toContain('JSS1 Tuition');
    });

    it('reports slow collection only when nothing is actually overdue', () => {
      const s = quietSignals();
      s.fees.collectionRate = 40;
      s.fees.outstanding = 600000;
      s.fees.studentsOwing = 55;
      expect(idsOf(buildAttention(s))).toContain('fees-slow');

      // An overdue balance is the sharper problem; it replaces the soft one
      // rather than stacking a second fees row on top of it.
      s.fees.overdue = { students: 55, amount: 600000, structures: [] };
      const ids = idsOf(buildAttention(s));
      expect(ids).toContain('fees-overdue');
      expect(ids).not.toContain('fees-slow');
    });

    it('asks for a fee structure before complaining about collection', () => {
      const s = quietSignals();
      s.fees.hasStructures = false;
      s.fees.collectionRate = 0;

      const ids = idsOf(buildAttention(s));
      expect(ids).toContain('fees-unset');
      expect(ids).not.toContain('fees-slow');
      expect(ids).not.toContain('fees-overdue');
    });
  });

  it('treats a missing calendar as critical — every date depends on it', () => {
    const s = quietSignals();
    s.context.hasCalendar = false;

    const items = buildAttention(s);
    expect(items[0].id).toBe('calendar-missing');
    expect(items[0].severity).toBe('critical');
  });

  it('escalates ungraded work from FYI to warning once the backlog is real', () => {
    const s = quietSignals();
    s.academics.staleSubmissions = 12;
    expect(
      buildAttention(s).find((i) => i.id === 'ungraded-submissions').severity,
    ).toBe('info');

    s.academics.staleSubmissions = 51;
    expect(
      buildAttention(s).find((i) => i.id === 'ungraded-submissions').severity,
    ).toBe('warning');
  });
});
