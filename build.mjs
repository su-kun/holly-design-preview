#!/usr/bin/env node
/**
 * healing salon Holly — 静的サイトジェネレータ（依存パッケージなし / Node.js 18 以上）
 *
 *   node build.mjs            src/ から dist/ を生成する（Cloudflare Pages のビルドコマンド）
 *   node build.mjs --serve    生成 + 手元でプレビュー（http://localhost:8788）
 *
 * 設計の考え方
 *   - 文章・料金・FAQ・ギャラリーは src/data/business.json、休業日は src/data/calendar.json だけを編集する。
 *   - HTML の型（ヘッダー・フッター・予約ボタン等）はこのファイルに 1 か所だけ書き、全ページで共有する。
 *   - ナビゲーション（ヘッダーとトップページのリンク）は business.json の site.nav を共有し、ずれないようにしている。
 *   - 公開するのは dist/ だけ。src/・tools/・private/ はサーバーに載らない。
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const SERVE = process.argv.includes('--serve');

/* ------------------------------------------------------------------ utils */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const isExternal = (u) => /^https?:\/\//.test(u);
const extAttr = (u) => (isExternal(u) ? ' target="_blank" rel="noopener"' : '');
const yen = (n) => '¥ ' + Number(n).toLocaleString('en-US');
const paragraphs = (arr) => arr.map((t) => `<p>${esc(t)}</p>`).join('\n      ');
// JSON の読み込み。貼り付けのときに起きやすい「最後の , 」は許容し、書き間違いは分かりやすく知らせる。
const readJson = (rel) => {
  const text = fs.readFileSync(path.join(SRC, rel), 'utf8');
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(text.replace(/,(\s*[}\]])/g, '$1'));
    } catch (e) {
      console.error(`\n✘ src/${rel} の書き方に誤りがあります: ${e.message}`);
      console.error('  （よくある原因: 項目の間の「,」の付け忘れ、「"」の閉じ忘れ、全角の記号）\n');
      process.exit(1);
    }
  }
};

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/* ------------------------------------------------------------------ build */

function build({ quiet = false } = {}) {
  const warnings = [];
  const errors = [];
  const warn = (m) => warnings.push(m);
  const fail = (m) => errors.push(m);

  const biz = readJson('data/business.json');
  const cal = readJson('data/calendar.json');

  const SITE_URL = (process.env.SITE_URL || biz.site.url || '').trim().replace(/\/+$/, '');
  const abs = (p) => (SITE_URL ? SITE_URL + p : null);
  if (!SITE_URL) {
    warn('site.url が未設定です。canonical・OGP画像・sitemap.xml は出力されません（ドメイン決定後に business.json の site.url を設定して再ビルドしてください）。');
  }

  const L = biz.links;
  const nav = biz.site.nav;
  const tel = biz.contact.phone_tel;
  const h = biz.hours;
  const hoursLine = `${h.days} ${h.time} ／ 定休日：${h.closed}・${h.irregular}`;

  fs.rmSync(DIST, { recursive: true, force: true });
  copyDir(path.join(SRC, 'assets'), DIST);

  const pages = []; // sitemap 用 { path, noindex }
  const emit = (pagePath, html, { noindex = false, file } = {}) => {
    const rel = file ?? (pagePath === '/' ? 'index.html' : pagePath.slice(1) + 'index.html');
    const full = path.join(DIST, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, html);
    pages.push({ path: pagePath, noindex });
  };

  /* ---------- 共通パーツ ---------- */

  const jsonLd = () => {
    const l = biz.location;
    const data = {
      '@context': 'https://schema.org',
      '@type': 'BeautySalon',
      name: biz.business_name,
      ...(SITE_URL ? { url: SITE_URL + '/', image: SITE_URL + '/images/ogp.png' } : {}),
      telephone: biz.contact.phone_e164,
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'JP',
        postalCode: l.postal_code,
        addressRegion: l.region,
        addressLocality: l.locality,
        streetAddress: l.street,
      },
      geo: { '@type': 'GeoCoordinates', latitude: l.geo.lat, longitude: l.geo.lng },
      hasMap: L.google_maps,
      openingHoursSpecification: [
        { '@type': 'OpeningHoursSpecification', dayOfWeek: h.open_days_en, opens: h.opens, closes: h.closes },
      ],
      priceRange: biz.price_range,
      areaServed: l.catchment_areas.map((name) => ({ '@type': 'AdministrativeArea', name })),
      sameAs: [L.instagram, L.x, L.ekiten],
    };
    return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2).replace(/</g, '\\u003c')}\n</script>`;
  };

  const header = (pagePath) => `<header>
  <a href="/" class="header-logo"><img src="/images/logo.png" alt="healing salon Holly ホーム" width="100" height="100"></a>
  <nav aria-label="メインメニュー">
    ${nav
      .map((n) => `<a href="${n.path}"${pagePath.startsWith(n.path) ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`)
      .join('\n    ')}
  </nav>
</header>`;

  const footer = () => `<footer>
  <h4>${esc(biz.business_name)}</h4>
  <p class="footer-note">${esc(biz.disclaimer)}</p>
  <p class="footer-copy">&copy; ${new Date().getFullYear()} ${esc(biz.business_name)}</p>
</footer>`;

  const cta = () => `<section id="cta" aria-label="予約・お電話">
  <div class="cta-area">
    <a href="${L.reserve}" class="cta-btn btn-reserve"${extAttr(L.reserve)}>Webで予約する</a>
    <a href="${L.line}" class="cta-btn btn-line"${extAttr(L.line)}>LINEで予約する</a>
    <a href="tel:${tel}" class="cta-btn btn-tel">お店へ電話する</a>
  </div>
</section>`;

  function layout({ path: pagePath, title, description, body, withJsonLd = false, noindex = false, withHeader = true }) {
    const canonical = abs(pagePath);
    const ogImage = abs('/images/ogp.png');
    const head = [
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(description)}">`,
      noindex ? '<meta name="robots" content="noindex">' : '',
      canonical ? `<link rel="canonical" href="${esc(canonical)}">` : '',
      '<meta name="theme-color" content="#C5B3D3">',
      `<meta property="og:title" content="${esc(title)}">`,
      `<meta property="og:description" content="${esc(description)}">`,
      '<meta property="og:type" content="website">',
      `<meta property="og:site_name" content="${esc(biz.site.name)}">`,
      '<meta property="og:locale" content="ja_JP">',
      canonical ? `<meta property="og:url" content="${esc(canonical)}">` : '',
      ogImage ? `<meta property="og:image" content="${esc(ogImage)}">\n  <meta property="og:image:width" content="1200">\n  <meta property="og:image:height" content="630">` : '',
      `<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">`,
      '<link rel="icon" href="/favicon.ico" sizes="any">',
      '<link rel="icon" type="image/png" sizes="192x192" href="/images/icon-192.png">',
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
      '<link rel="preconnect" href="https://fonts.googleapis.com">',
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap">',
      '<link rel="stylesheet" href="/css/common.css">',
      '<link rel="stylesheet" href="/css/pages.css">',
      withJsonLd ? jsonLd() : '',
    ]
      .filter(Boolean)
      .join('\n  ');

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  ${head}
</head>
<body>
${withHeader ? header(pagePath) + '\n' : ''}<main>
${body}
</main>
${footer()}
${cta()}
</body>
</html>
`;
  }

  /* ---------- トップページ ---------- */

  {
    const p = biz.pages.index;
    const body = `
<section class="top_logo" aria-label="サロンのロゴ・店名">
  <img src="/images/logo.png" alt="healing salon Holly" width="200" height="200">
  <h1>${esc(biz.business_name)}</h1>
</section>

<section class="top-des" aria-label="サロンの説明">
  <p>【ご予約は下記リンクまたはDMから✉︎】</p>
  <p>${esc(biz.business_type)}</p>
  <p>${esc(hoursLine)}</p>
  <p>${esc(biz.location.address)}</p>
  <p>${esc(biz.location.entrance_note)}</p>
</section>

<section class="links" aria-label="予約・SNS・ページへのリンク">
  <ul>
    <li><a href="${L.reserve}"${extAttr(L.reserve)}>空き状況を確認する</a></li>
    <li><a href="${L.ekiten}"${extAttr(L.ekiten)}>エキテン</a></li>
    <li><a href="${L.instagram}"${extAttr(L.instagram)}>Instagram</a></li>
    <li><a href="${L.x}"${extAttr(L.x)}>X</a></li>
    <li><a href="${L.google_maps}"${extAttr(L.google_maps)}>Google Maps</a></li>
  </ul>
  <ul>
    ${nav.map((n) => `<li><a href="${n.path}">${esc(n.label)}</a></li>`).join('\n    ')}
  </ul>
</section>

<section class="box" id="concept" aria-label="サロンのコンセプト">
  <h2>コンセプト</h2>
  <div>
      ${paragraphs(biz.concept)}
  </div>
</section>

<section class="box" id="target" aria-label="歓迎するお客様">
  <h2>歓迎するお客様</h2>
  <div class="box-list">
      ${paragraphs(biz.target_customers)}
  </div>
</section>

<section class="box" id="forte" aria-label="サロンの強み">
  <h2>強み</h2>
  <div>
      ${paragraphs(biz.forte)}
  </div>
</section>

<section class="box" id="personal" aria-label="オーナー・セラピストの好きなこと">
  <h2>${esc(biz.personal_title)}</h2>
  <div>
      ${paragraphs(biz.personal)}
  </div>
</section>`;
    emit('/', layout({ path: '/', title: p.title, description: p.description, body, withJsonLd: true, withHeader: false }));
  }

  /* ---------- サービス ---------- */

  {
    const p = biz.pages.service;
    const rows = biz.services
      .map((s, i) => {
        const imgFile = path.join(SRC, 'assets/images/service', s.image);
        if (!fs.existsSync(imgFile)) fail(`サービス画像が見つかりません: images/service/${s.image}（${s.name}）`);
        const items = s.menu_items
          .map(
            (m) => `        <div class="menu-item">
          <div class="menu-item-1">
            <h4 class="menu-name">${esc(m.name)}</h4>
            <p class="menu-description">${esc(m.description)}</p>
          </div>
          <div class="menu-item-2">
            <span class="menu-duration">${m.duration_minutes}分</span>
            <span class="menu-price">${yen(m.price_yen)}</span>
          </div>
        </div>`,
          )
          .join('\n');
        const pos = s.image_position ? ` style="object-position:${esc(s.image_position)}"` : '';
        return `  <div class="service-row${i % 2 === 1 ? ' service-row--reverse' : ''}">
    <article>
      <div class="service-name"><h3>${esc(s.name)}</h3></div>
      <div class="menu-items">
${items}
      </div>
    </article>
    <figure class="service-photo">
      <img src="/images/service/${esc(s.image)}" alt="${esc(s.image_alt ?? '')}"${pos} loading="lazy" decoding="async">
    </figure>
  </div>`;
      })
      .join('\n');
    const body = `<section id="service">
  <h2>サービス</h2>
  <p class="price-note">${esc(biz.price_note)}</p>
${rows}
  <p class="disclaimer">${esc(biz.disclaimer)}</p>
</section>`;
    emit('/service/', layout({ path: '/service/', title: p.title, description: p.description, body }));
  }

  /* ---------- アクセス ---------- */

  {
    const p = biz.pages.access;
    const l = biz.location;
    const media = l.route_media ?? {};
    const mediaParts = [];
    for (const m of media.maps ?? []) {
      if (!fs.existsSync(path.join(SRC, 'assets/images/access', m.file))) fail(`地図画像が見つかりません: images/access/${m.file}`);
      mediaParts.push(`<figure class="route-media"><img src="/images/access/${esc(m.file)}" alt="${esc(m.alt ?? '')}" loading="lazy" decoding="async">${m.caption ? `<figcaption>${esc(m.caption)}</figcaption>` : ''}</figure>`);
    }
    if (media.video) {
      const v = media.video;
      if (!fs.existsSync(path.join(SRC, 'assets/movies', v.file))) fail(`道案内動画が見つかりません: movies/${v.file}`);
      const poster = v.poster ? ` poster="/images/access/${esc(v.poster)}"` : '';
      mediaParts.push(`<figure class="route-media"><video controls preload="metadata" playsinline${poster}><source src="/movies/${esc(v.file)}" type="video/mp4"></video>${v.caption ? `<figcaption>${esc(v.caption)}</figcaption>` : ''}</figure>`);
    }
    const body = `<section id="access">
  <h2>アクセス</h2>
  <div class="access_map">
    <iframe src="${esc(l.map_embed)}" title="${esc(biz.business_name)} の地図" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
    <div class="access_info">
      <h3>住所</h3>
      <address>〒${esc(l.postal_code)}<br>${esc(l.address)}</address>
      <p>${esc(l.walking_distance)}</p>
      <p>${esc(l.entrance_note)}</p>
      <h3>お電話</h3>
      <p><a href="tel:${tel}">${esc(biz.contact.phone_display)}</a></p>
      <h3>営業時間</h3>
      <p>${esc(h.days)} ${esc(h.time)}</p>
      <p>定休日：${esc(h.closed)}・${esc(h.irregular)}</p>
      <p><a class="text-link" href="/calendar/">営業カレンダーを見る</a></p>
    </div>
  </div>

  <div class="access_block">
    <h3>${esc(l.route_title)}</h3>
    <ol class="route-steps">
      ${l.route_steps.map((s) => `<li>${esc(s)}</li>`).join('\n      ')}
    </ol>
    ${mediaParts.join('\n    ')}
  </div>

  <div class="access_block">
    <h3>周辺の駅</h3>
    <ul class="station-list">
      ${l.stations.map((s) => `<li>${esc(s)}</li>`).join('\n      ')}
    </ul>
    <p class="catchment">${esc(l.catchment_text)}</p>
  </div>

  <div class="access_block access_notes">
    <h3>ご来店前に</h3>
    <ul>
      ${l.access_notes.map((s) => `<li>${esc(s)}</li>`).join('\n      ')}
    </ul>
  </div>
</section>`;
    emit('/access/', layout({ path: '/access/', title: p.title, description: p.description, body }));
  }

  /* ---------- 営業カレンダー（一覧 + 月ごと） ---------- */

  {
    const p = biz.pages.calendar;
    const published = Object.entries(cal.months)
      .filter(([, v]) => v.published)
      .map(([ym, v]) => ({ ym, ...v }))
      .sort((a, b) => a.ym.localeCompare(b.ym));
    const monthLabel = (ym) => {
      const [y, m] = ym.split('-').map(Number);
      return `${y}年${m}月`;
    };

    // 一覧
    const years = [...new Set(published.map((m) => m.ym.slice(0, 4)))];
    const list = published.length
      ? years
          .map(
            (y) => `  <h3>${y}年</h3>
  <ul>
    ${published
      .filter((m) => m.ym.startsWith(y))
      .map((m) => `<li><a href="/calendar/${m.ym}/">${Number(m.ym.slice(5))}月</a></li>`)
      .join('\n    ')}
  </ul>`,
          )
          .join('\n')
      : '  <p class="cal-lead">営業カレンダーは準備中です。</p>';
    emit(
      '/calendar/',
      layout({
        path: '/calendar/',
        title: p.title,
        description: p.description,
        body: `<section id="calendar">
  <h2>営業カレンダー</h2>
  <p class="cal-lead">${esc(hoursLine)}</p>
  <nav aria-label="月を選ぶ">
${list}
  </nav>
</section>`,
      }),
    );

    // 月ごと
    published.forEach((m, idx) => {
      const [y, mo] = m.ym.split('-').map(Number);
      const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const lead = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7; // 月曜始まり
      const closed = new Set();
      for (const d of m.closed ?? []) {
        if (!Number.isInteger(d) || d < 1 || d > days) fail(`calendar.json ${m.ym}: 休業日 ${d} は、この月に存在しない日です。`);
        else closed.add(d);
      }
      const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
      while (cells.length % 7) cells.push(null);
      const rows = [];
      for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
      const wd = ['月', '火', '水', '木', '金', '土', '日'];
      const thead = `<tr>${wd.map((w, i) => `<th scope="col"${i === 5 ? ' class="sat"' : i === 6 ? ' class="sun"' : ''}>${w}</th>`).join('')}</tr>`;
      const tbody = rows
        .map(
          (r) =>
            `<tr>${r
              .map((d) =>
                d === null
                  ? '<td class="blank"></td>'
                  : closed.has(d)
                    ? `<td class="kyu"><span class="d">${d}</span><span class="mark">休</span></td>`
                    : `<td><span class="d">${d}</span></td>`,
              )
              .join('')}</tr>`,
        )
        .join('\n        ');
      const prev = published[idx - 1];
      const next = published[idx + 1];
      const pager = `<nav class="cal-pager" aria-label="前後の月">
    ${prev ? `<a href="/calendar/${prev.ym}/">&larr; ${monthLabel(prev.ym)}</a>` : '<span></span>'}
    <a href="/calendar/">月の一覧</a>
    ${next ? `<a href="/calendar/${next.ym}/">${monthLabel(next.ym)} &rarr;</a>` : '<span></span>'}
  </nav>`;
      const pagePath = `/calendar/${m.ym}/`;
      emit(
        pagePath,
        layout({
          path: pagePath,
          title: `${monthLabel(m.ym)} 営業カレンダー | ${biz.business_name}`,
          description: `${biz.business_name} の${monthLabel(m.ym)}の営業カレンダーです。休業日をご確認ください。`,
          body: `<section id="calendars">
  <h2>営業カレンダー</h2>
  <h3>${monthLabel(m.ym)}</h3>
  <table class="cal-table">
    <thead>${thead}</thead>
    <tbody>
        ${tbody}
    </tbody>
  </table>
  <p class="cal-legend"><span class="legend-box"></span> 色のついた日は <span>休業日</span> です</p>
  <p class="cal-note">${esc(hoursLine)}<br>最新の空き状況は<a class="text-link" href="${L.reserve}"${extAttr(L.reserve)}>予約ページ</a>でもご確認いただけます。</p>
  ${pager}
</section>`,
        }),
      );
    });
  }

  /* ---------- よくある質問 ---------- */

  {
    const p = biz.pages.qanda;
    const items = biz.faq
      .map(
        (f, i) => `    <details class="qaa-item">
      <summary class="qaa-question"><span class="qaa-number">Q${i + 1}</span><span>${esc(f.question)}</span><span class="qaa-toggle" aria-hidden="true"></span></summary>
      <div class="qaa-answer"><p>${esc(f.answer)}</p>${f.link ? `\n        <p class="qaa-link"><a class="text-link" href="${esc(f.link.path)}"${extAttr(f.link.path)}>${esc(f.link.label)} →</a></p>` : ''}
      </div>
    </details>`,
      )
      .join('\n');
    emit(
      '/qanda/',
      layout({
        path: '/qanda/',
        title: p.title,
        description: p.description,
        body: `<section id="qanda">
  <h2>よくある質問</h2>
  <div class="qaa-area">
${items}
  </div>
  <div class="qanda-contact">
    <p>ほかにも気になることがございましたら、<br>お気軽にお問い合わせください。</p>
    <a class="text-link" href="${L.line}"${extAttr(L.line)}>ご予約・お問い合わせ →</a>
  </div>
</section>`,
      }),
    );
  }

  /* ---------- ギャラリー ---------- */

  {
    const p = biz.pages.gallery;
    const figs = biz.gallery
      .map((g) => {
        if (!fs.existsSync(path.join(SRC, 'assets/images/gallery', g.file))) fail(`ギャラリー画像が見つかりません: images/gallery/${g.file}`);
        return `    <figure class="gallery-item"><img src="/images/gallery/${esc(g.file)}" alt="${esc(g.alt)}" loading="lazy" decoding="async"></figure>`;
      })
      .join('\n');
    emit(
      '/gallery/',
      layout({
        path: '/gallery/',
        title: p.title,
        description: p.description,
        body: `<section id="gallery">
  <h2>店内ギャラリー</h2>
  ${biz.gallery.length ? `<div class="gallery-grid">\n${figs}\n  </div>` : '<p class="gallery-empty">写真を準備中です。</p>'}
</section>`,
      }),
    );
  }

  /* ---------- 404 ---------- */

  emit(
    '/404/',
    layout({
      path: '/404/',
      title: `ページが見つかりません | ${biz.business_name}`,
      description: 'お探しのページは見つかりませんでした。',
      noindex: true,
      body: `<section id="notfound">
  <h2>ページが見つかりません</h2>
  <p>お探しのページは、移動または削除された可能性があります。</p>
  <ul>
    <li><a class="text-link" href="/">トップページへ戻る</a></li>
    ${nav.map((n) => `<li><a class="text-link" href="${n.path}">${esc(n.label)}</a></li>`).join('\n    ')}
  </ul>
</section>`,
    }),
    { noindex: true, file: '404.html' },
  );
  // /404/index.html は不要（404.html のみ使う）
  fs.rmSync(path.join(DIST, '404'), { recursive: true, force: true });

  /* ---------- robots.txt / sitemap.xml / _headers ---------- */

  const robots = ['User-agent: *', 'Allow: /', ...(SITE_URL ? ['', `Sitemap: ${SITE_URL}/sitemap.xml`] : [])].join('\n') + '\n';
  fs.writeFileSync(path.join(DIST, 'robots.txt'), robots);

  if (SITE_URL) {
    const urls = pages
      .filter((x) => !x.noindex)
      .map((x) => `  <url><loc>${esc(SITE_URL + x.path)}</loc></url>`)
      .join('\n');
    fs.writeFileSync(
      path.join(DIST, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    );
  }

  fs.writeFileSync(
    path.join(DIST, '_headers'),
    `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/images/*
  Cache-Control: public, max-age=604800

/css/*
  Cache-Control: public, max-age=3600
`,
  );

  /* ---------- 検証（リンク切れ・重い画像） ---------- */

  const existsInDist = (u) => {
    const clean = decodeURI(u);
    const cands = clean.endsWith('/') ? [clean + 'index.html'] : [clean, clean + '/index.html'];
    return cands.some((c) => fs.existsSync(path.join(DIST, c)) && fs.statSync(path.join(DIST, c)).isFile());
  };
  for (const f of walk(DIST).filter((x) => x.endsWith('.html'))) {
    const html = fs.readFileSync(f, 'utf8');
    for (const m of html.matchAll(/(?:href|src|poster)="(\/[^"#?]*)(?:[#?][^"]*)?"/g)) {
      if (!existsInDist(m[1])) fail(`リンク切れ: ${path.relative(DIST, f)} → ${m[1]}`);
    }
  }
  for (const f of walk(path.join(DIST, 'images'))) {
    const kb = Math.round(fs.statSync(f).size / 1024);
    if (kb > 500) warn(`画像が重めです（${kb}KB）: ${path.relative(DIST, f)}`);
  }

  /* ---------- 結果表示 ---------- */

  if (!quiet) {
    const totalKb = Math.round(walk(DIST).reduce((s, f) => s + fs.statSync(f).size, 0) / 1024);
    console.log(`\n✔ ${pages.length} ページを dist/ に生成しました（合計 ${totalKb}KB）`);
    for (const x of pages) console.log(`   ${x.path}${x.noindex ? '  (noindex)' : ''}`);
    for (const w of warnings) console.log(`\n⚠ ${w}`);
    for (const e of errors) console.log(`\n✘ ${e}`);
    console.log('');
  }
  return { errors, warnings };
}

/* ------------------------------------------------------------------ dev server */

function serve() {
  const port = Number(process.env.PORT) || 8788;
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json',
    '.mp4': 'video/mp4',
  };
  build();
  http
    .createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (p.endsWith('/') || !path.extname(p)) build({ quiet: true }); // ページを開くたびに最新の内容で作り直す
      const cands = p.endsWith('/') ? [p + 'index.html'] : path.extname(p) ? [p] : [p + '/index.html', p + '.html'];
      const hit = cands
        .map((c) => path.normalize(path.join(DIST, c)))
        .find((f) => f.startsWith(DIST) && fs.existsSync(f) && fs.statSync(f).isFile());
      const file = hit ?? path.join(DIST, '404.html');
      res.writeHead(hit ? 200 : 404, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    })
    .listen(port, () => console.log(`プレビュー: http://localhost:${port}/   （停止: Ctrl+C）`));
}

if (SERVE) {
  serve();
} else {
  const { errors } = build();
  if (errors.length) process.exit(1);
}
