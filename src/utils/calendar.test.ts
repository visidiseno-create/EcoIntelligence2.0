import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMonthGrid,
  validateCalendarEventInput,
  sortEventsByDateTime,
  summarizeCalendarEvents,
  formatMonthYearEs,
} from './calendar.ts';

test('buildMonthGrid builds Monday-first grid covering full month', () => {
  // November 2026 starts on Sunday (column index 6 in Monday-first layout) and has 30 days
  const grid = buildMonthGrid(2026, 10);
  assert.equal(grid.length, 42);
  assert.equal(grid[0].date, '2026-10-26');
  assert.equal(grid[0].isCurrentMonth, false);
  assert.equal(grid[6].date, '2026-11-01');
  assert.equal(grid[6].isCurrentMonth, true);
  const nov30 = grid.find((c) => c.date === '2026-11-30');
  assert.ok(nov30);
  assert.equal(nov30.isCurrentMonth, true);
});

test('formatMonthYearEs formats Spanish month and year labels', () => {
  assert.equal(formatMonthYearEs(2026, 10), 'Noviembre 2026');
  assert.equal(formatMonthYearEs(2026, 0), 'Enero 2026');
});

test('validateCalendarEventInput validates required fields, time range, and categories', () => {
  const valid = validateCalendarEventInput({
    title: 'Reunión Comité ESG',
    category: 'reunion',
    date: '2026-11-18',
    startTime: '09:30',
    endTime: '11:00',
    location: 'Sala Directorio - Planta Lima',
    responsible: 'Ing. Claudia Mendoza',
    description: 'Revisión trimestral de indicadores hídricos y matriz legal.',
  });
  assert.equal(valid.valid, true);
  if (valid.valid) {
    assert.equal(valid.data.status, 'programada');
    assert.equal(valid.data.category, 'reunion');
  }

  const invalidTimeOrder = validateCalendarEventInput({
    title: 'Visita Técnica',
    category: 'visita_tecnica',
    date: '2026-11-18',
    startTime: '14:00',
    endTime: '12:00',
    description: 'Evaluación de planta de tratamiento.',
  });
  assert.equal(invalidTimeOrder.valid, false);

  const invalidDate = validateCalendarEventInput({
    title: 'Viaje Técnico',
    category: 'viaje',
    date: '2026-02-30',
    startTime: '08:00',
    description: 'Traslado a sede Arequipa.',
  });
  assert.equal(invalidDate.valid, false);

  const invalidCategory = validateCalendarEventInput({
    title: 'Actividad X',
    category: 'fiesta',
    date: '2026-11-18',
    startTime: '08:00',
    description: 'Descripción válida.',
  });
  assert.equal(invalidCategory.valid, false);
});

test('sortEventsByDateTime sorts chronologically by date, startTime, then title', () => {
  const sorted = sortEventsByDateTime([
    { date: '2026-11-20', startTime: '09:00', title: 'B' },
    { date: '2026-11-18', startTime: '15:00', title: 'C' },
    { date: '2026-11-18', startTime: '08:30', title: 'A' },
  ]);
  assert.deepEqual(
    sorted.map((x) => `${x.date} ${x.startTime}`),
    ['2026-11-18 08:30', '2026-11-18 15:00', '2026-11-20 09:00']
  );
});

test('summarizeCalendarEvents counts totals, active/completed, and each category', () => {
  const summary = summarizeCalendarEvents([
    { category: 'reunion', status: 'programada' },
    { category: 'visita_tecnica', status: 'en_curso' },
    { category: 'viaje', status: 'completada' },
    { category: 'inspeccion', status: 'completada' },
    { category: 'charla', status: 'cancelada' },
  ]);
  assert.equal(summary.total, 5);
  assert.equal(summary.active, 2);
  assert.equal(summary.completed, 2);
  assert.equal(summary.byCategory.reunion, 1);
  assert.equal(summary.byCategory.visita_tecnica, 1);
  assert.equal(summary.byCategory.viaje, 1);
  assert.equal(summary.byCategory.inspeccion, 1);
  assert.equal(summary.byCategory.charla, 1);
});
