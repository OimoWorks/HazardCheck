import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MATSUYAMA_CITY_HALL } from '../lib/constants.js';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export default function MapModal({ onClose, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const map = L.map(containerRef.current).setView(
      [MATSUYAMA_CITY_HALL.lat, MATSUYAMA_CITY_HALL.lng],
      14,
    );
    mapRef.current = map;

    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>',
      maxZoom: 18,
    }).addTo(map);

    map.on('click', (e) => placeMarker(e.latlng.lat, e.latlng.lng));

    // モーダル表示時にコンテナサイズが確定してから描画するための保険
    setTimeout(() => map.invalidateSize(), 50);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function placeMarker(lat, lng) {
    setSelected({ lat, lng });
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      markerRef.current = L.marker([lat, lng]).addTo(mapRef.current);
    }
  }

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapRef.current?.setView([latitude, longitude], 16);
        placeMarker(latitude, longitude);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000 },
    );
  }

  function handleConfirm() {
    if (selected) onSelect(selected.lat, selected.lng);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-0 sm:px-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="font-bold text-slate-800">地図から選ぶ</h2>
          <button
            onClick={onClose}
            className="text-slate-500 text-2xl leading-none px-2"
            aria-label="閉じる"
          >
            &times;
          </button>
        </div>
        <div ref={containerRef} className="w-full h-80 sm:h-96" />
        <div className="p-4 flex flex-col gap-3 border-t border-slate-200">
          <button
            onClick={handleUseCurrentLocation}
            disabled={locating}
            className="text-sm text-sky-700 underline self-start disabled:opacity-50"
          >
            {locating ? '現在地を取得中…' : '📍 現在地を使う'}
          </button>
          <p className="text-xs text-slate-500">地図をタップして診断したい地点を選んでください。</p>
          <button
            onClick={handleConfirm}
            disabled={!selected}
            className="w-full bg-sky-700 disabled:bg-slate-300 text-white rounded-lg py-2.5 font-bold"
          >
            この地点を選択する
          </button>
        </div>
      </div>
    </div>
  );
}
