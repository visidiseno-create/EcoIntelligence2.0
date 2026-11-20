import React from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Building2,
  Trash2,
  Droplets,
  Wind,
  Zap,
  Calendar,
  ArrowRight,
  TrendingUp,
  FileCheck2,
  Clock
} from 'lucide-react';
import { ActiveTab } from '../components/Sidebar';
import { ModuleEvidencePanel } from '../components/ModuleEvidencePanel';

interface DashboardProps {
  data: any;
  loading: boolean;
  onNavigate: (tab: ActiveTab) => void;
  userRole?: string;
  activeOrgId?: string;
}

export const DashboardView: React.FC<DashboardProps> = ({ data, loading, onNavigate, userRole = 'admin', activeOrgId }) => {
  if (loading || !data) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm font-medium text-slate-600">Calculando analítica ambiental y consultando registros de base de datos...</p>
        </div>
      </div>
    );
  }

  const { organization, counts, compliance, waste, water, air, energy, upcomingObligations, recentActions } = data;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner / Executive Summary */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-xl p-5 md:p-7 shadow-lg border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-mono tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
              SISTEMA DE GESTIÓN ISO 14001 / ESG
            </span>
            <span className="text-xs text-slate-300">• {new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
            Panel Ejecutivo Ambiental — {organization?.name}
          </h1>
          <p className="text-xs md:text-sm text-slate-300 mt-1 max-w-2xl">
            Control integral de cumplimiento normativo, vectores ambientales, auditorías de planta y trazabilidad para mitigar contingencias legales y operativas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => onNavigate('compliance')}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-500/50 text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-300" />
            <span>Panel de Cumplimiento (5 Estados)</span>
          </button>
          <button
            onClick={() => onNavigate('reports')}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Generar Informe</span>
          </button>
          <button
            onClick={() => onNavigate('assistant')}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5"
          >
            <span>Asistente BD</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid (Data-Backed Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Compliance Rate */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cumplimiento Legal</span>
            <div className={`p-2 rounded-lg ${compliance.complianceRatePercent >= 80 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900">{compliance.complianceRatePercent}%</span>
            <span className="text-xs text-slate-500">({compliance.fulfilled}/{compliance.total} obligaciones)</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                compliance.complianceRatePercent >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${compliance.complianceRatePercent}%` }}
            ></div>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-600">
            <span className="text-rose-600 font-semibold">{compliance.overdue} vencidas</span>
            <span>{compliance.inProgress} en curso</span>
            <span>{compliance.pending} pendientes</span>
          </div>
        </div>

        {/* Waste Management */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Residuos Gestionados</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Trash2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900">{waste.totalKg.toLocaleString()}</span>
            <span className="text-xs text-slate-500">kg totales</span>
          </div>
          <div className="mt-2 text-xs text-slate-600 flex items-center justify-between">
            <span>Peligrosos:</span>
            <span className="font-semibold text-amber-700">{waste.hazardousKg.toLocaleString()} kg</span>
          </div>
          <div className="mt-1 text-xs text-slate-600 flex items-center justify-between">
            <span>Tasa de Valorización:</span>
            <span className="font-semibold text-emerald-600">{waste.recyclingRatePercent}%</span>
          </div>
        </div>

        {/* Water Resource */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Balance Hídrico</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Droplets className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900">{water.totalConsumedM3.toLocaleString()}</span>
            <span className="text-xs text-slate-500">m³ consumidos</span>
          </div>
          <div className="mt-2 text-xs text-slate-600 flex items-center justify-between">
            <span>Efluente vertido:</span>
            <span className="font-semibold text-slate-700">{water.totalDischargedM3.toLocaleString()} m³</span>
          </div>
          <div className="mt-1 text-xs text-slate-600 flex items-center justify-between">
            <span>Recirculación:</span>
            <span className="font-semibold text-blue-600">{water.recirculationRatePercent}%</span>
          </div>
        </div>

        {/* Energy & Carbon */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Energía & Huella CO₂</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900">{energy.totalKWh.toLocaleString()}</span>
            <span className="text-xs text-slate-500">kWh</span>
          </div>
          <div className="mt-2 text-xs text-slate-600 flex items-center justify-between">
            <span>Energía Renovable:</span>
            <span className="font-semibold text-emerald-600">{energy.renewableSharePercent}%</span>
          </div>
          <div className="mt-1 text-xs text-slate-600 flex items-center justify-between">
            <span>Huella estimada:</span>
            <span className="font-semibold text-slate-700">{energy.estimatedCo2Ton} tCO₂e</span>
          </div>
        </div>
      </div>

      {/* Middle Row: Upcoming Obligations & Environmental Vector Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming Obligations Calendar / Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  Próximos Vencimientos y Obligaciones Críticas
                </h2>
                <p className="text-xs text-slate-500">Cronograma legal registrado con periodicidad y responsables</p>
              </div>
              <button
                onClick={() => onNavigate('obligations')}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                <span>Ver todas ({counts.obligations})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-3 divide-y divide-slate-100">
              {upcomingObligations && upcomingObligations.length > 0 ? (
                upcomingObligations.map((ob: any) => {
                  const isOverdue = ob.status === 'vencida' || ob.dueDate < '2026-11-04';
                  return (
                    <div key={ob.id} className="py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-slate-900 truncate">{ob.title}</p>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-medium ${
                            ob.status === 'cumplida'
                              ? 'bg-emerald-100 text-emerald-800'
                              : isOverdue
                              ? 'bg-rose-100 text-rose-800'
                              : ob.status === 'en_progreso'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {ob.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          Norma: {ob.normativeSource} • Responsable: {ob.responsible}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1 text-xs font-mono font-medium text-slate-700">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{ob.dueDate}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 capitalize">{ob.frequency}</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-slate-400 py-6 text-center">No hay obligaciones registradas para esta organización.</p>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Total de instalaciones asociadas: {counts.facilities}</span>
            <span className="font-medium text-emerald-600">Base legal actualizada en tiempo real</span>
          </div>
        </div>

        {/* Environmental Vector Health Cards */}
        <div className="space-y-4">
          {/* Air Quality Gauge Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Wind className="w-4 h-4 text-emerald-600" />
                Emisiones & Calidad de Aire
              </span>
              <span className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded ${
                air.exceededSamples === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}>
                {air.complianceRatePercent}% Conforme
              </span>
            </div>
            <div className="mt-3 space-y-2 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Muestreos evaluados:</span>
                <span className="font-semibold text-slate-800">{air.totalSamples} puntos</span>
              </div>
              <div className="flex justify-between">
                <span>Excedencias registradas:</span>
                <span className={`font-semibold ${air.exceededSamples > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                  {air.exceededSamples} parámetros
                </span>
              </div>
              {air.exceededSamples > 0 && (
                <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-800 mt-2">
                  Desviación detectada en {air.exceedances[0]?.parameter} ({air.exceedances[0]?.measuredValue} vs límite {air.exceedances[0]?.limitValue} {air.exceedances[0]?.unit})
                </div>
              )}
            </div>
            <button
              onClick={() => onNavigate('air')}
              className="w-full mt-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded text-xs font-medium border border-slate-200 transition-colors"
            >
              Consultar Monitoreos de Aire
            </button>
          </div>

          {/* CAPA & Inspections Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Acciones Correctivas (CAPA)
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">
                {counts.openActions} abiertas
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {recentActions && recentActions.length > 0 ? (
                recentActions.slice(0, 2).map((a: any) => (
                  <div key={a.id} className="text-xs p-2 rounded bg-slate-50 border border-slate-100">
                    <p className="font-semibold text-slate-800 truncate">{a.title}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Límite: {a.deadline} • {a.responsible}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400">Sin acciones pendientes.</p>
              )}
            </div>
            <button
              onClick={() => onNavigate('capa')}
              className="w-full mt-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded text-xs font-medium border border-slate-200 transition-colors"
            >
              Gestionar Acciones Correctivas
            </button>
          </div>
        </div>
      </div>

      {/* Section 5.1 Universal Evidence Panel for Dashboard / General Activities */}
      <ModuleEvidencePanel
        module="dashboard"
        title="Evidencias Fotográficas de Actividades e Indicadores Ejecutivos"
        description="Registro fotográfico transversal de recorridos gerenciales, señalización y verificación de metas ambientales."
        activeOrgId={activeOrgId}
        userRole={userRole}
        defaultCategory="Inspección en Terreno"
        emptyMessage="No se registran fotografías generales vinculadas al tablero ejecutivo."
      />
    </div>
  );
};
