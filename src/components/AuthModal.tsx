import React, { useState } from 'react';
import {
  Shield,
  KeyRound,
  Users,
  Building2,
  Lock,
  ArrowRight,
  Leaf
} from 'lucide-react';
import { api } from '../services/api';

interface AuthModalProps {
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const labUsers = [
    { email: 'admin@ecoinntelligence.com', name: 'Ing. Valeria Mendoza', role: 'Administrador Ambiental', desc: 'Permisos totales de edición, configuración y auditoría.' },
    { email: 'auditor@ecoinntelligence.com', name: 'Dr. Roberto Santillán', role: 'Auditor Líder', desc: 'Ejecución de inspecciones y formulación de hallazgos.' },
    { email: 'operador@ecoinntelligence.com', name: 'Tec. Carlos Paredes', role: 'Operador de Planta', desc: 'Carga técnica de residuos, agua y energía.' },
    { email: 'lector@ecoinntelligence.com', name: 'Lic. Andrea Benavides', role: 'Lector Ejecutivo', desc: 'Visualización de métricas, reportes y solo lectura.' }
  ];

  const handleLogin = async (targetEmail: string) => {
    setLoading(true);
    setError('');
    try {
      await api.login(targetEmail);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error de autenticación.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
        {/* Brand Banner */}
        <div className="bg-slate-900 p-6 text-white text-center border-b border-slate-800">
          <div className="w-12 h-12 rounded-xl bg-emerald-600 mx-auto flex items-center justify-center shadow-lg shadow-emerald-900/50 mb-3">
            <Leaf className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-extrabold tracking-wider">
            ECO<span className="text-emerald-400">INTELLIGENCE</span>
          </h2>
          <p className="text-xs text-slate-300 mt-1 font-medium">
            Acceso a Plataforma de Gestión Ambiental Empresarial
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-medium">
              {error}
            </div>
          )}

          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
              Seleccionar Perfil de Laboratorio (1-Clic):
            </span>
            <div className="space-y-2">
              {labUsers.map(u => (
                <button
                  key={u.email}
                  onClick={() => handleLogin(u.email)}
                  disabled={loading}
                  className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all flex items-start gap-3 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-emerald-100 group-hover:text-emerald-800 flex items-center justify-center text-slate-700 font-bold shrink-0 transition-colors">
                    {u.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{u.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 group-hover:bg-emerald-100 group-hover:text-emerald-800">
                        {u.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{u.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
              O ingresar correo registrado:
            </span>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="usuario@organizacion.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={() => handleLogin(email)}
                disabled={loading || !email.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg shrink-0 flex items-center gap-1"
              >
                <span>Entrar</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
