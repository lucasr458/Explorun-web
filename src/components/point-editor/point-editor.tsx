import { useState, useRef, useEffect } from 'react';
import type { DraftPhoto, PointConfig } from '../../types.js';
import { getApiUrl } from '../../services/api.js';

interface Props {
  draftPhotos: DraftPhoto[];
  pointConfigs: Record<string, PointConfig>;
  selectedTempId: string | null;
  onSelect: (tempId: string) => void;
  onConfigChange: (tempId: string, config: PointConfig) => void;
  onRemovePoint: (tempId: string) => void;
}

export function PointEditor({ draftPhotos, pointConfigs, selectedTempId, onConfigChange, onRemovePoint }: Props) {
  const photosWithGps = draftPhotos.filter(p => p.hasGps && p.lat !== undefined && p.lng !== undefined);
  const selectedPhoto = photosWithGps.find(p => p.tempId === selectedTempId) ?? null;
  const selectedConfig = selectedTempId ? (pointConfigs[selectedTempId] ?? null) : null;

  const hintFileInputRef = useRef<HTMLInputElement>(null);

  function updateConfig(partial: Partial<PointConfig>): void {
    if (!selectedTempId) return;
    const current = pointConfigs[selectedTempId] ?? {
      pointOrder: null, teamAssignment: null,
      hintText: null, hintPhotoSource: null, hintPhotoFilename: null,
    };
    onConfigChange(selectedTempId, { ...current, ...partial });
  }

  async function handleHintPhotoSelect(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedTempId) return;

    // Keep the file local instead of uploading immediately
    updateConfig({
      hintPhotoSource: 'custom',
      hintPhotoFilename: null,
      hintPhotoFile: file
    });
  }

  const customHintPreviewUrl =
    selectedConfig?.hintPhotoSource === 'custom' && selectedConfig.hintPhotoFile
      ? URL.createObjectURL(selectedConfig.hintPhotoFile)
      : selectedConfig?.hintPhotoSource === 'custom' && selectedConfig.hintPhotoFilename
        ? `${getApiUrl()}/uploads/${selectedConfig.hintPhotoFilename}`
        : null;

  return (
    <div className="flex flex-col h-full bg-white border border-gray-200 rounded-xl overflow-hidden">
      {!selectedPhoto && (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-sm text-gray-400 italic text-center">
            Cliquez sur un point de la carte pour le configurer
          </p>
        </div>
      )}

      {selectedPhoto && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col">
          {/* Photo centrée, grande */}
          <div className="relative">
            <img
              src={selectedPhoto.previewUrl}
              alt={selectedPhoto.filename}
              className="w-full h-48 object-cover"
            />
            <button
              onClick={() => onRemovePoint(selectedPhoto.tempId)}
              className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded shadow transition-colors"
              title="Supprimer ce point"
            >
              Supprimer
            </button>
          </div>

          <div className="p-4 flex flex-col gap-4">
            {/* Team assignment */}
            <div className="flex gap-2">
              {(['team1', 'team2', 'both'] as const).map(team => (
                <button
                  key={team}
                  onClick={() => updateConfig({ teamAssignment: selectedConfig?.teamAssignment === team ? null : team })}
                  className={`flex-1 py-1.5 text-xs font-medium rounded border transition-colors ${selectedConfig?.teamAssignment === team
                      ? team === 'team1' ? 'bg-blue-600 border-blue-600 text-white'
                        : team === 'team2' ? 'bg-red-600 border-red-600 text-white'
                          : 'bg-green-600 border-green-600 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  {team === 'team1' ? 'Équipe 1' : team === 'team2' ? 'Équipe 2' : 'Les deux'}
                </button>
              ))}
            </div>

            {/* Order — single line */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Numéro du point</label>
              <input
                type="number"
                min="1"
                value={selectedConfig?.pointOrder ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  updateConfig({ pointOrder: val === '' ? null : parseInt(val, 10) });
                }}
                className="w-16 border border-gray-300 rounded px-2 py-1 text-sm"
                placeholder="1"
              />
            </div>

            {/* Hints */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-medium text-gray-600">Indice</p>

              {/* Text hint */}
              <textarea
                rows={3}
                value={selectedConfig?.hintText ?? ''}
                onChange={e => updateConfig({ hintText: e.target.value === '' ? null : e.target.value })}
                placeholder="Texte d'indice (optionnel)…"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm resize-none"
              />

              {/* Photo hint */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-gray-500">Photo d'indice</p>
                <div className="flex gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`hint-source-${selectedTempId}`}
                      checked={!selectedConfig?.hintPhotoSource}
                      onChange={() => updateConfig({ hintPhotoSource: null, hintPhotoFilename: null })}
                    />
                    <span className="text-xs text-gray-700">Aucune</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`hint-source-${selectedTempId}`}
                      checked={selectedConfig?.hintPhotoSource === 'reference'}
                      onChange={() => updateConfig({ hintPhotoSource: 'reference', hintPhotoFilename: null })}
                    />
                    <span className="text-xs text-gray-700">Référence</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`hint-source-${selectedTempId}`}
                      checked={selectedConfig?.hintPhotoSource === 'custom'}
                      onChange={() => updateConfig({ hintPhotoSource: 'custom', hintPhotoFilename: null })}
                    />
                    <span className="text-xs text-gray-700">Importer</span>
                  </label>
                </div>

                {selectedConfig?.hintPhotoSource === 'reference' && (
                  <img
                    src={selectedPhoto.previewUrl}
                    alt="Référence"
                    className="w-full h-28 object-contain rounded border border-gray-200 bg-gray-50"
                  />
                )}

                {selectedConfig?.hintPhotoSource === 'custom' && (
                  <div>
                    {customHintPreviewUrl && (
                      <div className="relative">
                        <img
                          src={customHintPreviewUrl}
                          alt="Indice"
                          className="w-full h-28 object-contain rounded border border-gray-200 bg-gray-50"
                        />
                        <button
                          onClick={() => {
                            // Clean up blob URL if it exists
                            if (selectedConfig.hintPhotoFile && customHintPreviewUrl?.startsWith('blob:')) {
                              URL.revokeObjectURL(customHintPreviewUrl);
                            }
                            updateConfig({ hintPhotoFilename: null, hintPhotoFile: undefined })
                          }}
                          className="absolute top-1 right-1 bg-white rounded-full px-1 text-xs text-gray-500 hover:text-red-500 shadow"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    {!customHintPreviewUrl && (
                      <button
                        onClick={() => hintFileInputRef.current?.click()}
                        className="w-full py-2 border border-dashed border-gray-300 rounded text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                      >
                        + Choisir une photo
                      </button>
                    )}
                    <input
                      ref={hintFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={e => void handleHintPhotoSelect(e)}
                      className="hidden"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
