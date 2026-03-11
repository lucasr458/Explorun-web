import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SessionPoint, SessionPlayer, SessionState } from '../types.js';
import { getSessionState, getSessionPlayers } from '../services/api.js';

// ---------------------------------------------------------------------------
// Marker helpers
// ---------------------------------------------------------------------------

function createPointMarker(
  point: SessionPoint,
  isCapTeam1: boolean,
  isCapTeam2: boolean,
): HTMLDivElement {
  const el = document.createElement('div');

  let bgColor: string;
  let borderColor: string;
  let textColor: string;

  const order = String(point.pointOrder);

  if (point.teamAssignment === 'team1') {
    if (isCapTeam1) {
      bgColor = '#3B82F6'; borderColor = 'white'; textColor = 'white';
    } else {
      bgColor = 'white'; borderColor = '#3B82F6'; textColor = '#3B82F6';
    }
  } else if (point.teamAssignment === 'team2') {
    if (isCapTeam2) {
      bgColor = '#F97316'; borderColor = 'white'; textColor = 'white';
    } else {
      bgColor = 'white'; borderColor = '#F97316'; textColor = '#F97316';
    }
  } else {
    // 'both'
    if (isCapTeam1 && isCapTeam2) {
      bgColor = '#22C55E'; borderColor = 'white'; textColor = 'white';
    } else if (isCapTeam1) {
      bgColor = '#3B82F6'; borderColor = 'white'; textColor = 'white';
    } else if (isCapTeam2) {
      bgColor = '#F97316'; borderColor = 'white'; textColor = 'white';
    } else {
      bgColor = 'white'; borderColor = '#22C55E'; textColor = '#22C55E';
    }
  }

  el.style.cssText = `
    width: 32px; height: 32px; border-radius: 50%;
    background: ${bgColor}; border: 3px solid ${borderColor};
    display: flex; align-items: center; justify-content: center;
    color: ${textColor}; font-weight: 700; font-size: 12px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    font-family: sans-serif; user-select: none;
  `;
  el.textContent = order;
  return el;
}

function createStartMarkerElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = 'filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));';
  el.innerHTML = `<svg width="30" height="28" viewBox="0 0 30 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="15,2 28,26 2,26" fill="#16A34A" stroke="white" stroke-width="2" stroke-linejoin="round"/>
  </svg>`;
  return el;
}

// ---------------------------------------------------------------------------
// Session map
// ---------------------------------------------------------------------------

function SessionMap({
  points,
  capturedByTeam1,
  capturedByTeam2,
  startLocation,
  height,
}: {
  points: SessionPoint[];
  capturedByTeam1: Set<string>;
  capturedByTeam2: Set<string>;
  startLocation: { lat: number; lng: number } | null;
  height: number;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const hasAutoFittedRef = useRef(false);

  // Init map once — container has an explicit pixel height, so MapLibre gets real dimensions
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [2.3522, 48.8566],
      zoom: 12,
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Resize map when container height changes
  useEffect(() => {
    mapRef.current?.resize();
  }, [height]);

  // Update markers whenever data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateMarkers = () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      if (startLocation) {
        const el = createStartMarkerElement();
        const m = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([startLocation.lng, startLocation.lat])
          .addTo(map);
        markersRef.current.push(m);
      }

      for (const point of points) {
        const isCapTeam1 = capturedByTeam1.has(point.id);
        const isCapTeam2 = capturedByTeam2.has(point.id);
        const el = createPointMarker(point, isCapTeam1, isCapTeam2);
        const m = new maplibregl.Marker({ element: el })
          .setLngLat([point.lng, point.lat])
          .addTo(map);
        markersRef.current.push(m);
      }

      if (!hasAutoFittedRef.current && points.length > 0) {
        hasAutoFittedRef.current = true;
        const bounds = new maplibregl.LngLatBounds();
        for (const p of points) bounds.extend([p.lng, p.lat]);
        if (startLocation) bounds.extend([startLocation.lng, startLocation.lat]);
        map.fitBounds(bounds, { padding: 60, maxZoom: 16 });
      }
    };

    if (map.loaded()) {
      updateMarkers();
    } else {
      map.once('load', updateMarkers);
    }
  }, [points, capturedByTeam1, capturedByTeam2, startLocation]);

  function handleRecenter() {
    const map = mapRef.current;
    if (!map || points.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const p of points) bounds.extend([p.lng, p.lat]);
    if (startLocation) bounds.extend([startLocation.lng, startLocation.lat]);
    map.fitBounds(bounds, { padding: 60, maxZoom: 16 });
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: `${height}px` }}>
      {/* Map canvas */}
      <div
        ref={mapContainerRef}
        style={{ position: 'absolute', inset: 0 }}
      />

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 40, left: 12,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(4px)',
        borderRadius: 10, padding: '10px 12px', fontSize: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)', border: '1px solid #e5e7eb',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {([
          ['#3B82F6', 'white', 'Équipe 1 — validé'],
          ['white', '#3B82F6', 'Équipe 1 — à trouver'],
          ['#F97316', 'white', 'Équipe 2 — validé'],
          ['white', '#F97316', 'Équipe 2 — à trouver'],
          ['#22C55E', 'white', 'Les deux équipes'],
        ] as [string, string, string][]).map(([bg, border, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151' }}>
            <span style={{
              display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
              background: bg, border: `2.5px solid ${border}`,
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)', flexShrink: 0,
            }} />
            {label}
          </div>
        ))}
      </div>

      {/* Recenter button */}
      <button
        type="button"
        onClick={handleRecenter}
        style={{
          position: 'absolute', bottom: 40, right: 12,
          background: 'white', border: '1px solid #e5e7eb',
          borderRadius: 8, padding: '6px 12px', fontSize: 13,
          color: '#374151', cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
        }}
      >
        ⊙ Recentrer
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SessionDetailPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const headerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<SessionState | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapHeight, setMapHeight] = useState(400);

  // Measure header height and compute map height
  useEffect(() => {
    function computeMapHeight() {
      const headerH = headerRef.current?.offsetHeight ?? 0;
      setMapHeight(window.innerHeight - headerH);
    }
    computeMapHeight();
    window.addEventListener('resize', computeMapHeight);
    return () => window.removeEventListener('resize', computeMapHeight);
  }, [state]); // re-run when state loads (header content changes)

  function fetchData(silent = false) {
    if (!code) return;
    if (!silent) setLoading(true);
    Promise.all([getSessionState(code), getSessionPlayers(code)])
      .then(([stateRes, playersRes]) => {
        setState(stateRes.data);
        setPlayers(playersRes.data);
        setError(null);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Erreur de chargement'))
      .finally(() => { if (!silent) setLoading(false); });
  }

  useEffect(() => { fetchData(); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh silencieux toutes les 10 s
  useEffect(() => {
    const id = setInterval(() => fetchData(true), 10_000);
    return () => clearInterval(id);
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white' }}>
        <p style={{ color: '#6b7280', fontSize: 14 }}>Chargement de la session…</p>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'white', gap: 12 }}>
        <p style={{ color: '#dc2626', fontSize: 14 }}>{error ?? 'Session introuvable'}</p>
        <button onClick={() => navigate('/')} style={{ color: '#2563eb', fontSize: 14, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← Retour
        </button>
      </div>
    );
  }

  const team1Players = players.filter(p => p.team === 'team1');
  const team2Players = players.filter(p => p.team === 'team2');
  const capturedByTeam1 = new Set(state.teamProgress.team1);
  const capturedByTeam2 = new Set(state.teamProgress.team2);
  const team1Total = state.points.filter(p => p.teamAssignment === 'team1' || p.teamAssignment === 'both').length;
  const team2Total = state.points.filter(p => p.teamAssignment === 'team2' || p.teamAssignment === 'both').length;
  const team1Score = state.teamProgress.team1.length;
  const team2Score = state.teamProgress.team2.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'white', overflow: 'hidden' }}>
      {/* ── Header ── */}
      <div ref={headerRef} style={{ flexShrink: 0, borderBottom: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {/* Back + session info */}
        <div className="flex items-center gap-3 px-4 pt-3 pb-2 flex-wrap">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-500 hover:text-gray-700 flex-shrink-0"
          >
            ← Retour
          </button>
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="font-mono font-bold tracking-widest text-gray-900">{state.sessionCode}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
              state.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {state.status === 'active' ? 'En cours' : 'Lobby'}
            </span>
            <span className="text-sm text-gray-500 truncate">{state.courseName}</span>
          </div>
        </div>

        {/* Scores + players */}
        <div className="grid grid-cols-2 gap-2 px-4 pb-3">
          {/* Team 1 */}
          <div className="bg-blue-50 rounded-xl p-3">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Équipe 1</span>
              <span className="text-xl font-bold text-blue-700 leading-none">
                {team1Score}<span className="text-sm font-medium text-blue-400">/{team1Total}</span>
              </span>
            </div>
            {team1Players.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {team1Players.map(p => (
                  <span key={p.id} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    {p.playerName ?? 'Anonyme'}{p.role === 'leader' ? ' ★' : ''}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-blue-300">Aucun joueur</p>
            )}
          </div>

          {/* Team 2 */}
          <div className="bg-orange-50 rounded-xl p-3">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs font-semibold text-orange-600 uppercase tracking-wide">Équipe 2</span>
              <span className="text-xl font-bold text-orange-700 leading-none">
                {team2Score}<span className="text-sm font-medium text-orange-400">/{team2Total}</span>
              </span>
            </div>
            {team2Players.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {team2Players.map(p => (
                  <span key={p.id} className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                    {p.playerName ?? 'Anonyme'}{p.role === 'leader' ? ' ★' : ''}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-orange-300">Aucun joueur</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Map ── */}
      <SessionMap
        points={state.points}
        capturedByTeam1={capturedByTeam1}
        capturedByTeam2={capturedByTeam2}
        startLocation={state.startLocation}
        height={mapHeight}
      />
    </div>
  );
}
