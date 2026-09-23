/**
 * 広告および掲載枠の設定管理
 * /admin/ads ページで設定コードを生成し、このファイルにペーストして更新できます。
 */

export type AdCategory = 'hotel' | 'car' | 'activity' | 'wifi' | 'other';

export interface AdItem {
  id: string;
  name: string;
  category: AdCategory;
  linkUrl: string;
  imageUrl: string;
  width: number;
  height: number;
  alt: string;
  trackingPixelUrl?: string;
  active: boolean;
}

export type AdPlacementId = 'itinerary_bottom' | 'footer_top';

export interface AdPlacementConfig {
  id: AdPlacementId;
  name: string;
  description: string;
  enabled: boolean;
  label: string;
  icon: string;
  adIds: string[];
}

export interface AdsConfiguration {
  items: AdItem[];
  placements: Record<AdPlacementId, AdPlacementConfig>;
}

export const adsConfig: AdsConfiguration = {
  items: [
    {
      id: 'rakuten-travel-300x60',
      name: '楽天トラベル（ホテル・宿）',
      category: 'hotel',
      linkUrl: 'https://rpx.a8.net/svt/ejp?a8mat=4BCHZL+CEJ596+2HOM+6JZDD&rakuten=y&a8ejpredirect=http%3A%2F%2Fhb.afl.rakuten.co.jp%2Fhgc%2F0eb4779e.5d30c5ba.0eb4779f.b871e4e3%2Fa26092361755_4BCHZL_CEJ596_2HOM_6JZDD%3Fpc%3Dhttp%253A%252F%252Ftravel.rakuten.co.jp%252F%26m%3Dhttp%253A%252F%252Ftravel.rakuten.co.jp%252F',
      imageUrl: 'https://hbb.afl.rakuten.co.jp/hsb/0ea7f9c5.e8977d11.0ea7f99d.1ac92fca/153145/',
      width: 300,
      height: 60,
      alt: '楽天トラベルでホテル・宿を探す',
      trackingPixelUrl: 'https://www15.a8.net/0.gif?a8mat=4BCHZL+CEJ596+2HOM+6JZDD',
      active: true,
    },
    {
      id: 'airtrip-car-320x50',
      name: 'エアトリレンタカー',
      category: 'car',
      linkUrl: 'https://px.a8.net/svt/ejp?a8mat=4BCHZR+5U623E+AD2+2TA9FL',
      imageUrl: 'https://www20.a8.net/svt/bgt?aid=260923671353&wid=002&eno=01&mid=s00000001343017012000&mc=1',
      width: 320,
      height: 50,
      alt: 'エアトリで全国のレンタカーを比較・予約する',
      trackingPixelUrl: 'https://www19.a8.net/0.gif?a8mat=4BCHZR+5U623E+AD2+2TA9FL',
      active: true,
    },
  ],
  placements: {
    itinerary_bottom: {
      id: 'itinerary_bottom',
      name: '行程表下プロモーション枠',
      description: '旅程（タイムライン）の直下に表示されるメイン広告枠',
      enabled: true,
      label: '旅の準備（宿泊・レンタカー）',
      icon: '✈️',
      adIds: ['rakuten-travel-300x60', 'airtrip-car-320x50'],
    },
    footer_top: {
      id: 'footer_top',
      name: 'フッター直上枠',
      description: 'ページ最下部フッターの手前に表示される補助広告枠',
      enabled: false,
      label: 'おすすめの旅サービス',
      icon: '🧳',
      adIds: ['rakuten-travel-300x60', 'airtrip-car-320x50'],
    },
  },
};

/**
 * 指定した掲載枠に表示すべき有効な広告アイテムのリストを取得します。
 */
export function getAdsForPlacement(placementId: AdPlacementId): {
  placement: AdPlacementConfig | null;
  ads: AdItem[];
} {
  const placement = adsConfig.placements[placementId];
  if (!placement || !placement.enabled) {
    return { placement: null, ads: [] };
  }

  const itemsMap = new Map(adsConfig.items.map((item) => [item.id, item]));
  const ads = placement.adIds
    .map((id) => itemsMap.get(id))
    .filter((item): item is AdItem => Boolean(item && item.active));

  return { placement, ads };
}
