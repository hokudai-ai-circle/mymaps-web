/**
 * ブラウザの Geolocation API との境界。
 *
 * 距離の計算は `lib/geo.ts` に純粋関数として置いてある。
 * このファイルはブラウザから座標を受け取るだけで、判断のロジックは持たない
 * （`lib/eventSource.ts` の「取得と判断を分ける」方針と同じ）。
 *
 * 元になったExpo版ではWebは「機能自体が無い」扱いだったが、
 * このアプリではWebが主要な提供先になるため、ここで本実装にする。
 *
 * ## 位置情報を外に出さない
 *
 * ここで取った座標はブラウザ内に留める。保存もしない（`AppContext` の
 * 永続化の対象に入れていない）。会期が終わったあとに、
 * その人がどこにいたかの記録が残る理由がない。
 */

import type { LatLng } from '@/lib/geo';

/**
 * 位置情報の状態。
 *
 * `denied` と `unavailable` を分けているのは、画面に出す言葉が変わるため。
 * 拒否なら「ブラウザの設定から許可できます」と言えるが、取得失敗にそれを言うと嘘になる。
 */
export type LocationStatus =
  /** まだ聞いていない */
  | 'idle'
  /** 許可を求めている、または座標を取りに行っている */
  | 'loading'
  /** 取得できた */
  | 'granted'
  /** 利用者が断った */
  | 'denied'
  /** 許可はあるが座標が取れない（屋内・GPSオフなど）、またはこの環境に機能が無い */
  | 'unavailable';

export type LocationResult = {
  status: LocationStatus;
  coords: LatLng | null;
};

/**
 * 現在地を取りに行く。
 *
 * **一度断られたら聞き直さない。** 呼び出し側（`AppContext`）が
 * `denied` を受け取ったあと、明示的な再操作なしに再度呼ばない方針は
 * ブラウザでも同じにする（断った相手に何度もダイアログを出すのは筋が悪い）。
 *
 * **精度は高精度を強制しない。** このアプリが必要とするのは
 * 「どの会場に近いか」「徒歩何分か」で、数十メートルの差は徒歩1分未満にしかならない。
 * 会期中ずっと使う道具なので、電池を削る側に倒さない。
 */
export async function getCurrentLocation(): Promise<LocationResult> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return { status: 'unavailable', coords: null };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          status: 'granted',
          coords: { lat: position.coords.latitude, lng: position.coords.longitude },
        });
      },
      (error) => {
        // 屋内で座標が取れない、位置情報サービス自体がオフ、など。
        // 落とさない。位置情報が無くてもこのアプリは成立する
        if (error.code === error.PERMISSION_DENIED) {
          resolve({ status: 'denied', coords: null });
          return;
        }
        console.warn('現在地を取得できませんでした', error.message);
        resolve({ status: 'unavailable', coords: null });
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  });
}
