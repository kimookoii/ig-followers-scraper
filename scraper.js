import { chromium } from "playwright";

export async function getFollowers(username) {
  // launch browser
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();

  try {
    const url = `https://www.instagram.com/${encodeURIComponent(
      username
    )}/`;

    // navigate
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (!resp || resp.status() >= 400) {
      throw new Error("Instagram page not accessible: " + (resp ? resp.status() : "no response"));
    }

    // wait a bit for scripts to run and sharedData to be available
    await page.waitForTimeout(1200);

    // Try to read shared data from window._sharedData or from script tag
    // Newer IG pages embed JSON in a <script> tag of type "application/ld+json" or window.__additionalDataLoaded
    // We'll attempt several strategies.

    // Strategy 1: window._sharedData (older)
    const raw = await page.evaluate(() => {
      try {
        // modern IG sometimes has window.__initialData or window._sharedData
        return {
          sharedData: window._sharedData || window.__initialData || null,
          html: document.documentElement.innerHTML
        };
      } catch (e) {
        return { sharedData: null, html: document.documentElement.innerHTML };
      }
    });

    let followers = null;
    let fullName = null;
    let profilePic = null;
    let isPrivate = false;

    // Strategy A: try to parse JSON embedded in <script> tags (window._sharedData like)
    if (raw.sharedData && raw.sharedData.entry_data) {
      try {
        // older structure
        const user =
          raw.sharedData.entry_data.ProfilePage?.[0]?.graphql?.user ||
          raw.sharedData.entry_data.ProfilePage?.[0]?.user;
        if (user) {
          followers = user.edge_followed_by?.count ?? user.edge_follow?.count ?? null;
          fullName = user.full_name ?? user.fullName ?? null;
          profilePic = user.profile_pic_url_hd ?? user.profile_pic_url ?? null;
          isPrivate = !!user.is_private;
        }
      } catch (e) {
        // ignore
      }
    }

    // Strategy B: look for JSON with "window.__additionalDataLoaded" or script with JSON
    if (!followers) {
      // search for "edge_followed_by" in HTML
      const html = raw.html;
      const match = html.match(/({"config".*?})/s) || html.match(/(window\._sharedData = .*?);<\/script>/s) || html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/s);
      if (match) {
        try {
          const maybe = match[1] || match[0];
          const jsonText = maybe.replace(/window\._sharedData\s*=\s*/, "").replace(/;$/, "");
          const obj = JSON.parse(jsonText);
          // try to find user object
          const user =
            obj?.entry_data?.ProfilePage?.[0]?.graphql?.user ||
            obj?.graphql?.user ||
            obj?.props?.pageProps?.apolloState && Object.values(obj.props.pageProps.apolloState).find(v => v?.username === username);
          if (user) {
            followers = user.edge_followed_by?.count ?? null;
            fullName = user.full_name ?? null;
            profilePic = user.profile_pic_url_hd ?? user.profile_pic_url ?? null;
            isPrivate = !!user.is_private;
          }
        } catch (e) {
          // ignore parse errors
        }
      }
    }

    // Strategy C: DOM query fallback (reads visible follower count)
    if (!followers) {
      try {
        // IG shows li a elements with follower count — but selectors may vary; try common ones
        const text = await page.$eval("header", el => el.innerText).catch(() => null);
        if (text) {
          // attempt extracting numbers from header text
          const m = text.match(/([\d.,]+)\s+followers/i);
          if (m) {
            followers = m[1];
          }
        }
      } catch (e) {
        // ignore
      }
    }

    // Normalize followers to string
    if (typeof followers === "number") followers = followers.toString();
    if (followers && typeof followers === "string") {
      // trim and normalize weird spaces
      followers = followers.trim();
    }

    await page.close();
    await context.close();
    await browser.close();

    return {
      followers,
      fullName,
      profilePic,
      private: isPrivate
    };
  } catch (err) {
    // ensure browser closed
    try { await page?.close(); } catch {}
    try { await context?.close(); } catch {}
    try { await browser?.close(); } catch {}
    throw err;
  }
}
