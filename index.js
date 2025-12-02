import express from "express";
import { chromium } from "playwright";

const app = express();
const port = 3000;

app.get("/api/followers", async (req, res) => {
  const username = req.query.username;
  if (!username) return res.status(400).json({ error: "username required" });

  try {
    const browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"]
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    // buka 1x untuk dapat cookie session anon
    await page.goto("https://www.instagram.com/", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    const apiUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;

    const response = await page.evaluate(async (apiUrl) => {
      const r = await fetch(apiUrl, {
        headers: {
          "X-IG-App-ID": "936619743392459",
        }
      }).catch(() => null);

      if (!r) return null;

      return r.json().catch(() => null);
    }, apiUrl);

    await browser.close();

    if (!response || !response.data || !response.data.user) {
      return res.json({ error: "Failed to extract IG data" });
    }

    const user = response.data.user;

    return res.json({
      username: user.username,
      fullName: user.full_name,
      biography: user.biography,
      externalUrl: user.external_url,
      followers: user.edge_followed_by.count,
      following: user.edge_follow.count,
      posts: user.edge_owner_to_timeline_media.count,
      profilePic: user.profile_pic_url_hd,
      private: user.is_private,
      verified: user.is_verified,
      businessAccount: user.is_business_account,
      professionalAccount: user.is_professional_account,
      category: user.category_name,
      joinedRecently: user.is_joined_recently,
      highlightCount: user.highlight_reel_count,
      hasChannel: user.has_channel,
      hasAREffects: user.has_ar_effects
    });


  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.listen(port, () =>
  console.log(`Server berjalan di http://localhost:${port}`)
);
