// シェア文言のテンプレート。あとから調整しやすいよう定数として分離している。

export const SHARE_HASHTAGS = ['松山市', '防災'];

function floodSummaryPhrase(floodResults) {
  const hitLayers = floodResults.filter((f) => f.hit);
  if (hitLayers.length === 0) return '浸水想定区域外';
  const l2 = floodResults.find((f) => f.key === 'flood_l2');
  if (l2?.hit) return `想定最大規模で浸水${l2.rank}`;
  const hit = hitLayers[0];
  return `${hit.label}で浸水${hit.rank}`;
}

export function buildShareText({ locationLabel, result, url }) {
  const parts = [];
  parts.push(`${locationLabel}付近は${floodSummaryPhrase(result.flood)}。`);
  if (result.sedimentHit) {
    parts.push(`土砂災害警戒区域にも該当（${result.sediment.types.join('・')}）。`);
  }
  if (result.nearestShelter) {
    parts.push(
      `最寄りの指定避難所は${result.nearestShelter.name}（約${result.nearestShelter.distanceMeters}m）。`,
    );
  }
  parts.push(SHARE_HASHTAGS.map((h) => `#${h}`).join(' '));
  if (url) parts.push(url);
  return parts.join(' ');
}
