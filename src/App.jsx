import { useEffect, useState } from 'react';
import Header from './components/Header.jsx';
import AddressForm from './components/AddressForm.jsx';
import MapModal from './components/MapModal.jsx';
import ResultPanel from './components/ResultPanel.jsx';
import ShareButtons from './components/ShareButtons.jsx';
import Footer from './components/Footer.jsx';
import { geocodeAddress, reverseGeocode } from './lib/api.js';
import { diagnose } from './lib/hazardLookup.js';
import { buildShareText } from './lib/shareText.js';
import { initGA, trackEvent } from './lib/ga.js';

export default function App() {
  const [addressText, setAddressText] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showMapModal, setShowMapModal] = useState(false);

  useEffect(() => {
    initGA();
  }, []);

  async function runDiagnosis(lat, lon, label, inputMethod) {
    const diagnosis = await diagnose(lon, lat);
    setResult(diagnosis);
    setLocationLabel(label);
    trackEvent('hazard_search', { input_method: inputMethod });
    trackEvent('hazard_result_view', {
      flood_hit: diagnosis.floodHit,
      sediment_hit: diagnosis.sedimentHit,
    });
  }

  async function handleTextSubmit(address) {
    setLoading(true);
    setError(null);
    try {
      const geo = await geocodeAddress(address);
      setAddressText(address);
      await runDiagnosis(geo.lat, geo.lon, geo.matchedTitle || address, 'text');
    } catch (err) {
      setResult(null);
      setError(err.message || '住所が見つかりませんでした。');
    } finally {
      setLoading(false);
    }
  }

  async function handleMapSelect(lat, lon) {
    setShowMapModal(false);
    setLoading(true);
    setError(null);
    try {
      const { address } = await reverseGeocode(lat, lon);
      const label = address || `緯度${lat.toFixed(5)}, 経度${lon.toFixed(5)}`;
      setAddressText(label);
      await runDiagnosis(lat, lon, label, 'map');
    } finally {
      setLoading(false);
    }
  }

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareText = result ? buildShareText({ locationLabel, result, url: shareUrl }) : '';

  return (
    <div className="min-h-screen max-w-md mx-auto">
      <Header />

      <AddressForm
        value={addressText}
        onChange={setAddressText}
        onSubmit={handleTextSubmit}
        onOpenMap={() => setShowMapModal(true)}
        loading={loading}
      />

      {error && (
        <p className="mx-4 mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {result && (
        <>
          <ResultPanel locationLabel={locationLabel} result={result} />
          <ShareButtons text={shareText} url={shareUrl} />
        </>
      )}

      <Footer />

      {showMapModal && (
        <MapModal onClose={() => setShowMapModal(false)} onSelect={handleMapSelect} />
      )}
    </div>
  );
}
