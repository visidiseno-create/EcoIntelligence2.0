import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, ZoomIn, ZoomOut, Download, Trash2, Calendar, User, Tag, FileText, X, AlertCircle, ChevronDown } from 'lucide-react';
import { EvidenceImage } from '../services/api';
import { formatBytes } from '../utils/metrics';
import { useFeedback } from './FeedbackContext';

interface EvidenceGalleryProps {
  evidences: EvidenceImage[];
  onDelete?: (id: string) => Promise<void> | void;
  userRole?: string;
  emptyMessage?: string;
  showFilters?: boolean;
  pageSize?: number;
}

const parseSafeDate = (dateStr?: string): Date => {
  if (!dateStr) return new Date();
  const normalized = dateStr.includes(' ') && !dateStr.includes('T') ? dateStr.replace(' ', 'T') : dateStr;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const getSafeSizeBytes = (item: EvidenceImage & { fileSizeKb?: number }): number => {
  if (typeof item.fileSizeBytes === 'number' && !Number.isNaN(item.fileSizeBytes)) {
    return item.fileSizeBytes;
  }
  if (typeof item.fileSizeKb === 'number' && !Number.isNaN(item.fileSizeKb)) {
    return item.fileSizeKb * 1024;
  }
  return 0;
};

const getUploaderName = (uploadedBy: EvidenceImage['uploadedBy'] | string | undefined): string => {
  if (!uploadedBy) return 'Usuario del Sistema';
  if (typeof uploadedBy === 'string') return uploadedBy;
  return uploadedBy.name || 'Usuario del Sistema';
};

const getUploaderEmail = (uploadedBy: EvidenceImage['uploadedBy'] | string | undefined): string => {
  if (!uploadedBy || typeof uploadedBy === 'string') return '';
  return uploadedBy.email || '';
};

export const EvidenceGallery: React.FC<EvidenceGalleryProps> = ({
  evidences,
  onDelete,
  userRole = 'admin',
  emptyMessage = 'No se registran evidencias fotográficas adjuntas.',
  showFilters = true,
  pageSize = 15
}) => {
  const { confirmAction } = useFeedback();
  const [selectedImage, setSelectedImage] = useState<EvidenceImage | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(pageSize);

  const canDelete = userRole !== 'lector' && Boolean(onDelete);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [filterCategory, searchQuery, evidences.length, pageSize]);

  // Extract unique categories
  const categories = Array.from(new Set(evidences.map((e) => e.category || 'General')));

  const filteredEvidences = evidences.filter((item) => {
    const matchesCat = filterCategory === 'all' || (item.category || 'General') === filterCategory;
    const matchesSearch =
      !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.observations && item.observations.toLowerCase().includes(searchQuery.toLowerCase())) ||
      item.fileName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const paginatedEvidences = filteredEvidences.slice(0, visibleCount);
  const hasMore = filteredEvidences.length > visibleCount;

  const handleOpenLightbox = (item: EvidenceImage) => {
    setSelectedImage(item);
    setZoomLevel(1);
    setDeleteError(null);
  };

  const handleCloseLightbox = () => {
    setSelectedImage(null);
    setZoomLevel(1);
  };

  const handleDownload = (item: EvidenceImage) => {
    const link = document.createElement('a');
    link.href = item.dataUrl;
    link.download = item.fileName || `evidencia_${item.id}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (id: string) => {
    if (!canDelete) return;
    const confirmed = await confirmAction({
      title: 'Eliminar evidencia fotográfica',
      message: '¿Está seguro de eliminar permanentemente esta evidencia fotográfica? Esta acción quedará registrada en la auditoría ambiental.',
      confirmLabel: 'Eliminar',
      danger: true
    });
    if (!confirmed) return;

    setDeletingId(id);
    setDeleteError(null);
    try {
      if (onDelete) {
        await onDelete(id);
      }
      if (selectedImage?.id === id) {
        handleCloseLightbox();
      }
    } catch (err: any) {
      setDeleteError(err.message || 'Error al eliminar evidencia.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters & Search Header */}
      {showFilters && evidences.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-stone-50 border border-stone-200 rounded-lg p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-stone-600">Categoría:</span>
            <button
              type="button"
              onClick={() => setFilterCategory('all')}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                filterCategory === 'all'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
              }`}
            >
              Todas ({evidences.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCategory(cat)}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                  filterCategory === cat
                    ? 'bg-emerald-700 text-white'
                    : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                }`}
              >
                {cat} ({evidences.filter((e) => (e.category || 'General') === cat).length})
              </button>
            ))}
          </div>

          <div className="w-full sm:w-60">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por título u observación..."
              aria-label="Buscar evidencias fotográficas"
              className="w-full text-xs bg-white border border-stone-200 rounded px-2.5 py-1.5 text-stone-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-600"
            />
          </div>
        </div>
      )}

      {/* Grid or Empty State */}
      {filteredEvidences.length === 0 ? (
        <div className="text-center py-10 bg-stone-50 border border-dashed border-stone-200 rounded-lg">
          <ImageIcon className="w-8 h-8 text-stone-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-stone-600">{emptyMessage}</p>
          <p className="text-xs text-stone-400 mt-1">
            Utilice el panel de carga para registrar fotos y capturas en terreno.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
            {paginatedEvidences.map((item) => (
              <div
                key={item.id}
                className="group bg-white rounded-lg border border-stone-200 overflow-hidden shadow-2xs hover:shadow-md hover:border-emerald-500 transition-all flex flex-col"
              >
                {/* Thumbnail Container */}
                <button
                  type="button"
                  aria-label={`Ampliar evidencia ${item.title}`}
                  className="relative aspect-4/3 bg-stone-100 cursor-pointer overflow-hidden flex items-center justify-center w-full text-left"
                  onClick={() => handleOpenLightbox(item)}
                >
                  <img
                    src={item.thumbnailUrl || item.dataUrl}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-stone-900/0 group-hover:bg-stone-900/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <span className="px-2.5 py-1 bg-stone-900/80 text-white rounded text-xs font-medium flex items-center gap-1 backdrop-blur-xs">
                      <ZoomIn className="w-3.5 h-3.5" />
                      Ampliar
                    </span>
                  </div>

                  {/* Category Pill */}
                  <div className="absolute top-1.5 left-1.5">
                    <span className="px-1.5 py-0.5 bg-emerald-950/80 text-emerald-200 rounded text-[10px] font-semibold backdrop-blur-xs">
                      {item.category || 'General'}
                    </span>
                  </div>
                </button>

                {/* Card Meta */}
                <div className="p-2.5 flex-1 flex flex-col justify-between">
                  <div>
                    <h4
                      className="text-xs font-semibold text-stone-900 truncate"
                      title={item.title}
                    >
                      {item.title}
                    </h4>
                    {item.observations && (
                      <p
                        className="text-[11px] text-stone-500 line-clamp-1 mt-0.5"
                        title={item.observations}
                      >
                        {item.observations}
                      </p>
                    )}
                  </div>

                  <div className="mt-2 pt-2 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-500">
                    <span className="truncate">
                      {parseSafeDate(item.uploadedAt).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short'
                      })}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(item);
                        }}
                        className="text-stone-400 hover:text-emerald-700 p-0.5 cursor-pointer"
                        aria-label={`Descargar ${item.title}`}
                        title="Descargar imagen"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          disabled={deletingId === item.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(item.id);
                          }}
                          className="text-stone-400 hover:text-red-600 p-0.5 disabled:opacity-50 cursor-pointer"
                          aria-label={`Eliminar ${item.title}`}
                          title="Eliminar evidencia"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="pt-2 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount(v => v + pageSize)}
                className="px-4 py-2 bg-white border border-stone-200 hover:border-emerald-500 hover:bg-emerald-50/40 text-stone-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5 text-emerald-700" />
                Mostrar más fotografías ({filteredEvidences.length - visibleCount} restantes)
              </button>
            </div>
          )}
        </>
      )}

      {/* Lightbox Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={handleCloseLightbox}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={selectedImage.title}
            className="bg-white rounded-lg border border-stone-300 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Lightbox Header */}
            <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between bg-stone-50">
              <div className="min-w-0 pr-4">
                <h3 className="text-sm font-bold text-stone-900 truncate">
                  {selectedImage.title}
                </h3>
                <p className="text-xs text-stone-500">
                  {selectedImage.fileName} • {formatBytes(getSafeSizeBytes(selectedImage))} • {selectedImage.mimeType}
                </p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Reducir zoom"
                  onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                  className="p-1.5 rounded hover:bg-stone-200 text-stone-700 cursor-pointer"
                  title="Reducir zoom"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-semibold text-stone-600 w-10 text-center">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  type="button"
                  aria-label="Aumentar zoom"
                  onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                  className="p-1.5 rounded hover:bg-stone-200 text-stone-700 cursor-pointer"
                  title="Aumentar zoom"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <div className="h-4 w-px bg-stone-300 mx-1" />
                <button
                  type="button"
                  onClick={() => handleDownload(selectedImage)}
                  className="px-2.5 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  title="Descargar archivo original"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar
                </button>
                {canDelete && (
                  <button
                    type="button"
                    aria-label="Eliminar evidencia"
                    disabled={deletingId === selectedImage.id}
                    onClick={() => handleDelete(selectedImage.id)}
                    className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                    title="Eliminar evidencia"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Cerrar visor"
                  onClick={handleCloseLightbox}
                  className="p-1.5 rounded hover:bg-stone-200 text-stone-500 cursor-pointer ml-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {deleteError && (
              <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                <span>{deleteError}</span>
              </div>
            )}

            {/* Lightbox Body (Image viewer) */}
            <div className="flex-1 bg-stone-900 overflow-auto flex items-center justify-center p-4 min-h-[300px] max-h-[58vh]">
              <div
                style={{
                  transform: `scale(${zoomLevel})`,
                  transition: 'transform 0.15s ease-out',
                  transformOrigin: 'center center'
                }}
                className="max-w-full max-h-full flex items-center justify-center"
              >
                <img
                  src={selectedImage.dataUrl}
                  alt={selectedImage.title}
                  className="max-h-[54vh] max-w-full object-contain shadow-2xl rounded"
                />
              </div>
            </div>

            {/* Metadata Footer */}
            <div className="p-4 bg-white border-t border-stone-200 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-stone-600">
              <div className="flex items-start gap-2">
                <Tag className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-stone-800">Categoría & Módulo:</span>
                  <p>{selectedImage.category || 'General'} • <span className="capitalize">{selectedImage.module}</span></p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-stone-800">Fecha de Carga:</span>
                  <p>{parseSafeDate(selectedImage.uploadedAt).toLocaleString('es-ES')}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <User className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-stone-800">Cargado por:</span>
                  <p>
                    {getUploaderName(selectedImage.uploadedBy)}
                    {getUploaderEmail(selectedImage.uploadedBy) ? ` (${getUploaderEmail(selectedImage.uploadedBy)})` : ''}
                  </p>
                </div>
              </div>

              {selectedImage.observations && (
                <div className="md:col-span-3 pt-2 border-t border-stone-100 flex items-start gap-2">
                  <FileText className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-stone-800">Observaciones Técnicas:</span>
                    <p className="text-stone-700 mt-0.5">{selectedImage.observations}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
