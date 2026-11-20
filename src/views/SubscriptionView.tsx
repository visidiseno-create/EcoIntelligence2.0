import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Building2,
  Users,
  HardDrive
} from 'lucide-react';
import { api } from '../services/api';
import { useFeedback } from '../components/FeedbackContext';

interface SubscriptionViewProps {
  userRole?: string;
  activeOrgId?: string;
}

export const SubscriptionView: React.FC<SubscriptionViewProps> = ({ userRole = 'admin', activeOrgId }) => {
  const { showToast } = useFeedback();
  const [subData, setSubData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const canEdit = userRole !== 'lector';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getSubscription();
      setSubData(data);
    } catch (e: any) {
      showToast(e.message || 'Error al cargar información de suscripción.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleChangePlan = async (planId: string) => {
    if (!canEdit) return;
    try {
      await api.changeSubscriptionPlan(planId);
      await loadData();
      showToast(`Plan actualizado con éxito al nivel: ${planId.toUpperCase()}.`, 'success');
    } catch (e: any) {
      showToast(e.message || 'No se pudo cambiar el plan.', 'error');
    }
  };

  if (loading || !subData) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        Cargando estado de suscripción y límites de cuota...
      </div>
    );
  }

  const { currentPlan, usage, allPlans } = subData;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
          <CreditCard className="w-6 h-6 text-emerald-600" />
          Administración de Suscripción SaaS & Límites de Cuota
        </h1>
        <p className="text-xs md:text-sm text-slate-500 mt-1">
          Modelo de monetización B2B por suscripción de software. Supervisa el consumo de recursos asignados a tu organización.
        </p>
      </div>

      {/* Quota Progress Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Facilities Quota */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-emerald-600" />
              Sedes / Instalaciones
            </span>
            <span className="text-xs font-mono font-bold text-slate-800">
              {usage.facilitiesCount} / {usage.maxFacilities}
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                usage.facilitiesPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(usage.facilitiesPercent, 100)}%` }}
            ></div>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {usage.facilitiesPercent}% utilizado ({usage.maxFacilities - usage.facilitiesCount} sedes disponibles en plan {currentPlan.planName})
          </p>
        </div>

        {/* Users Quota */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1.5">
              <Users className="w-4 h-4 text-blue-600" />
              Usuarios Activos
            </span>
            <span className="text-xs font-mono font-bold text-slate-800">
              {usage.usersCount} / {usage.maxUsers}
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                usage.usersPercent > 80 ? 'bg-amber-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(usage.usersPercent, 100)}%` }}
            ></div>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {usage.usersPercent}% de licencias de usuario asignadas
          </p>
        </div>

        {/* Storage Quota */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-purple-600" />
              Almacenamiento de Evidencias
            </span>
            <span className="text-xs font-mono font-bold text-slate-800">
              {usage.usedStorageMb} / {usage.maxStorageMb} MB
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full mt-3 overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all"
              style={{ width: `${Math.min(usage.storagePercent, 100)}%` }}
            ></div>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {usage.storagePercent}% de espacio de custodia ocupado
          </p>
        </div>
      </div>

      {/* Plan Comparison & Tiers */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-bold text-slate-900">Planes de Suscripción Disponibles</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Plataforma 100% de software ambiental. No intermediamos ni ejecutamos consultorías ni servicios de campo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.keys(allPlans).map(key => {
            const plan = allPlans[key];
            const isCurrent = plan.planId === currentPlan.planId;
            return (
              <div
                key={plan.planId}
                className={`rounded-xl border p-5 flex flex-col justify-between transition-all ${
                  isCurrent
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20 shadow-md'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-slate-900">{plan.planName}</h3>
                    {isCurrent && (
                      <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-emerald-600 text-white">
                        Plan Activo
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-slate-900">${plan.monthlyPriceUsd}</span>
                    <span className="text-xs text-slate-500">USD / mes</span>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-xs">
                    <p className="text-slate-600"><strong>{plan.maxFacilities}</strong> instalaciones simultáneas</p>
                    <p className="text-slate-600"><strong>{plan.maxUsers}</strong> usuarios con roles (RBAC)</p>
                    <p className="text-slate-600"><strong>{plan.maxStorageMb} MB</strong> almacenamiento en la nube</p>
                  </div>

                  <ul className="mt-4 space-y-2 text-xs text-slate-700">
                    {plan.features.map((feat: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100">
                  {isCurrent ? (
                    <div className="text-center py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100/60 rounded-lg">
                      Suscripción en Curso
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => handleChangePlan(plan.planId)}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      {canEdit ? `Seleccionar Plan ${plan.planName}` : 'Solo lectura (Rol Lector)'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
