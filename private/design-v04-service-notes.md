# v04 第2段階：サービスページ

- サービスページをカテゴリ別アコーディオン＋メニュー詳細の二段階表示に変更。
- カテゴリのサマリーにはカテゴリ名、既存のサービス写真、詳細を開く案内を表示。
- カテゴリを開くと、各メニューが個別のアコーディオンで表示され、時間・料金・既存の施術部位説明を確認できる。
- 料金・施術時間・カテゴリ・施術部位の内容は src/data/business.json の既存情報を維持。
- 詳細文は既存情報を超える効能を追加せず、来店時に相談できる旨のみ補足。
- FAQとの整合性を意識し、妊娠中の方向けの施術制限など、施術条件の詳細はFAQに委ねる。
- サービスページ専用のCSSを追加。共通CSSおよび他ページの内容は意図的に変更していない。
- ビルドを実行し、dist/ を再生成。src/assets/images/2026-10-05 540px/ の画像もビルド処理で dist/images/2026-10-05 540px/ にコピーされる。
- 実機スマートフォンでの最終確認は未実施。


## Desktop refinement (follow-up)
- Narrowed service content max width from 900px to 820px.
- Increased top spacing above the service h2.
- Balanced menu duration/price with even spacing and horizontal inset.
- Increased menu/category typography at viewport widths of 1024px and above.
