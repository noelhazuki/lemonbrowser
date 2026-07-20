export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // OGP画像取得API（/api/ogp?url=対象ページのURL）
    if (url.pathname === "/api/ogp") {
      const target = url.searchParams.get("url");
      if (!target) {
        return json({ error: "url is required" }, 400);
      }

      try {
        const res = await fetch(target, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; LemonBrowserBot/1.0; +https://lemon-browser.example)"
          },
          // Cloudflareのキャッシュを使って、同じURLへの再取得を軽くする
          cf: { cacheTtl: 3600, cacheEverything: true }
        });

        if (!res.ok) {
          return json({ image: null });
        }

        // ページ全体は読まず、先頭だけ読んでog:imageを探す（軽量化）
        const html = await readHead(res, 100000);

        const image = extractOgImage(html, target);
        return json({ image });
      } catch (e) {
        // 失敗してもエラーで落とさず image:null を返す（フロント側はfaviconにフォールバックする）
        return json({ image: null });
      }
    }

    // それ以外は通常どおり静的ファイルを返す
    return env.ASSETS.fetch(request);
  }
};

async function readHead(res, maxBytes) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    text += decoder.decode(value, { stream: true });
    if (/<\/head>/i.test(text)) break;
  }
  try { reader.cancel(); } catch (e) {}
  return text;
}

function extractOgImage(html, baseUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      try {
        return new URL(m[1], baseUrl).href;
      } catch (e) {
        return m[1];
      }
    }
  }
  return null;
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
