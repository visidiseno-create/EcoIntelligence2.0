import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Database,
  CheckCircle2,
  Bot
} from 'lucide-react';
import { api } from '../services/api';
import { useFeedback } from '../components/FeedbackContext';

interface AssistantViewProps {
  activeOrgId?: string;
}

export const AssistantView: React.FC<AssistantViewProps> = ({ activeOrgId }) => {
  const { showToast } = useFeedback();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const presetQueries = [
    '¿Cuáles son los vencimientos legales y el estado de cumplimiento?',
    '¿Cuántos residuos peligrosos se han generado y qué operador los transportó?',
    '¿Cuál es el balance hídrico y cumplimiento de efluentes?',
    '¿Se han registrado emisiones por encima del límite permisible?',
    '¿Cuál es la huella de carbono y consumo energético total?',
    '¿Cuántas acciones correctivas (CAPA) están abiertas?'
  ];

  useEffect(() => {
    let cancelled = false;
    const initDefaultQuery = async () => {
      setLoading(true);
      const initialQ = '¿Cuáles son los vencimientos legales y el estado de cumplimiento?';
      try {
        const resp = await api.askAssistant(initialQ);
        if (!cancelled) {
          setHistory([{ query: initialQ, response: resp }]);
        }
      } catch (err: any) {
        if (!cancelled) {
          showToast(err.message || 'No se pudo consultar el resumen inicial del asistente.', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    initDefaultQuery();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, showToast]);

  const handleSend = async (textToSend?: string) => {
    const q = textToSend || query;
    if (!q.trim() || loading) return;

    setLoading(true);
    try {
      const resp = await api.askAssistant(q);
      setHistory(prev => [...prev, { query: q, response: resp }]);
      if (!textToSend) setQuery('');
    } catch (err: any) {
      showToast(err.message || 'Error al consultar asistente determinístico', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                <Sparkles className="w-5 h-5" />
              </span>
              <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 uppercase">
                Motor Determinístico de Consultas
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              Asistente de Inteligencia Ambiental (BD Verificada)
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Motor determinístico conectado en tiempo real a las tablas de la base de datos de tu organización. Cita fuentes verificadas, normativas vigentes y distingue cálculos matemáticos de sugerencias técnicas.
            </p>
          </div>
        </div>

        {/* Disclaimer Notice */}
        <div className="mt-4 p-3 bg-amber-50/60 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center gap-2.5">
          <Database className="w-4 h-4 text-amber-700 shrink-0" />
          <p>
            <strong>Cero alucinaciones:</strong> Este asistente opera sobre consultas determinísticas contra la base de datos activa. No genera texto especulativo ni inventa artículos de ley inexistentes.
          </p>
        </div>
      </div>

      {/* Preset Query Chips */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Consultas Frecuentes Recomendadas:</span>
        <div className="flex flex-wrap gap-2">
          {presetQueries.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(preset)}
              className="text-xs px-3 py-1.5 bg-white hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 border border-slate-200 rounded-lg text-slate-700 transition-all text-left"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Query History */}
      <div className="space-y-5">
        {history.map((item, idx) => (
          <div key={idx} className="space-y-3">
            {/* User message */}
            <div className="flex justify-end">
              <div className="bg-slate-800 text-white rounded-xl rounded-tr-none px-4 py-2.5 max-w-lg text-xs font-medium shadow-sm">
                {item.query}
              </div>
            </div>

            {/* Assistant Response Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-900">Respuesta Determinística ECOINTELLIGENCE</span>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {item.response.confidenceType}
                </span>
              </div>

              {/* Summary */}
              <p className="text-xs text-slate-800 leading-relaxed font-medium">
                {item.response.summary}
              </p>

              {/* Verified Facts Table */}
              {item.response.verifiedData && item.response.verifiedData.length > 0 && (
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Datos Contrastados en Tablas de BD:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {item.response.verifiedData.map((d: any, dIdx: number) => (
                      <div key={dIdx} className="bg-white p-2 rounded border border-slate-200 text-center">
                        <span className="text-[10px] text-slate-400 block truncate">{d.label}</span>
                        <span className="text-xs font-mono font-bold text-slate-900 mt-0.5 block">{d.value}</span>
                        <span className="text-[9px] font-mono text-emerald-700 block truncate mt-0.5">[{d.sourceTable}]</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Normative References */}
              {item.response.normativeReferences && item.response.normativeReferences.length > 0 && (
                <div className="text-xs space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Marco Legal y Referencias Citadas:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {item.response.normativeReferences.map((ref: string, rIdx: number) => (
                      <span key={rIdx} className="inline-block px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
                        § {ref}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendation */}
              {item.response.recommendation && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs text-emerald-950">
                  <p className="font-bold flex items-center gap-1.5 mb-0.5 text-emerald-900">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Recomendación Técnica Operativa:
                  </p>
                  <p className="leading-relaxed">{item.response.recommendation}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input Box */}
      <div className="bg-white rounded-xl border border-slate-200 p-2 shadow-md flex items-center gap-2">
        <input
          type="text"
          placeholder="Formula una consulta ambiental (ej. '¿Cuáles son las emisiones fuera de norma?', '¿Cuántos residuos se reciclaron?')..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          disabled={loading}
          className="flex-1 px-3 py-2 text-xs focus:outline-none text-slate-900"
        />
        <button
          onClick={() => handleSend()}
          disabled={loading || !query.trim()}
          aria-label="Enviar consulta"
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5 shrink-0"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Consultar</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
