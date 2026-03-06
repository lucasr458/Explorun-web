import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useRef, useEffect } from 'react';
import type { DraftPhoto, PointConfig } from '@repo/shared-types';

interface Props {
  draftPhotos: DraftPhoto[];
  pointConfigs: Record<string, PointConfig>;
  selectedTempId: string | null;
  startPoint: { lat: number; lng: number } | null;
  placingPhotoId: string | null;
  placingStartPoint: boolean;
  onRemovePhoto: (tempId: string) => void;
  onSelectPhoto: (tempId: string) => void;
  onMapClick: (lat: number, lng: number) => void;
  onMarkerDragEnd: (tempId: string, lat: number, lng: number) => void;
  onStartPointDragEnd: (lat: number, lng: number) => void;
}

function getMarkerColor(team: 'team1' | 'team2' | 'both' | null): string {
  switch (team) {
    case 'team1': return '#2563EB';
    case 'team2': return '#DC2626';
    case 'both': return '#16A34A';
    default: return '#6B7280';
  }
}

function createMarkerElement(photo: DraftPhoto, config: PointConfig | null, isSelected: boolean): HTMLDivElement {
  const el = document.createElement('div');
  const color = getMarkerColor(config?.teamAssignment ?? null);
  const order = config?.pointOrder ?? '?';
  el.style.cssText = `
    width: 32px; height: 32px; border-radius: 50%;
    background: ${color}; border: 3px solid ${isSelected ? '#111827' : '#fff'};
    display: flex; align-items: center; justify-content: center;
    color: white; font-weight: 700; font-size: 13px;
    cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    font-family: sans-serif;
  `;
  el.textContent = String(order);
  return el;
}

function createStartMarkerElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = 'cursor: grab; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35));';
  el.innerHTML = `<svg width="34" height="32" viewBox="0 0 34 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="17,2 32,30 2,30" fill="transparent" stroke="#16A34A" stroke-width="2.5" stroke-linejoin="round"/>
  </svg>`;
  return el;
}

// When multiple photos share the same coordinates, spread them in a circle so all markers are visible
function spreadOverlappingCoords(photos: DraftPhoto[]): Array<DraftPhoto & { displayLat: number; displayLng: number }> {
  const withDisplay = photos.map(p => ({ ...p, displayLat: p.lat!, displayLng: p.lng! }));

  const groups = new Map<string, typeof withDisplay>();
  for (const photo of withDisplay) {
    const key = `${Math.round(photo.lat! * 10000)},${Math.round(photo.lng! * 10000)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(photo);
  }

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const radius = 0.00008; // ~9 metres
    group.forEach((photo, i) => {
      const angle = (2 * Math.PI * i) / group.length;
      photo.displayLat = photo.lat! + Math.cos(angle) * radius;
      photo.displayLng = photo.lng! + Math.sin(angle) * radius;
    });
  }

  return withDisplay;
}

export function CourseMapEditor({ draftPhotos, pointConfigs, selectedTempId, startPoint, placingPhotoId, placingStartPoint, onRemovePhoto, onSelectPhoto, onMapClick, onMarkerDragEnd, onStartPointDragEnd }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popupsRef = useRef<maplibregl.Popup[]>([]);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const hasAutoFittedRef = useRef(false);
  const draftPhotosRef = useRef(draftPhotos);

  // Keep ref in sync for use in recenter handler without deps
  draftPhotosRef.current = draftPhotos;

  // Initialize map on mount
  useEffect(() => {
    if (!mapContainerRef.current) return;
    hasAutoFittedRef.current = false; // reset on every map (re)creation (StrictMode safe)

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [2.3522, 48.8566],
      zoom: 12,
    });

    mapRef.current = map;

    return () => {
      startMarkerRef.current?.remove();
      startMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Manage markers when draftPhotos, pointConfigs, or selectedTempId changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing markers and popups
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    popupsRef.current.forEach(p => p.remove());
    popupsRef.current = [];

    const photosWithGps = draftPhotos.filter(
      p => p.hasGps && p.lat !== undefined && p.lng !== undefined,
    );

    const spread = spreadOverlappingCoords(photosWithGps);

    spread.forEach(photo => {
      const config = pointConfigs[photo.tempId] ?? null;
      const isSelected = photo.tempId === selectedTempId;
      const el = createMarkerElement(photo, config, isSelected);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectPhoto(photo.tempId);
      });

      // Hover popup with full reference photo
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 20,
        maxWidth: 'none',
      });

      const imgEl = document.createElement('img');
      imgEl.src = photo.previewUrl;
      imgEl.style.cssText = 'display: block; max-width: 240px; max-height: 240px; width: auto; height: auto; border-radius: 4px;';
      popup.setDOMContent(imgEl).setLngLat([photo.displayLng, photo.displayLat]);

      el.addEventListener('mouseenter', () => popup.addTo(map));
      el.addEventListener('mouseleave', () => popup.remove());

      popupsRef.current.push(popup);

      const marker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat([photo.displayLng, photo.displayLat])
        .addTo(map);

      marker.on('dragend', () => {
        const { lat, lng } = marker.getLngLat();
        onMarkerDragEnd(photo.tempId, lat, lng);
      });

      markersRef.current.push(marker);
    });

    // Auto-fit only on first load
    if (!hasAutoFittedRef.current && photosWithGps.length > 0) {
      hasAutoFittedRef.current = true;
      const firstPhoto = photosWithGps[0];
      const doFit = () => {
        if (photosWithGps.length === 1 && firstPhoto) {
          map.flyTo({ center: [firstPhoto.lng!, firstPhoto.lat!], zoom: 14 });
        } else {
          const bounds = new maplibregl.LngLatBounds();
          photosWithGps.forEach(p => bounds.extend([p.lng!, p.lat!]));
          map.fitBounds(bounds, { padding: 80, maxZoom: 16 });
        }
      };

      if (map.loaded()) {
        doFit();
      } else {
        map.once('load', doFit);
      }
    }
  }, [draftPhotos, pointConfigs, selectedTempId, onSelectPhoto, onMarkerDragEnd]);

  // Start point marker (triangle)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (startMarkerRef.current) {
      startMarkerRef.current.remove();
      startMarkerRef.current = null;
    }

    if (!startPoint) return;

    const el = createStartMarkerElement();
    const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom' })
      .setLngLat([startPoint.lng, startPoint.lat])
      .addTo(map);

    marker.on('dragend', () => {
      const { lat, lng } = marker.getLngLat();
      onStartPointDragEnd(lat, lng);
    });

    startMarkerRef.current = marker;
  }, [startPoint, onStartPointDragEnd]);

  // Placement mode: click on map to position a no-GPS photo or start point
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!placingPhotoId && !placingStartPoint) {
      map.getCanvas().style.cursor = '';
      return;
    }

    map.getCanvas().style.cursor = 'crosshair';

    const handler = (e: maplibregl.MapMouseEvent) => {
      onMapClick(e.lngLat.lat, e.lngLat.lng);
    };

    map.on('click', handler);
    return () => {
      map.off('click', handler);
      map.getCanvas().style.cursor = '';
    };
  }, [placingPhotoId, placingStartPoint, onMapClick]);

  function handleRecenter() {
    const map = mapRef.current;
    if (!map) return;
    const photosWithGps = draftPhotosRef.current.filter(
      p => p.hasGps && p.lat !== undefined && p.lng !== undefined,
    );
    if (photosWithGps.length === 0) return;
    const firstPhoto = photosWithGps[0]!;
    if (photosWithGps.length === 1) {
      map.flyTo({ center: [firstPhoto.lng!, firstPhoto.lat!], zoom: 14 });
    } else {
      const bounds = new maplibregl.LngLatBounds();
      photosWithGps.forEach(p => bounds.extend([p.lng!, p.lat!]));
      map.fitBounds(bounds, { padding: 80, maxZoom: 16 });
    }
  }

  return (
    <div className="flex-1 relative">
      <div
        ref={mapContainerRef}
        className="w-full rounded-xl overflow-hidden"
        style={{ height: '600px', filter: 'grayscale(30%) sepia(5%)' }}
      />
      <button
        type="button"
        onClick={handleRecenter}
        className="absolute bottom-4 right-4 bg-white rounded-lg shadow-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 border border-gray-200 flex items-center gap-1.5"
        title="Recentrer la carte sur tous les points"
      >
        ⊙ Recentrer
      </button>
    </div>
  );
}
