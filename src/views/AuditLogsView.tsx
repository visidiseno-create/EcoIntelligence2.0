import React, { useState } from 'react';
import {
  History,
  Shield,
  Search,
  Filter,
  User,
  Clock,
  FileText
} from 'lucide-react';

interface AuditLogsViewProps {
  logs: any[];
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ logs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');

  const filtered = logs.filter(log => {
    const matchesSearch =
      searchTerm === '' ||
      log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesModule = moduleFilter === '' || log.module === moduleFilter;

    return matchesSearch && matchesModule;
  });

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
          <History className="w-6 h-6 text-emerald-600" />
          Trazabilidad & Registro de Auditoría de Seguridad (ISO 14001)
        </h1>
        <p className="text-xs md:text-sm text-slate-500 mt-1">
          Historial inmutable de acciones, inicios de sesión, modificaciones de datos y evidencias por usuario y rol.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por usuario, acción o detalle..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <select
            value={moduleFilter}
            onChange={e => setModuleFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
          >
            <option value="">Todos los módulos</option>
            <option value="Autenticación">Autenticación</option>
            <option value="Cumplimiento">Cumplimiento</option>
            <option value="Residuos">Residuos</option>
            <option value="Recursos Hídricos">Recursos Hídricos</option>
            <option value="Emisiones y Aire">Emisiones y Aire</option>
            <option value="Gestión Energética">Gestión Energética</option>
            <option value="Inspecciones">Inspecciones</option>
            <option value="Acciones Correctivas">Acciones Correctivas</option>
            <option value="Documentos">Documentos</option>
            <option value="Suscripción">Suscripción</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Marca de Tiempo</th>
                <th className="py-3 px-4">Usuario</th>
                <th className="py-3 px-4">Rol RBAC</th>
                <th className="py-3 px-4">Módulo</th>
                <th className="py-3 px-4">Acción</th>
                <th className="py-3 px-4">Detalles del Evento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length > 0 ? (
                filtered.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-slate-600 whitespace-nowrap">
                      {l.timestamp}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {l.userName}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-slate-100 text-slate-700">
                        {l.userRole}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {l.module}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-emerald-800">
                      {l.action}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-md">
                      {l.details}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                    No se registran eventos de auditoría con los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
