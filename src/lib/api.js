export async function geocodeAddress(address) {
  const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'ジオコーディングに失敗しました');
    err.details = data;
    throw err;
  }
  return data;
}

export async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lon}`);
    if (!res.ok) return { address: null };
    return await res.json();
  } catch {
    return { address: null };
  }
}
