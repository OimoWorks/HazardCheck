export default function AddressForm({ value, onChange, onSubmit, onOpenMap, loading }) {
  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="px-4">
      <label htmlFor="address" className="block text-sm font-medium text-slate-700 mb-1">
        住所を入力
      </label>
      <input
        id="address"
        type="text"
        inputMode="text"
        placeholder="例）松山市三番町3丁目1-1"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-sky-600"
      />
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="flex-1 bg-sky-700 disabled:bg-slate-300 text-white rounded-lg py-2.5 font-bold text-sm"
        >
          {loading ? '診断中…' : '診断する'}
        </button>
        <button
          type="button"
          onClick={onOpenMap}
          className="flex-1 border border-sky-700 text-sky-700 rounded-lg py-2.5 font-bold text-sm"
        >
          🗺️ 地図から選ぶ
        </button>
      </div>
    </form>
  );
}
