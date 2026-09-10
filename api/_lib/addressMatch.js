// ジオコーディング結果が、検索した番地と実際に一致しているかを検証するための
// 簡易チェック。GSI・Google Geocoding のいずれも「配列の先頭」を無条件に採用すると、
// 番地が存在しない/インデックスされていない住所に対して、字名だけが一致する
// 別の場所（学校・施設等）の住所を誤って返すことがあるため、
// 検索文字列と結果文字列それぞれから最初の番地数字を抽出して比較する。

// Google Geocoding は premise / formatted_address を全角数字・全角ハイフンで
// 返すことがある（例: "７７５－１"、"...中通７７５−１"）。ROOFTOP精度の正しい
// 結果であっても、全角/半角の違いだけで数字比較が食い違ってしまわないよう、
// 比較前に全角数字→半角、各種ハイフン風記号→半角ハイフンに統一する。
function normalizeDigitsAndHyphens(str) {
  return str
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[－ー−‐‑–—〜～]/g, '-');
}

// Google Geocoding の formatted_address は "日本、〒799-2434 愛媛県松山市中通甲775-1"
// のように郵便番号を先頭に含むことが多く、これを除去せずに「最初の数字」を
// 抽出すると郵便番号（799）を番地と誤認してしまう。
function stripPostalCode(str) {
  return str.replace(/〒\s*[0-9]{3}-?[0-9]{4}/g, '');
}

/**
 * 文字列中で最初に出現する数字の並びを抽出する（住所の「番地」を想定）。
 * 全角数字・全角ハイフン等の正規化、郵便番号の除去を行ってから判定する。
 * 例: "愛媛県松山市中通甲775-1" → 775
 * 例: "日本、〒799-2434 愛媛県松山市中通甲775-1" → 775（799ではない）
 * 例: "愛媛県松山市中通７７５−１" → 775（全角でも正しく775と認識する）
 */
export function extractPrimaryNumber(str) {
  if (!str) return null;
  const normalized = normalizeDigitsAndHyphens(String(str));
  const cleaned = stripPostalCode(normalized);
  const match = cleaned.match(/[0-9]+/);
  return match ? Number(match[0]) : null;
}

/**
 * 検索に使った住所文字列と、ジオコーディング結果の住所文字列を比較し、
 * 番地が食い違っていないかを判定する。
 *
 * - 検索文字列に番地の数字が含まれない場合（町名までの検索等）は判定しない
 * - 検索文字列に番地があるのに結果側に番地の数字が全くない場合は不一致とみなす
 *   （字名レベルの粗い一致で満足してしまうと、実際の番地とは離れた地点を
 *   指してしまう可能性があるため）
 *
 * 既知の制限: 「最初に出現する数字」を単純比較しているため、丁目を含む住所で
 * 検索側と結果側で丁目の表記（漢数字/アラビア数字）や順序が食い違うと、
 * 実際には正しい結果を誤って却下する可能性がある（本アプリの正規化処理は
 * 丁目の漢数字をアラビア数字に変換して検索するため通常は揃うが、GSI/Google側の
 * 応答形式が異なるケースまでは保証できない）。ハザード診断という性質上、
 * 「不確かな一致を弾いて未検出扱いにする」方を「誤った地点を確信度高く返す」
 * より安全側とみなし、あえて厳しめの判定にしている。
 */
export function isBanchiMismatch(queryAddress, resultAddress) {
  const queryNumber = extractPrimaryNumber(queryAddress);
  if (queryNumber === null) return false;
  const resultNumber = extractPrimaryNumber(resultAddress);
  if (resultNumber === null) return true;
  return queryNumber !== resultNumber;
}
