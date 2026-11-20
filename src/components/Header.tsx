import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  Users,
  RotateCcw,
  Bell,
  ChevronDown,
  Shield,
  CheckCircle2,
  Menu,
  X
} from 'lucide-react';
import { CurrentUser, Organization } from '../services/api';

interface HeaderProps {
  currentUser: CurrentUser | null;
  activeOrg: Organization | null;
  organizations: Organization[];
  onSwitchOrg: (orgId: string) => void;
  onSwitchLabUser: (email: string) => void;
  onResetSeed: () => void;
  alertCounts?: { overdueObligations: number; openCapa: number };
  onToggleMobileMenu?: () => void;
  isMobileMenuOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  activeOrg,
  organizations,
  onSwitchOrg,
  onSwitchLabUser,
  onResetSeed,
  alertCounts,
  onToggleMobileMenu,
  isMobileMenuOpen
}) => {
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setShowOrgDropdown(false);
        setShowRoleDropdown(false);
        setShowAlertModal(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowOrgDropdown(false);
        setShowRoleDropdown(false);
        setShowAlertModal(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const labUsers = [
    { email: 'admin@ecoinntelligence.com', name: 'Ing. Valeria Mendoza', role: 'admin', desc: 'Control total de la organización y configuración' },
    { email: 'auditor@ecoinntelligence.com', name: 'Dr. Roberto Santillán', role: 'auditor', desc: 'Ejecución de inspecciones y formulación de hallazgos' },
    { email: 'operador@ecoinntelligence.com', name: 'Tec. Carlos Paredes', role: 'operador', desc: 'Registro técnico de residuos, agua y energía' },
    { email: 'lector@ecoinntelligence.com', name: 'Lic. Andrea Benavides', role: 'lector', desc: 'Acceso de solo lectura a métricas y reportes ejecutivos' }
  ];

  const totalAlerts = (alertCounts?.overdueObligations || 0) + (alertCounts?.openCapa || 0);

  return (
    <header ref={headerRef} className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between z-20 shrink-0">
      {/* Mobile Menu Button & Platform Title */}
      <div className="flex items-center gap-3">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            aria-label="Alternar menú móvil"
            className="md:hidden p-2 text-slate-600 hover:text-slate-900 rounded-md hover:bg-slate-100"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        )}

        {/* Organization Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowOrgDropdown(!showOrgDropdown);
              setShowRoleDropdown(false);
            }}
            aria-label="Cambiar organización"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-slate-50 transition-all text-left text-xs font-semibold text-slate-800"
          >
            <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="hidden sm:block">
              <span className="text-[10px] text-slate-400 block font-normal uppercase leading-tight">Organización</span>
              <span className="truncate max-w-[200px] block">{activeOrg?.name || 'Seleccionar...'}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {showOrgDropdown && (
            <div className="absolute left-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-slate-200 py-2 z-50">
              <div className="px-3 py-1.5 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aislamiento Multitenant</p>
                <p className="text-xs text-slate-600">Los datos de cada empresa permanecen estrictamente aislados.</p>
              </div>
              <div className="max-h-60 overflow-y-auto py-1">
                {organizations.map(org => {
                  const isSelected = org.id === activeOrg?.id;
                  return (
                    <button
                      key={org.id}
                      onClick={() => {
                        onSwitchOrg(org.id);
                        setShowOrgDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-start gap-2.5 hover:bg-slate-50 transition-colors ${
                        isSelected ? 'bg-emerald-50/60 font-semibold text-emerald-900' : 'text-slate-700'
                      }`}
                    >
                      <Building2 className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <div className="min-w-0">
                        <p className="text-xs truncate">{org.name}</p>
                        <p className="text-[10px] text-slate-500">RUC: {org.taxId} • {org.sector}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Center / Right controls */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Lab Role Switcher Button */}
        <div className="relative">
          <button
            onClick={() => {
              setShowRoleDropdown(!showRoleDropdown);
              setShowOrgDropdown(false);
            }}
            aria-label="Cambiar rol de laboratorio"
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50 text-xs text-slate-700 font-medium transition-all"
          >
            <Shield className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden md:inline text-slate-500 text-[11px]">Rol activo:</span>
            <span className="font-semibold text-emerald-700 uppercase font-mono text-[11px]">
              {currentUser?.role || 'admin'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showRoleDropdown && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-slate-200 py-2 z-50">
              <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Perfiles de Laboratorio</span>
                <span className="text-[10px] font-mono text-emerald-600 font-medium">RBAC Activo</span>
              </div>
              <div className="py-1">
                {labUsers.map(u => {
                  const isActive = u.email === currentUser?.email;
                  return (
                    <button
                      key={u.email}
                      onClick={() => {
                        onSwitchLabUser(u.email);
                        setShowRoleDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-start gap-2.5 transition-colors ${
                        isActive ? 'bg-emerald-50 text-emerald-950 font-semibold' : 'text-slate-700'
                      }`}
                    >
                      <Users className={`w-4 h-4 mt-0.5 shrink-0 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <div className="min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold">{u.name}</p>
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                            {u.role}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{u.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Environmental Alerts Popover */}
        <div className="relative">
          <button
            onClick={() => setShowAlertModal(!showAlertModal)}
            aria-label="Ver alertas ambientales"
            className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Bell className="w-4 h-4" />
            {totalAlerts > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            )}
          </button>

          {showAlertModal && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-slate-200 p-3 z-50">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-800">Alertas Ambientales en Vivo</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200">
                  {totalAlerts} activas
                </span>
              </div>
              <div className="mt-2 space-y-2 text-xs">
                {alertCounts?.overdueObligations ? (
                  <div className="p-2 bg-rose-50 border border-rose-200 rounded text-rose-800">
                    <p className="font-semibold">⚠️ {alertCounts.overdueObligations} Obligación(es) vencida(s)</p>
                    <p className="text-[11px] text-rose-700">Requiere presentación formal o renovación urgente ante la autoridad ambiental.</p>
                  </div>
                ) : null}
                {alertCounts?.openCapa ? (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-800">
                    <p className="font-semibold">⚡ {alertCounts.openCapa} Acción(es) Correctiva(s) abiertas</p>
                    <p className="text-[11px] text-amber-700">Plazos de subsanación de hallazgos en curso.</p>
                  </div>
                ) : null}
                {totalAlerts === 0 && (
                  <div className="p-3 text-center text-slate-500">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                    <p className="font-medium text-xs">No hay contingencias críticas registradas en este período.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Database Seed Reset Button */}
        <button
          onClick={onResetSeed}
          title="Restaurar base de datos de laboratorio con migraciones 001-038"
          aria-label="Restaurar datos iniciales"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-100 text-slate-600 text-xs font-medium transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
          <span className="hidden sm:inline text-[11px]">Restaurar BD Lab</span>
        </button>
      </div>
    </header>
  );
};
