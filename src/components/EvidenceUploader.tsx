import React, { useState, useRef } from 'react';
import { Upload, Camera, X, Image as ImageIcon, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { api, EvidenceImage } from '../services/api';
import { ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_FILE_SIZE_BYTES } from '../utils/metrics';

interface EvidenceUploaderProps {
  module: string;
  facilityId?: string;
  entityId?: string;
  onUploaded?: (newEvidences: EvidenceImage[]) => void;
  onCancel?: () => void;
  categories?: string[];
  defaultCategory?: string;
  compact?: boolean;
}

interface QueuedFile {
  id: string;
  file: File;
  previewUrl: string;
  title: string;
  category: string;
  observations: string;
  error?: string;
}

export const EvidenceUploader: React.FC<EvidenceUploaderProps> = ({
  module,
  facilityId,
  entityId,
  onUploaded,
  onCancel,
  categories = ['Inspección en Terreno', 'Registro de Monitoreo', 'Placa Identificatoria', 'Etiquetado y Señalética', 'Manifiesto / Guía', 'Condición Operativa', 'Otros'],
  defaultCategory = 'Inspección en Terreno',
  compact = false
}) => {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const processFiles = (files: FileList | File[]) => {
    setGlobalError(null);
    const newItems: QueuedFile[] = [];

    Array.from(files).forEach((file) => {
      // Validate MIME type
      if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
        newItems.push({
          id: Math.random().toString(36).substring(2, 9),
          file,
          previewUrl: '',
          title: file.name.replace(/\.[^/.]+$/, ''),
          category: defaultCategory,
          observations: '',
          error: `Formato no admitido (${file.type || 'desconocido'}). Use JPEG, PNG, WebP o SVG.`
        });
        return;
      }

      // Validate size
      if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
        newItems.push({
          id: Math.random().toString(36).substring(2, 9),
          file,
          previewUrl: '',
          title: file.name.replace(/\.[^/.]+$/, ''),
          category: defaultCategory,
          observations: '',
          error: `Tamaño excede 15MB (${(file.size / (1024 * 1024)).toFixed(1)}MB).`
        });
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      newItems.push({
        id: Math.random().toString(36).substring(2, 9),
        file,
        previewUrl,
        title: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
        category: defaultCategory,
        observations: ''
      });
    });

    setQueue((prev) => [...prev, ...newItems]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (id: string) => {
    setQueue((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const updateField = (id: string, field: 'title' | 'category' | 'observations', value: string) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleUploadAll = async () => {
    const validItems = queue.filter((item) => !item.error);
    if (validItems.length === 0) {
      setGlobalError('No hay archivos válidos en la cola para subir.');
      return;
    }

    setIsUploading(true);
    setGlobalError(null);

    try {
      const payload = await Promise.all(
        validItems.map(async (item) => {
          const dataUrl = await fileToDataUrl(item.file);
          return {
            facilityId,
            module,
            entityId,
            title: item.title.trim() || item.file.name,
            category: item.category,
            observations: item.observations.trim(),
            fileName: item.file.name,
            mimeType: item.file.type,
            fileSizeBytes: item.file.size,
            dataUrl,
            capturedAt: new Date().toISOString()
          };
        })
      );

      const res = await api.uploadEvidencesBatch(payload);
      // Clean preview object URLs
      queue.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      setQueue([]);

      if (onUploaded) {
        onUploaded(res.evidences);
      }
    } catch (err: any) {
      setGlobalError(err.message || 'Error al subir las evidencias fotográficas.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-5 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-stone-200 mb-4">
        <div>
          <h3 className="text-base font-semibold text-stone-900 flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-700" />
            Carga Universal de Evidencias Fotográficas
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Módulo: <span className="font-medium capitalize text-stone-700">{module}</span> | Capacidad técnica: hasta 15MB por archivo sin cuota artificial
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-stone-400 hover:text-stone-700 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {globalError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{globalError}</span>
        </div>
      )}

      {/* Dropzone & Action Buttons */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
          isDragOver
            ? 'border-emerald-600 bg-emerald-50/50'
            : 'border-stone-300 hover:border-emerald-500 bg-stone-50/50'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center">
            <Upload className="w-6 h-6" />
          </div>
        </div>
        <p className="text-sm font-medium text-stone-800">
          Arrastra y suelta fotografías aquí o haz clic para explorar
        </p>
        <p className="text-xs text-stone-500 mt-1">
          Soporta múltiples archivos simultáneos (JPEG, PNG, WebP, SVG). Sin límite artificial de imágenes.
        </p>

        {/* Buttons for desktop vs mobile camera */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <ImageIcon className="w-4 h-4" />
            Seleccionar Archivos
          </button>

          {/* Direct Camera capture for tablets & mobile devices */}
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="px-3.5 py-1.5 bg-stone-800 hover:bg-stone-900 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            title="Activar cámara del dispositivo móvil o tablet"
          >
            <Camera className="w-4 h-4 text-emerald-400" />
            Tomar Foto Directa (Cámara)
          </button>
        </div>

        {/* Hidden inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/svg+xml"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Preview Queue */}
      {queue.length > 0 && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-700 uppercase tracking-wider">
              Cola de Carga ({queue.length} {queue.length === 1 ? 'fotografía' : 'fotografías'})
            </span>
            <button
              type="button"
              onClick={() => {
                queue.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
                setQueue([]);
              }}
              className="text-xs text-stone-500 hover:text-red-600 transition-colors cursor-pointer"
            >
              Limpiar cola
            </button>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {queue.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded border text-left flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between ${
                  item.error ? 'bg-red-50 border-red-200' : 'bg-stone-50 border-stone-200'
                }`}
              >
                {/* Thumbnail Preview */}
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="w-16 h-16 rounded bg-stone-200 shrink-0 overflow-hidden flex items-center justify-center border border-stone-300 relative">
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt="Previsualización"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-stone-400" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => updateField(item.id, 'title', e.target.value)}
                      placeholder="Título o identificación de la evidencia"
                      className="text-xs font-semibold text-stone-800 bg-white border border-stone-200 rounded px-2 py-1 w-full focus:outline-hidden focus:ring-1 focus:ring-emerald-600"
                    />
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-stone-500">
                      <span>{(item.file.size / (1024 * 1024)).toFixed(2)} MB</span>
                      <span>•</span>
                      <span>{item.file.type || 'image'}</span>
                    </div>
                    {item.error && (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">{item.error}</p>
                    )}
                  </div>
                </div>

                {/* Metadata inputs */}
                {!item.error && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                    <select
                      value={item.category}
                      onChange={(e) => updateField(item.id, 'category', e.target.value)}
                      className="text-xs bg-white border border-stone-200 rounded px-2 py-1.5 text-stone-700 focus:outline-hidden focus:ring-1 focus:ring-emerald-600 cursor-pointer"
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      value={item.observations}
                      onChange={(e) => updateField(item.id, 'observations', e.target.value)}
                      placeholder="Observaciones de campo..."
                      className="text-xs bg-white border border-stone-200 rounded px-2 py-1.5 text-stone-700 w-full sm:w-44 focus:outline-hidden focus:ring-1 focus:ring-emerald-600"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => removeFile(item.id)}
                  className="text-stone-400 hover:text-red-600 p-1.5 rounded self-end sm:self-center transition-colors cursor-pointer"
                  title="Quitar de la cola"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Finalize Button */}
          <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-3.5 py-1.5 border border-stone-300 text-stone-700 rounded text-xs font-medium hover:bg-stone-50 cursor-pointer"
              >
                Cancelar
              </button>
            )}
            <button
              type="button"
              disabled={isUploading || queue.filter((i) => !i.error).length === 0}
              onClick={handleUploadAll}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Procesando y Guardando Evidencias...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Confirmar Carga ({queue.filter((i) => !i.error).length} Fotografías)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
