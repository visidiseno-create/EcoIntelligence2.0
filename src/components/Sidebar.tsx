import React from 'react';
import {
  LayoutDashboard,
  ShieldCheck,
  Building2,
  Trash2,
  Droplets,
  Wind,
  Zap,
  ClipboardCheck,
  AlertTriangle,
  FolderLock,
  BarChart3,
  Sparkles,
  CreditCard,
  History,
  LogOut,
  Leaf,
  CalendarDays,
  Compass
} from 'lucide-react';
import { CurrentUser, Organization } from '../services/api';

export type ActiveTab =
  | 'dashboard'
  | 'compliance'
  | 'obligations'
  | 'calendar'
  | 'facilities'
  | 'waste'
  | 'water'
  | 'air'
  | 'energy'
  | 'inspections'
  | 'capa'
  | 'documents'
  | 'reports'
  | 'geotech'
  | 'assistant'
  | 'subscription'
  | 'audit';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  currentUser: CurrentUser | null;
  activeOrg: Organization | null;
  onLogout: () => void;
  alertCounts?: { overdueObligations: number; openCapa: number };
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  activeOrg,
  onLogout,
  alertCounts
}) => {
  const navItems = [
    {
      group: 'SUPERVISIÓN EJECUTIVA',
      items: [
        { id: 'dashboard' as ActiveTab, label: 'Dashboard Ejecutivo', icon: LayoutDashboard },
        { id: 'reports' as ActiveTab, label: 'Analítica & Informes', icon: BarChart3 }
      ]
    },
    {
      group: 'CUMPLIMIENTO LEGAL & CONTROL',
      items: [
        {
          id: 'compliance' as ActiveTab,
          label: 'Panel de Cumplimiento (5 Estados)',
          icon: ShieldCheck,
          badge: 'Oficial',
          badgeColor: 'bg-emerald-500/10 text-emerald-400 border border-emerald-800'
        },
        {
          id: 'obligations' as ActiveTab,
          label: 'Obligaciones Ambientales',
          icon: ShieldCheck,
          badge: alertCounts?.overdueObligations && alertCounts.overdueObligations > 0 ? `${alertCounts.overdueObligations} venc.` : undefined,
          badgeColor: 'bg-rose-500/10 text-rose-600 border border-rose-200'
        },
        { id: 'calendar' as ActiveTab, label: 'Calendario & Agenda', icon: CalendarDays },
        { id: 'facilities' as ActiveTab, label: 'Gestión de Instalaciones', icon: Building2 },
        { id: 'inspections' as ActiveTab, label: 'Inspecciones en Campo', icon: ClipboardCheck },
        {
          id: 'capa' as ActiveTab,
          label: 'Acciones Correctivas (CAPA)',
          icon: AlertTriangle,
          badge: alertCounts?.openCapa && alertCounts.openCapa > 0 ? `${alertCounts.openCapa}` : undefined,
          badgeColor: 'bg-amber-500/10 text-amber-600 border border-amber-200'
        },
        { id: 'documents' as ActiveTab, label: 'Biblioteca de Evidencias', icon: FolderLock }
      ]
    },
    {
      group: 'VECTORES AMBIENTALES',
      items: [
        { id: 'waste' as ActiveTab, label: 'Gestión de Residuos', icon: Trash2 },
        { id: 'water' as ActiveTab, label: 'Gestión del Agua', icon: Droplets },
        { id: 'air' as ActiveTab, label: 'Aire & Emisiones', icon: Wind },
        { id: 'energy' as ActiveTab, label: 'Energía & Huella CO₂', icon: Zap }
      ]
    },
    {
      group: 'INTELIGENCIA & GESTIÓN',
      items: [
        { id: 'geotech' as ActiveTab, label: 'SIG & Geotech AI', icon: Compass },
        {
          id: 'assistant' as ActiveTab,
          label: 'Asistente Ambiental (BD)',
          icon: Sparkles,
          badge: 'Verificado',
          badgeColor: 'bg-emerald-500/10 text-emerald-600 border border-emerald-200'
        },
        { id: 'subscription' as ActiveTab, label: 'Suscripción & Límites', icon: CreditCard },
        { id: 'audit' as ActiveTab, label: 'Auditoría & Trazabilidad', icon: History }
      ]
    }
  ];

  return (
    <aside className="w-68 bg-slate-900 text-slate-300 flex flex-col h-screen border-r border-slate-800 shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-900/40">
            <Leaf className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-white text-base tracking-wider flex items-center gap-1.5">
              <span>ECO</span>
              <span className="text-emerald-400 font-extrabold">INTELLIGENCE</span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Environmental Enterprise Platform</p>
          </div>
        </div>
      </div>

      {/* Organization Badge Card */}
      <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Organización Activa</span>
          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
            Plan {activeOrg?.plan?.toUpperCase() || 'PRO'}
          </span>
        </div>
        <p className="text-xs font-semibold text-slate-100 mt-1 truncate" title={activeOrg?.name}>
          {activeOrg?.name || 'Organización'}
        </p>
        <p className="text-[11px] text-slate-400 truncate">RUC: {activeOrg?.taxId}</p>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="Navegación principal">
        {navItems.map((group, idx) => (
          <div key={idx} className="space-y-1">
            <p className="px-3 text-[10px] font-bold text-slate-300 tracking-wider uppercase mb-1.5">
              {group.group}
            </p>
            {group.items.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  aria-label={item.label}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-600 text-white font-semibold shadow-sm shadow-emerald-900/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ml-1.5 shrink-0 ${
                      isActive ? 'bg-white/20 text-white' : item.badgeColor
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer / User Profile & Logout */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-emerald-400 border border-slate-600 shrink-0">
              {currentUser?.name ? currentUser.name.charAt(0) : 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{currentUser?.name}</p>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                  {currentUser?.role || 'admin'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
