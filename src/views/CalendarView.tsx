import React, { useState, useMemo, useEffect } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Clock,
  MapPin,
  User,
  Users,
  Edit2,
  Trash2,
  CheckCircle2,
  X,
  List,
  LayoutGrid,
  Filter
} from 'lucide-react';
import {
  api,
  Facility,
  CalendarEventItem,
  CalendarEventCategory,
  CalendarEventStatus
} from '../services/api';
import {
  buildMonthGrid,
  formatMonthYearEs,
  sortEventsByDateTime,
  summarizeCalendarEvents,
  validateCalendarEventInput,
  CALENDAR_CATEGORY_META,
  CALENDAR_STATUS_META
} from '../utils/calendar';
import { ModuleEvidencePanel } from '../components/ModuleEvidencePanel';
import { useFeedback } from '../components/FeedbackContext';

interface CalendarViewProps {
  events: CalendarEventItem[];
  facilities: Facility[];
  onRefresh: () => void;
  canEdit: boolean;
  userRole?: string;
  activeOrgId?: string;
}

const WEEKDAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const CATEGORIES: CalendarEventCategory[] = [
  'reunion',
  'visita_tecnica',
  'viaje',
  'inspeccion',
  'charla'
];
const STATUSES: CalendarEventStatus[] = [
  'programada',
  'en_curso',
  'completada',
  'cancelada'
];

function getInitialCalendarAnchor(): { year: number; month: number; dateIso: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return {
    year: y,
    month: m,
    dateIso: `${y}-${pad(m + 1)}-${pad(d)}`
  };
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  events,
  facilities,
  onRefresh,
  canEdit,
  userRole = 'admin',
  activeOrgId
}) => {
  const { showToast, confirmAction } = useFeedback();
  const initialAnchor = useMemo(() => getInitialCalendarAnchor(), []);

  const [currentYear, setCurrentYear] = useState(initialAnchor.year);
  const [currentMonth, setCurrentMonth] = useState(initialAnchor.month); // 0-indexed
  const [selectedDate, setSelectedDate] = useState(initialAnchor.dateIso);
  const [viewMode, setViewMode] = useState<'month' | 'list'>('month');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [facilityFilter, setFacilityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modal & Form State
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventItem | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<CalendarEventCategory>('reunion');
  const [date, setDate] = useState(initialAnchor.dateIso);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:30');
  const [facilityId, setFacilityId] = useState('');
  const [location, setLocation] = useState('');
  const [responsible, setResponsible] = useState('');
  const [participants, setParticipants] = useState('');
  const [status, setStatus] = useState<CalendarEventStatus>('programada');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset facility filter & close modal cleanly when active organization changes
  useEffect(() => {
    setFacilityFilter('all');
    setShowModal(false);
    setEditingEvent(null);
  }, [activeOrgId]);

  const facilityMap = useMemo(() => {
    const map = new Map<string, Facility>();
    for (const f of facilities) {
      map.set(f.id, f);
    }
    return map;
  }, [facilities]);

  const activeMonthPrefix = useMemo(() => {
    const m = currentMonth + 1;
    return `${currentYear}-${m < 10 ? `0${m}` : String(m)}`;
  }, [currentYear, currentMonth]);

  // Events filtered by search, category, facility, status (across months for list or current month KPIs)
  const filteredEvents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sortEventsByDateTime(
      events.filter((ev) => {
        if (categoryFilter !== 'all' && ev.category !== categoryFilter) return false;
        if (facilityFilter !== 'all' && ev.facilityId !== facilityFilter) return false;
        if (statusFilter !== 'all' && ev.status !== statusFilter) return false;
        if (term) {
          const hit =
            ev.title.toLowerCase().includes(term) ||
            ev.description.toLowerCase().includes(term) ||
            ev.responsible.toLowerCase().includes(term) ||
            ev.location.toLowerCase().includes(term) ||
            (ev.participants && ev.participants.toLowerCase().includes(term));
          if (!hit) return false;
        }
        return true;
      })
    );
  }, [events, categoryFilter, facilityFilter, statusFilter, searchTerm]);

  const monthFilteredEvents = useMemo(
    () => filteredEvents.filter((ev) => ev.date.startsWith(activeMonthPrefix)),
    [filteredEvents, activeMonthPrefix]
  );

  const monthSummary = useMemo(
    () => summarizeCalendarEvents(events.filter((ev) => ev.date.startsWith(activeMonthPrefix))),
    [events, activeMonthPrefix]
  );

  const eventsByDateMap = useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>();
    for (const ev of filteredEvents) {
      const existing = map.get(ev.date);
      if (existing) {
        existing.push(ev);
      } else {
        map.set(ev.date, [ev]);
      }
    }
    return map;
  }, [filteredEvents]);

  const gridCells = useMemo(
    () => buildMonthGrid(currentYear, currentMonth),
    [currentYear, currentMonth]
  );

  const selectedDayEvents = useMemo(
    () => eventsByDateMap.get(selectedDate) || [],
    [eventsByDateMap, selectedDate]
  );

  const navigateMonth = (delta: number) => {
    const next = new Date(Date.UTC(currentYear, currentMonth + delta, 1));
    const nextYear = next.getUTCFullYear();
    const nextMonth = next.getUTCMonth();
    setCurrentYear(nextYear);
    setCurrentMonth(nextMonth);
    const m = nextMonth + 1;
    setSelectedDate(`${nextYear}-${m < 10 ? `0${m}` : String(m)}-01`);
  };

  const jumpToToday = () => {
    const anchor = getInitialCalendarAnchor();
    setCurrentYear(anchor.year);
    setCurrentMonth(anchor.month);
    setSelectedDate(anchor.dateIso);
  };

  const openCreateModal = (prefillDate?: string) => {
    setEditingEvent(null);
    setTitle('');
    setCategory('reunion');
    setDate(prefillDate || selectedDate);
    setStartTime('09:00');
    setEndTime('10:30');
    setFacilityId(facilities[0]?.id || '');
    setLocation(facilities[0] ? `${facilities[0].name}` : '');
    setResponsible('');
    setParticipants('');
    setStatus('programada');
    setDescription('');
    setFormError('');
    setShowModal(true);
  };

  const openEditModal = (ev: CalendarEventItem) => {
    setEditingEvent(ev);
    setTitle(ev.title);
    setCategory(ev.category);
    setDate(ev.date);
    setStartTime(ev.startTime);
    setEndTime(ev.endTime || '');
    setFacilityId(ev.facilityId || '');
    setLocation(ev.location);
    setResponsible(ev.responsible);
    setParticipants(ev.participants || '');
    setStatus(ev.status);
    setDescription(ev.description);
    setFormError('');
    setShowModal(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const validation = validateCalendarEventInput({
      title,
      category,
      date,
      startTime,
      endTime,
      facilityId: facilityId || undefined,
      location,
      responsible,
      participants,
      status,
      description
    });

    if (!validation.valid) {
      setFormError(validation.error);
      return;
    }

    setSubmitting(true);
    try {
      if (editingEvent) {
        await api.updateCalendarEvent(editingEvent.id, validation.data);
        showToast('Actividad actualizada en el calendario corporativo.', 'success');
      } else {
        await api.createCalendarEvent(validation.data);
        showToast('Actividad agendada correctamente.', 'success');
      }

      // Sync visible month/day to the saved event date
      const [yStr, mStr] = validation.data.date.split('-');
      setCurrentYear(Number(yStr));
      setCurrentMonth(Number(mStr) - 1);
      setSelectedDate(validation.data.date);

      setShowModal(false);
      setEditingEvent(null);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'No se pudo guardar la actividad.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickStatusChange = async (ev: CalendarEventItem, newStatus: CalendarEventStatus) => {
    try {
      await api.updateCalendarEvent(ev.id, { status: newStatus });
      showToast(`Estado actualizado a "${CALENDAR_STATUS_META[newStatus].label}".`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Error al actualizar estado de la actividad.', 'error');
    }
  };

  const handleDeleteEvent = async (ev: CalendarEventItem) => {
    const confirmed = await confirmAction({
      title: 'Eliminar actividad programada',
      message: `¿Está seguro de eliminar "${ev.title}" programada para el ${ev.date} a las ${ev.startTime}?`,
      confirmLabel: 'Eliminar',
      danger: true
    });
    if (!confirmed) return;

    try {
      await api.deleteCalendarEvent(ev.id);
      showToast('Actividad eliminada del calendario.', 'info');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'No se pudo eliminar la actividad.', 'error');
    }
  };

  const activeCategoryLabel =
    categoryFilter === 'all'
      ? null
      : CALENDAR_CATEGORY_META[categoryFilter as CalendarEventCategory]?.label;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-emerald-700" />
            <span>Calendario Corporativo &amp; Agenda Operativa</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Programación multi-sede de reuniones, visitas técnicas, viajes de supervisión, inspecciones y charlas ambientales con control de horario y descripción.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Mes</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={() => openCreateModal(selectedDate)}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Agendar Actividad</span>
            </button>
          )}
        </div>
      </div>

      {/* Category Summary Strip (clickable quick filters) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => setCategoryFilter('all')}
          className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
            categoryFilter === 'all'
              ? 'bg-slate-900 border-slate-900 text-white'
              : 'bg-white border-slate-200 hover:border-slate-300 text-slate-900'
          }`}
        >
          <p
            className={`text-[10px] font-bold uppercase tracking-wider ${
              categoryFilter === 'all' ? 'text-slate-300' : 'text-slate-500'
            }`}
          >
            Mes ({formatMonthYearEs(currentYear, currentMonth).split(' ')[0]})
          </p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono tabular-nums">
              {monthSummary.total}
            </span>
            <span
              className={`text-[11px] font-mono ${
                categoryFilter === 'all' ? 'text-emerald-300' : 'text-slate-500'
              }`}
            >
              {monthSummary.active} act.
            </span>
          </div>
        </button>

        {CATEGORIES.map((catKey) => {
          const meta = CALENDAR_CATEGORY_META[catKey];
          const isSelected = categoryFilter === catKey;
          return (
            <button
              key={catKey}
              type="button"
              onClick={() => setCategoryFilter(isSelected ? 'all' : catKey)}
              className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-emerald-50 border-emerald-500 text-slate-900'
                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">
                  {meta.shortLabel}
                </p>
                <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dotClass}`} />
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-xl font-bold font-mono tabular-nums text-slate-900">
                  {monthSummary.byCategory[catKey]}
                </span>
                <span className="text-[11px] text-slate-500">
                  {isSelected ? 'Filtro activo' : 'Ver tipo'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar actividad, descripción, lugar o responsable..."
            aria-label="Buscar en agenda"
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <Filter className="w-3.5 h-3.5" />
            <span>Filtros:</span>
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filtrar por tipo de actividad"
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="all">Todos los tipos</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CALENDAR_CATEGORY_META[c].label}
              </option>
            ))}
          </select>

          <select
            value={facilityFilter}
            onChange={(e) => setFacilityFilter(e.target.value)}
            aria-label="Filtrar por instalación"
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="all">Todas las instalaciones</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filtrar por estado"
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="all">Todos los estados</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {CALENDAR_STATUS_META[s].label}
              </option>
            ))}
          </select>

          {(searchTerm || categoryFilter !== 'all' || facilityFilter !== 'all' || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setCategoryFilter('all');
                setFacilityFilter('all');
                setStatusFilter('all');
              }}
              className="px-2.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Month Grid + Selected Day Panel OR Chronological List */}
      {viewMode === 'month' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Monthly Grid (8 cols) */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            {/* Month Toolbar */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  {formatMonthYearEs(currentYear, currentMonth)}
                </h2>
                {activeCategoryLabel && (
                  <span className="text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                    {activeCategoryLabel}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => navigateMonth(-1)}
                  aria-label="Mes anterior"
                  className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-700 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={jumpToToday}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Hoy
                </button>
                <button
                  type="button"
                  onClick={() => navigateMonth(1)}
                  aria-label="Mes siguiente"
                  className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-700 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Weekday Header */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
              {WEEKDAYS_ES.map((dayName) => (
                <div
                  key={dayName}
                  className="py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500"
                >
                  {dayName}
                </div>
              ))}
            </div>

            {/* Day Cells Grid */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-200">
              {gridCells.map((cell) => {
                const dayEvents = eventsByDateMap.get(cell.date) || [];
                const isSelected = selectedDate === cell.date;
                const isToday = initialAnchor.dateIso === cell.date;
                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => setSelectedDate(cell.date)}
                    aria-label={`Día ${cell.date}, ${dayEvents.length} actividades`}
                    className={`min-h-[96px] sm:min-h-[108px] p-1.5 sm:p-2 text-left align-top flex flex-col gap-1 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-600 ${
                      isSelected
                        ? 'bg-emerald-50/70 ring-2 ring-inset ring-emerald-600'
                        : cell.isCurrentMonth
                        ? 'bg-white hover:bg-slate-50'
                        : 'bg-slate-50/60 text-slate-400 hover:bg-slate-100/60'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`text-xs font-mono font-semibold inline-flex items-center justify-center w-6 h-6 rounded-md ${
                          isToday
                            ? 'bg-emerald-700 text-white'
                            : isSelected
                            ? 'text-emerald-900 font-bold'
                            : cell.isCurrentMonth
                            ? 'text-slate-700'
                            : 'text-slate-400'
                        }`}
                      >
                        {cell.dayNumber}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="text-[10px] font-mono font-semibold text-slate-500">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    <div className="w-full space-y-1 overflow-hidden">
                      {dayEvents.slice(0, 2).map((ev) => {
                        const meta = CALENDAR_CATEGORY_META[ev.category];
                        return (
                          <div
                            key={ev.id}
                            className={`px-1.5 py-0.5 rounded border text-[10px] leading-tight truncate flex items-center gap-1 ${meta.badgeClass}`}
                            title={`${ev.startTime} · ${ev.title}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dotClass}`} />
                            <span className="font-mono font-semibold shrink-0">{ev.startTime}</span>
                            <span className="truncate font-medium">{ev.title}</span>
                          </div>
                        );
                      })}
                      {dayEvents.length > 2 && (
                        <div className="text-[10px] font-semibold text-emerald-800 px-1">
                          +{dayEvents.length - 2} más
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Day Agenda Detail Panel (4 cols) */}
          <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Agenda del Día Seleccionado
                </p>
                <h2 className="text-sm font-bold text-slate-900 font-mono mt-0.5">
                  {selectedDate}
                </h2>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => openCreateModal(selectedDate)}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agendar día</span>
                </button>
              )}
            </div>

            <div className="p-4 space-y-3 max-h-[620px] overflow-y-auto">
              {selectedDayEvents.length === 0 ? (
                <div className="py-10 px-4 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <CalendarDays className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">
                    Sin actividades programadas para el {selectedDate}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Seleccione otro día con eventos o programe una reunión, visita técnica, viaje, inspección o charla.
                  </p>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openCreateModal(selectedDate)}
                      className="mt-3 px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Programar en {selectedDate}</span>
                    </button>
                  )}
                </div>
              ) : (
                selectedDayEvents.map((ev) => {
                  const catMeta = CALENDAR_CATEGORY_META[ev.category];
                  const statusMeta = CALENDAR_STATUS_META[ev.status];
                  const fac = ev.facilityId ? facilityMap.get(ev.facilityId) : undefined;
                  return (
                    <article
                      key={ev.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${catMeta.badgeClass}`}
                          >
                            {catMeta.label}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${statusMeta.badgeClass}`}
                          >
                            {statusMeta.label}
                          </span>
                        </div>

                        <span className="text-xs font-mono font-bold text-slate-800 shrink-0 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-emerald-700" />
                          {ev.startTime}
                          {ev.endTime ? ` – ${ev.endTime}` : ''}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        {ev.title}
                      </h3>

                      <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                        {ev.description}
                      </p>

                      <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">
                            {ev.location}
                            {fac ? ` · ${fac.code}` : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">Responsable: {ev.responsible}</span>
                        </div>
                        {ev.participants && (
                          <div className="flex items-start gap-1.5">
                            <Users className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <span>Participantes: {ev.participants}</span>
                          </div>
                        )}
                      </div>

                      {canEdit && (
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            {ev.status !== 'completada' && (
                              <button
                                type="button"
                                onClick={() => handleQuickStatusChange(ev, 'completada')}
                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Completar</span>
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(ev)}
                              aria-label={`Editar ${ev.title}`}
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(ev)}
                              aria-label={`Eliminar ${ev.title}`}
                              className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-md cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      ) : (
        /* Chronological Agenda Table View */
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Agenda Cronológica Completa ({filteredEvents.length} actividades)
            </h2>
            <span className="text-xs text-slate-500 font-mono">
              {monthFilteredEvents.length} en {formatMonthYearEs(currentYear, currentMonth)}
            </span>
          </div>

          {filteredEvents.length === 0 ? (
            <div className="p-12 text-center">
              <CalendarDays className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">
                No existen actividades que coincidan con los filtros seleccionados
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Ajuste los filtros o agende una nueva reunión, visita técnica, viaje, inspección o charla.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Fecha &amp; Hora</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Actividad &amp; Descripción</th>
                    <th className="py-3 px-4">Sede / Lugar</th>
                    <th className="py-3 px-4">Responsable</th>
                    <th className="py-3 px-4">Estado</th>
                    {canEdit && <th className="py-3 px-4 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredEvents.map((ev) => {
                    const catMeta = CALENDAR_CATEGORY_META[ev.category];
                    const statusMeta = CALENDAR_STATUS_META[ev.status];
                    const fac = ev.facilityId ? facilityMap.get(ev.facilityId) : undefined;
                    return (
                      <tr key={ev.id} className="hover:bg-slate-50/70">
                        <td className="py-3.5 px-4 whitespace-nowrap font-mono">
                          <div className="font-bold text-slate-900">{ev.date}</div>
                          <div className="text-[11px] text-slate-500">
                            {ev.startTime}
                            {ev.endTime ? ` – ${ev.endTime}` : ''}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${catMeta.badgeClass}`}
                          >
                            {catMeta.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 max-w-md">
                          <div className="font-bold text-slate-900">{ev.title}</div>
                          <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">
                            {ev.description}
                          </p>
                          {ev.participants && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Participantes: {ev.participants}
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-700">
                          <div>{ev.location}</div>
                          {fac && (
                            <div className="text-[11px] text-slate-400 font-mono">{fac.name}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                          {ev.responsible}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${statusMeta.badgeClass}`}
                          >
                            {statusMeta.label}
                          </span>
                        </td>
                        {canEdit && (
                          <td className="py-3.5 px-4 whitespace-nowrap text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditModal(ev)}
                                aria-label={`Editar ${ev.title}`}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEvent(ev)}
                                aria-label={`Eliminar ${ev.title}`}
                                className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-md cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Photographic Evidences Panel for Calendar Activities */}
      <ModuleEvidencePanel
        module="calendario"
        title="Evidencias Fotográficas de Reuniones, Visitas, Viajes, Inspecciones y Charlas"
        description="Adjunte actas firmadas, listas de asistencia de charlas, fotografías de visitas técnicas o evidencias de inspecciones y viajes operativos."
        facilityId={facilityFilter !== 'all' ? facilityFilter : undefined}
        activeOrgId={activeOrgId}
        userRole={userRole}
        defaultCategory="Reunión / Comité Ambiental"
        categories={[
          'Reunión / Comité Ambiental',
          'Visita Técnica',
          'Viaje Operativo',
          'Inspección en Campo',
          'Charla / Capacitación'
        ]}
        emptyMessage="No hay fotografías adjuntas a actividades del calendario en esta vista."
      />

      {/* Create / Edit Activity Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-modal-title"
            className="bg-white rounded-xl border border-slate-200 max-w-2xl w-full shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-emerald-700" />
                <h2 id="calendar-modal-title" className="text-sm font-bold text-slate-900">
                  {editingEvent
                    ? 'Editar Actividad Programada'
                    : 'Agendar Nueva Actividad en Calendario'}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Cerrar ventana"
                onClick={() => setShowModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="p-6 space-y-4 overflow-y-auto">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="cal-title"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Título de la Actividad *
                  </label>
                  <input
                    id="cal-title"
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ej. Visita técnica de monitoreo de efluentes en Planta Ica"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cal-category"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Tipo de Actividad *
                  </label>
                  <select
                    id="cal-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as CalendarEventCategory)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CALENDAR_CATEGORY_META[c].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="cal-status"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Estado
                  </label>
                  <select
                    id="cal-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as CalendarEventStatus)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {CALENDAR_STATUS_META[s].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="cal-date"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Fecha *
                  </label>
                  <input
                    id="cal-date"
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="cal-start-time"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Hora Inicio *
                    </label>
                    <input
                      id="cal-start-time"
                      type="time"
                      required
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="cal-end-time"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Hora Término
                    </label>
                    <input
                      id="cal-end-time"
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="cal-facility"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Instalación Asociada
                  </label>
                  <select
                    id="cal-facility"
                    value={facilityId}
                    onChange={(e) => setFacilityId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="">Corporativo / Multi-sede</option>
                    {facilities.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="cal-location"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Lugar / Sala / Destino
                  </label>
                  <input
                    id="cal-location"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Ej. Sala Directorio, Ruta Ica, Auditorio SSOMA"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cal-responsible"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Responsable
                  </label>
                  <input
                    id="cal-responsible"
                    type="text"
                    value={responsible}
                    onChange={(e) => setResponsible(e.target.value)}
                    placeholder="Ej. Ing. Valeria Mendoza"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cal-participants"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Participantes / Áreas
                  </label>
                  <input
                    id="cal-participants"
                    type="text"
                    value={participants}
                    onChange={(e) => setParticipants(e.target.value)}
                    placeholder="Ej. Jefatura SSOMA, Mantenimiento, Equipo SGS"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="cal-description"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Descripción y Alcance de la Actividad *
                  </label>
                  <textarea
                    id="cal-description"
                    rows={3}
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Detalle agenda, objetivos, equipos a revisar, requisitos de EPP o temas de la charla..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  {submitting
                    ? 'Guardando...'
                    : editingEvent
                    ? 'Guardar Cambios'
                    : 'Agendar Actividad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
