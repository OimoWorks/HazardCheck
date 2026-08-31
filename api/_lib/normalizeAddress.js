// 住所文字列の正規化・表記ゆれ吸収ロジック。
// 国土地理院 住所検索API (`msearch.gsi.go.jp`) は多くの住所表記を解釈できるが、
// 松山市の丁目・番地・号の書き方（漢数字、全角/半角、甲乙丙付きの旧地番表記など）
// によってヒットしないことがあるため、複数の正規化候補を生成して順に試行する。

const KANJI_DIGITS = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

function kanjiNumberToArabic(str) {
  // 十の位を含む簡易な漢数字（0〜99程度）をアラビア数字に変換する。
  if (!/^[〇一二三四五六七八九十]+$/.test(str)) return null;
  if (str === '十') return 10;
  const tenIndex = str.indexOf('十');
  if (tenIndex === -1) {
    // 各桁を連結しているだけの単純な数（稀）
    let n = 0;
    for (const ch of str) n = n * 10 + (KANJI_DIGITS[ch] ?? 0);
    return n;
  }
  const before = str.slice(0, tenIndex);
  const after = str.slice(tenIndex + 1);
  const tens = before === '' ? 1 : (KANJI_DIGITS[before] ?? 1);
  const ones = after === '' ? 0 : (KANJI_DIGITS[after] ?? 0);
  return tens * 10 + ones;
}

function convertKanjiNumeralsInAddressUnits(str) {
  return str.replace(/([〇一二三四五六七八九十]+)(丁目|番地|番|号)/g, (match, kanji, unit) => {
    const n = kanjiNumberToArabic(kanji);
    return n === null ? match : `${n}${unit}`;
  });
}

function zenkakuToHankaku(str) {
  return str
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .replace(/　/g, ' ');
}

function normalizeSeparators(str) {
  return str.replace(/[ー−‐‑–—〜～]/g, '-');
}

function chomeBanchiGoToHyphen(str) {
  // 「3丁目1番地2号」「3丁目1番2号」「3丁目1-2」等をすべて「3-1-2」形式に寄せる
  return str
    .replace(/(\d+)丁目(\d+)番地の?(\d+)号/g, '$1-$2-$3')
    .replace(/(\d+)丁目(\d+)番(\d+)号/g, '$1-$2-$3')
    .replace(/(\d+)丁目(\d+)番地/g, '$1-$2')
    .replace(/(\d+)丁目(\d+)番/g, '$1-$2')
    .replace(/(\d+)丁目/g, '$1-')
    .replace(/(\d+)番地の?(\d+)号/g, '$1-$2')
    .replace(/(\d+)番(\d+)号/g, '$1-$2')
    .replace(/(\d+)番地/g, '$1')
    .replace(/(\d+)号/g, '$1')
    .replace(/-+$/g, '');
}

function stripOldLotSuffix(str) {
  // 旧地番表記の「甲」「乙」「丙」（番地の直後や末尾に付く1文字）を除去する。
  // 「丁目」を誤って壊さないよう、直前が数字またはハイフンの場合のみ対象とする。
  return str.replace(/(?<=[0-9-])[甲乙丙](?=[^目]|$)/g, '');
}

function collapseWhitespace(str) {
  return str.trim().replace(/\s+/g, '');
}

/**
 * 入力住所から、ジオコーディングAPIに順に試す候補文字列の配列を生成する。
 * 重複は除去され、元の入力に近い候補から順に並ぶ。
 */
export function buildAddressCandidates(rawInput) {
  const trimmed = collapseWhitespace(rawInput);
  const halfWidth = zenkakuToHankaku(trimmed);
  const withSeparators = normalizeSeparators(halfWidth);
  const withKanjiConverted = convertKanjiNumeralsInAddressUnits(withSeparators);
  const withHyphens = chomeBanchiGoToHyphen(withKanjiConverted);
  const withoutOldLotSuffix = stripOldLotSuffix(withHyphens);
  const hyphenNoSuffix = stripOldLotSuffix(withKanjiConverted);

  const candidates = [
    trimmed,
    withSeparators,
    withKanjiConverted,
    withHyphens,
    withoutOldLotSuffix,
    hyphenNoSuffix,
  ];

  return [...new Set(candidates.filter((c) => c && c.length > 0))];
}
