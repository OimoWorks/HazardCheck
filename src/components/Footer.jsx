import { GOODS_SIMULATOR_URL, HAZARD_PORTAL_URL, SAFEPIN_URL } from '../lib/constants.js';

export default function Footer() {
  return (
    <footer className="mt-10 px-4 pb-10">
      <div className="border-t border-slate-200 pt-4 flex flex-col gap-2 text-sm">
        <a href={SAFEPIN_URL} target="_blank" rel="noreferrer" className="text-sky-700 underline">
          🗺️ SafePin（避難所・AEDマップ）
        </a>
        {GOODS_SIMULATOR_URL && (
          <a
            href={GOODS_SIMULATOR_URL}
            target="_blank"
            rel="noreferrer"
            className="text-sky-700 underline"
          >
            🎒 防災グッズシミュレーター
          </a>
        )}
      </div>

      <div className="mt-6 text-xs text-slate-500 leading-relaxed space-y-2">
        <p>
          本サイトは個人が開発・運営する非公式のツールです。行政機関による公式サービスではありません。
        </p>
        <p>
          災害リスクの正式な確認は、
          <a href={HAZARD_PORTAL_URL} target="_blank" rel="noreferrer" className="text-sky-700 underline mx-1">
            ハザードマップポータルサイト
          </a>
          や松山市・国土交通省が公表する公式ハザードマップを参照してください。
        </p>
      </div>
    </footer>
  );
}
