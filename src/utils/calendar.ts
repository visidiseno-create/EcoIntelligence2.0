export type CalendarEventCategory =
  | 'reunion'
  | 'visita_tecnica'
  | 'viaje'
  | 'inspeccion'
  | 'charla';

export type CalendarEventStatus =
  | 'programada'
  | 'en_curso'
  | 'completada'
  | 'cancelada';

export interface CalendarEventItem {
  id: string;
  orgId: string;
  facilityId?: string;
  title: string;
  category: CalendarEventCategory;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime?: string; // HH:MM
  location: string;
  responsible: string;
  participants?: string;
  description: string;
  status: CalendarEventStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarGridCell {
  date: string; // YYYY-MM-DD
  dayNumber: number;
  isCurrentMonth: boolean;
}

export interface CalendarEventInput {
  title?: unknown;
  category?: unknown;
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  facilityId?: unknown;
  location?: unknown;
  responsible?: unknown;
  participants?: unknown;
  description?: unknown;
  status?: unknown;
}

export interface CalendarCategoryMeta {
  value: CalendarEventCategory;
  label: string;
  shortLabel: string;
  badgeClass: string;
  dotClass: string;
}

export const CALENDAR_CATEGORY_META: Record<CalendarEventCategory, CalendarCategoryMeta> = {
  reunion: {
    value: 'reunion',
    label: 'Reunión',
    shortLabel: 'Reunión',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    dotClass: 'bg-sky-600',
  },
  visita_tecnica: {
    value: 'visita_tecnica',
    label: 'Visita Técnica',
    shortLabel: 'Visita Téc.',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dotClass: 'bg-emerald-600',
  },
  viaje: {
    value: 'viaje',
    label: 'Viaje',
    shortLabel: 'Viaje',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    dotClass: 'bg-amber-600',
  },
  inspeccion: {
    value: 'inspeccion',
    label: 'Inspección',
    shortLabel: 'Inspección',
    badgeClass: 'bg-violet-50 text-violet-800 border-violet-200',
    dotClass: 'bg-violet-600',
  },
  charla: {
    value: 'charla',
    label: 'Charla / Capacitación',
    shortLabel: 'Charla',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
    dotClass: 'bg-teal-600',
  },
};

export const CALENDAR_STATUS_META: Record<
  CalendarEventStatus,
  { label: string; badgeClass: string }
> = {
  programada: {
    label: 'Programada',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  en_curso: {
    label: 'En Curso',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  completada: {
    label: 'Completada',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  cancelada: {
    label: 'Cancelada',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

const VALID_CATEGORIES = new Set<CalendarEventCategory>([
  'reunion',
  'visita_tecnica',
  'viaje',
  'inspeccion',
  'charla',
]);

const VALID_STATUSES = new Set<CalendarEventStatus>([
  'programada',
  'en_curso',
  'completada',
  'cancelada',
]);

const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

export function formatMonthYearEs(year: number, monthIndex: number): string {
  const safeMonth = ((monthIndex % 12) + 12) % 12;
  return `${MONTH_NAMES_ES[safeMonth]} ${year}`;
}

/**
 * Builds a 6-week (or 5-week when exact) Monday-first calendar grid for a given year and 0-based monthIndex.
 */
export function buildMonthGrid(year: number, monthIndex: number): CalendarGridCell[] {
  const firstDayOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  // Convert Sunday=0..Saturday=6 into Monday=0..Sunday=6
  const startWeekday = (firstDayOfMonth.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const totalNeeded = startWeekday + daysInMonth;
  const totalCells = totalNeeded <= 35 ? 35 : 42;

  const cells: CalendarGridCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - startWeekday + 1;
    const cellDate = new Date(Date.UTC(year, monthIndex, dayOffset));
    const cellYear = cellDate.getUTCFullYear();
    const cellMonth = cellDate.getUTCMonth();
    const cellDay = cellDate.getUTCDate();

    cells.push({
      date: formatIsoDate(cellYear, cellMonth, cellDay),
      dayNumber: cellDay,
      isCurrentMonth: cellYear === year && cellMonth === monthIndex,
    });
  }

  return cells;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yStr, mStr, dStr] = value.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function isValidTimeHHMM(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hStr, mStr] = value.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

export function validateCalendarEventInput(input: CalendarEventInput):
  | {
      valid: true;
      data: {
        title: string;
        category: CalendarEventCategory;
        date: string;
        startTime: string;
        endTime?: string;
        facilityId?: string;
        location: string;
        responsible: string;
        participants?: string;
        description: string;
        status: CalendarEventStatus;
      };
    }
  | { valid: false; error: string } {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title.length < 3) {
    return { valid: false, error: 'El título debe tener al menos 3 caracteres.' };
  }

  const category = typeof input.category === 'string' ? input.category.trim() : '';
  if (!VALID_CATEGORIES.has(category as CalendarEventCategory)) {
    return {
      valid: false,
      error: 'Tipo de actividad inválido. Seleccione reunión, visita técnica, viaje, inspección o charla.',
    };
  }

  const date = typeof input.date === 'string' ? input.date.trim() : '';
  if (!isValidIsoDate(date)) {
    return { valid: false, error: 'La fecha debe tener formato válido YYYY-MM-DD.' };
  }

  const startTime = typeof input.startTime === 'string' ? input.startTime.trim() : '';
  if (!isValidTimeHHMM(startTime)) {
    return { valid: false, error: 'La hora de inicio debe tener formato válido HH:MM (24h).' };
  }

  const rawEndTime = typeof input.endTime === 'string' ? input.endTime.trim() : '';
  let endTime: string | undefined;
  if (rawEndTime) {
    if (!isValidTimeHHMM(rawEndTime)) {
      return { valid: false, error: 'La hora de término debe tener formato válido HH:MM (24h).' };
    }
    if (rawEndTime < startTime) {
      return {
        valid: false,
        error: 'La hora de término no puede ser anterior a la hora de inicio.',
      };
    }
    endTime = rawEndTime;
  }

  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length < 5) {
    return {
      valid: false,
      error: 'La descripción de la actividad debe tener al menos 5 caracteres.',
    };
  }

  const location =
    typeof input.location === 'string' && input.location.trim().length > 0
      ? input.location.trim()
      : 'Por definir';

  const responsible =
    typeof input.responsible === 'string' && input.responsible.trim().length > 0
      ? input.responsible.trim()
      : 'Equipo Ambiental';

  const rawStatus = typeof input.status === 'string' ? input.status.trim() : 'programada';
  const status: CalendarEventStatus = VALID_STATUSES.has(rawStatus as CalendarEventStatus)
    ? (rawStatus as CalendarEventStatus)
    : 'programada';

  const facilityId =
    typeof input.facilityId === 'string' && input.facilityId.trim().length > 0
      ? input.facilityId.trim()
      : undefined;

  const participants =
    typeof input.participants === 'string' && input.participants.trim().length > 0
      ? input.participants.trim()
      : undefined;

  return {
    valid: true,
    data: {
      title,
      category: category as CalendarEventCategory,
      date,
      startTime,
      endTime,
      facilityId,
      location,
      responsible,
      participants,
      description,
      status,
    },
  };
}

export function sortEventsByDateTime<T extends Pick<CalendarEventItem, 'date' | 'startTime' | 'title'>>(
  events: T[]
): T[] {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
    return a.title.localeCompare(b.title);
  });
}

export interface CalendarSummaryCounts {
  total: number;
  active: number;
  completed: number;
  byCategory: Record<CalendarEventCategory, number>;
}

export function summarizeCalendarEvents(
  events: Array<Pick<CalendarEventItem, 'category' | 'status'>>
): CalendarSummaryCounts {
  const byCategory: Record<CalendarEventCategory, number> = {
    reunion: 0,
    visita_tecnica: 0,
    viaje: 0,
    inspeccion: 0,
    charla: 0,
  };

  let active = 0;
  let completed = 0;

  for (const ev of events) {
    if (ev.category in byCategory) {
      byCategory[ev.category] += 1;
    }
    if (ev.status === 'programada' || ev.status === 'en_curso') {
      active += 1;
    } else if (ev.status === 'completada') {
      completed += 1;
    }
  }

  return {
    total: events.length,
    active,
    completed,
    byCategory,
  };
}
