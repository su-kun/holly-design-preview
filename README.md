# healing salon Holly 公式サイト

`build.mjs` が JSON と共通パーツから HTML を作っています。

---

## 1. フォルダの考え方（「公開してはいけないファイル」の分離）

```
healing-salon-holly/
├─ src/                  ← ここだけを編集する（素材と文章）
│   ├─ data/
│   │   ├─ business.json   文章・料金・FAQ・ギャラリー・リンク・ナビ
│   │   └─ calendar.json   休業日
│   └─ assets/             そのまま公開される素材（css / images / favicon）
├─ build.mjs             ← src から dist を作るプログラム（変更不要）
├─ dist/                 ← 完成品。★公開するのはこのフォルダだけ★（毎回作り直される）
├─ tools/
│   └─ calendar-maker.html   営業カレンダー作成ツール（公開されない）
├─ private/              ← 公開されない資料置き場（briefing.md、確認事項メモ など）
├─ package.json
└─ README.md
```

- **公開されるのは `dist/` の中身だけ**です。`private/`・`tools/`・`src/data/` は、アップロードしない限りインターネットに出ません。
- だから、これからは「作業フォルダに何を置いてもよい」状態です。下書き・スクリーンショット・メモは `private/` に置いてください。
- サイトに出したい画像は `src/assets/images/` に入れます（入れたものだけが公開されます）。

## 2. 手元での使い方

npm run dev
- 作ってプレビュー
- http://localhost:8788/（ページを開くたびに最新の内容で作り直します）
npm run build
- dist/ を作り直す（リンク切れ・重い画像・書き間違いも自動チェックします）

`npm` が使えない場合は `node build.mjs` / `node build.mjs --serve` でも同じです。

## 3. どこを直せば、何が変わるか

| 変えたいこと | 編集するもの |
|---|---|
| 文章（コンセプト・強み・歓迎するお客様） | `src/data/business.json` の `concept` / `forte` / `target_customers`（1項目＝1段落） |
| 料金・メニュー | `services`（税込で書く） |
| FAQ | `faq`（`link` を付けると内部リンクが出る） |
| 写真の追加・並べ替え | 画像を `src/assets/images/gallery/` に入れ、`gallery` に `file` と `alt` を追加 |
| ヘッダー・トップのメニュー | `site.nav`（**ヘッダーとトップページの両方に反映**されます） |
| 営業時間・住所・電話・SNS | `hours` / `location` / `contact` / `links`（電話ボタン・JSON-LD も連動） |
| 各ページのタイトル・説明文 | `pages` |
| 休業日 | `src/data/calendar.json` |
| デザイン | `src/assets/css/` |

## 4. 営業カレンダーの運用（店長さんがやること）

これまでの「Instagram 用の画像 → GPT → HTML」の代わりに、**1回の入力で両方できる**ようにしました。

1. `tools/calendar-maker.html` をダブルクリック（ブラウザで開く。ネット接続不要）
2. 月を選び、休みの日をタップ（「日曜日をすべて休みにする」ボタンあり）
3. 「画像を保存する」→ Instagram に投稿
4. 「コピーする」→ 管理担当に LINE で送る（例: `"2026-11": { "published": true, "closed": [1, 8, 15, 22, 29] },`）
5. 管理担当が `src/data/calendar.json` の `months` の中に貼り付けて `npm run build` → 公開

- `published` が `false` の月はサイトに出ません（12月のように「まだ未定」の月は `false` のままにします）。
- 貼り付けの際、最後に `,` が残っても大丈夫です（自動で許容します）。
- すでに画像だけがある場合は、GPT に次のように頼めば JSON にできます（**必ず日付と曜日を見直してください**）。

> 添付のカレンダー画像から、色がついている日（休業日）の日付だけを読み取り、次の形式で出力してください。対象月は 2026年11月 です。
> `"2026-11": { "published": true, "closed": [1, 8, 15] },`
> 読み取れない日は推測せず「不明」と書いてください。

## 5. Cloudflare Pages で公開する

### 方法A（おすすめ）: Git 連携

1. GitHub にこのフォルダを置く（`dist/` は `.gitignore` で除外済み）
2. Cloudflare Pages → 「Git に接続」→ リポジトリを選ぶ
3. ビルド設定
   - ビルドコマンド: `npm run build`
   - ビルド出力ディレクトリ: `dist`
   - 環境変数（任意）: `NODE_VERSION` = `20`
4. 以後は `calendar.json` などを GitHub 上で編集して保存するだけで、自動で再公開されます（手元にソフトがなくても更新できます）

### 方法B: dist を直接アップロード

1. `npm run build`
2. Cloudflare Pages →「直接アップロード」→ **`dist` フォルダ**をドラッグ＆ドロップ
   （同梱の `dist/` は、`site.url` が空の状態で作ってあります。ドメインが決まったら作り直してください）

> どちらの方法でも、**プロジェクト全体ではなく `dist` だけ**を公開します。

### ドメイン決定後にやること

1. `src/data/business.json` の `site.url` に `https://〇〇.pages.dev`（または独自ドメイン）を入れる（末尾の `/` なし）
2. 再ビルド → `canonical`・OGP画像（シェア時の画像）・`sitemap.xml`・`robots.txt` の Sitemap 行が自動で入ります
3. Google Search Console に `sitemap.xml` を登録する

OGP の画像（`images/ogp.png`、1200×630）はすでに入っています。絶対URLは `site.url` から自動で組み立てられます。

## 6. 画像のルール

| 用途 | 長辺の目安 | 容量の目安 |
|---|---|---|
| ギャラリー / サービス写真 | 1200〜1400px | 1枚 300KB 以下 |
| 地図画像 | 1200px | 300KB 以下 |

- 形式は **webp**（品質 75〜80）がおすすめです。
- `cwebp -q 78 -resize 1400 0 元画像.jpg -o 1.webp`
- スマホ写真をそのまま入れると 5〜10MB になることがあります。必ず縮小してから入れてください。
- `npm run build` は、500KB を超える画像に警告を出します。
- Cloudflare Pages は **1ファイル 25MB まで**です。動画は 720p 程度に圧縮してください。

### map 画像・道案内動画を載せるとき

画像は `src/assets/images/access/`、動画は `src/assets/movies/`（なければ作る）に入れ、`business.json` の `location.route_media` を書き換えます。**書いた分だけアクセスページの道順の下に表示されます**（空のままなら何も出ません）。

```json
"route_media": {
  "maps": [
    { "file": "map1.webp", "alt": "赤羽駅周辺の広域マップ（★が店舗）", "caption": "広域マップ" },
    { "file": "map2.webp", "alt": "赤羽駅から店舗までの詳細マップ", "caption": "駅からの道のり" }
  ],
  "video": { "file": "route.mp4", "poster": "route-poster.webp", "caption": "駅から店舗までの道案内動画" }
}
```

## 7. フォントについて

- 以前の指定（`inter`, `Noto Sans JP`）は、**訪問者の端末に入っていなければ使われず**、最後は端末の標準フォント（明朝体になる環境もあります）になっていました。
- 日本語フォントのファイルは 1 つ数 MB あり、`font/` に ttf を置く方法はサイトが重くなるので不要です。
- 今回は **Google Fonts から Noto Sans JP を読み込み**、読み込めない場合は端末の日本語ゴシック（Hiragino / Yu Gothic / Meiryo）に切り替わる指定にしました。これで追加作業は要りません。

## 8. 公開前チェックリスト

- [ ] `private/確認事項.md` の項目を店長さんに確認した
- [ ] スマホ（実機）でトップ・サービス・アクセス・カレンダー・ギャラリーを確認した
- [ ] LINE や X でトップページのURLを貼り、シェア画像が出る
- [ ] 12月・11月の `published` を、確定してから `true` にする

## 9. PHP 版からの主な変更点

- PHP を静的HTML生成に変更（Cloudflare Pages 対応）。URL は `/service/` のような形になりました。
- サービス写真の参照を `.png` → `.webp` に修正（以前は全件表示されませんでした）。
- 営業カレンダーを JSON から自動生成（曜日見出し・「休」表示・スマホ対応・前後の月へのリンク付き）。12月の誤り（日付のずれ・31日）も解消。
- ヘッダーとトップのメニューを `site.nav` に一本化し、営業カレンダーへのリンクを追加。
- `<meta charset>`、canonical、OGP、JSON-LD、アイコン一式、`robots.txt`、`sitemap.xml`、`404.html`、`_headers` を整備。
- 写真・ロゴを軽量化（写真 約18.7MB → 約1MB）。ロゴは 512px に縮小し、本物の `favicon.ico` も作成。
- ギャラリーは 4列 → 3列 → 2列、予約ボタンは背景付きの1行バーに変更。
- 文章の手動 `<br>` を段落に変更（スマホでの不自然な折り返しを解消）。
- 表記を統一（「Vinca hair 内個室」、営業時間「月〜土」、価格は税込、「女性向け・個室」）。
- 宣伝色の強い表現を推敲（根拠が確認できる「新人の頃から指名が絶えなかった」は残しています）。
- FAQ に「営業日」「お子様連れ」「車椅子」「出張」を追加。
- アクセスに電話番号・周辺の駅・ご来店前の注意を追加。地図のiframeにタイトルを付与。
