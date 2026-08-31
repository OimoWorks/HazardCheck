import { HAZARD_PORTAL_URL, SAFEPIN_URL } from '../lib/constants.js';
import { trackEvent } from '../lib/ga.js';

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="font-semibold text-slate-800 text-right">{value}</span>
    </div>
  );
}

export default function ResultPanel({ locationLabel, result }) {
  const { flood, sediment, nearestShelter, placeholder } = result;

  function handleSafepinClick() {
    trackEvent('hazard_safepin_click');
  }

  return (
    <section className="mx-4 mt-4 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {placeholder && (
        <div className="bg-amber-50 text-amber-800 text-xs px-4 py-2 border-b border-amber-200">
          ⚠️ 現在は動作確認用のダミーデータで結果を表示しています。実際のハザード情報ではありません。
        </div>
      )}

      <div className="px-4 pt-4 pb-1">
        <p className="text-xs text-slate-500 truncate">{locationLabel}</p>
      </div>

      <div className="px-4 py-2">
        <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
          🌊 洪水浸水想定
        </h2>
        <div className="mt-1 divide-y divide-slate-100">
          {flood.map((f) => (
            <Row key={f.key} label={f.label} value={f.rank} />
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100 px-4 py-2">
        <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
          ⛰ 土砂災害警戒区域
        </h2>
        <div className="mt-1">
          <Row
            label="指定状況"
            value={sediment.hit ? `区域内（${sediment.types.join('・')}）` : '区域外'}
          />
        </div>
      </div>

      <div className="border-t border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
          📍 最寄りの指定避難所
        </h2>
        {nearestShelter ? (
          <>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {nearestShelter.name}（約{nearestShelter.distanceMeters}m）
            </p>
            <a
              href={SAFEPIN_URL}
              target="_blank"
              rel="noreferrer"
              onClick={handleSafepinClick}
              className="mt-2 inline-block text-sm text-sky-700 border border-sky-700 rounded-lg px-3 py-1.5 font-bold"
            >
              SafePinで詳しく見る ↗
            </a>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-500">避難所データが見つかりませんでした。</p>
        )}
      </div>

      <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 text-xs text-slate-500 leading-relaxed">
        <p>
          ※ 本結果は概算です。正確な情報は
          <a
            href={HAZARD_PORTAL_URL}
            target="_blank"
            rel="noreferrer"
            className="text-sky-700 underline mx-1"
          >
            ハザードマップポータルサイト
          </a>
          など松山市・国土交通省の公式ハザードマップをご確認ください。
        </p>
      </div>
    </section>
  );
}
