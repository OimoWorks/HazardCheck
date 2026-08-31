import { trackEvent } from '../lib/ga.js';

function shareUrls(text, url) {
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(url);
  return {
    x: `https://twitter.com/intent/tweet?text=${encodedText}`,
    threads: `https://threads.net/intent/post?text=${encodedText}`,
    line: `https://social-plugins.line.me/lineit/share?url=${encodedUrl}`,
  };
}

export default function ShareButtons({ text, url }) {
  const canWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const urls = shareUrls(text, url);

  async function handleWebShare() {
    trackEvent('hazard_share_click', { share_method: 'web_share' });
    try {
      await navigator.share({ text, url });
    } catch {
      // ユーザーによるキャンセル等は無視する
    }
  }

  function handleClick(method) {
    trackEvent('hazard_share_click', { share_method: method });
  }

  return (
    <section className="mx-4 mt-4">
      <h2 className="text-sm font-bold text-slate-700 mb-2">結果をシェアする</h2>
      {canWebShare ? (
        <button
          onClick={handleWebShare}
          className="w-full bg-slate-800 text-white rounded-lg py-2.5 font-bold text-sm"
        >
          共有する
        </button>
      ) : (
        <div className="flex gap-2">
          <a
            href={urls.x}
            target="_blank"
            rel="noreferrer"
            onClick={() => handleClick('x')}
            className="flex-1 text-center bg-black text-white rounded-lg py-2.5 text-sm font-bold"
          >
            X
          </a>
          <a
            href={urls.threads}
            target="_blank"
            rel="noreferrer"
            onClick={() => handleClick('threads')}
            className="flex-1 text-center bg-slate-800 text-white rounded-lg py-2.5 text-sm font-bold"
          >
            Threads
          </a>
          <a
            href={urls.line}
            target="_blank"
            rel="noreferrer"
            onClick={() => handleClick('line')}
            className="flex-1 text-center bg-[#06C755] text-white rounded-lg py-2.5 text-sm font-bold"
          >
            LINE
          </a>
        </div>
      )}
    </section>
  );
}
