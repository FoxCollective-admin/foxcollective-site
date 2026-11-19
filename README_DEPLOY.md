# Putting foxcollective.org live on GitHub Pages

Nothing in this folder is live yet. These are the exact steps for the day Antony says yes.
This file is not published with the site (`_config.yml` leaves it out).

Source for the DNS values below: GitHub Docs, "Managing a custom domain for your GitHub Pages site"
https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
(read 2026-11-18). If GitHub ever changes the four addresses, that page is the one to trust.

## What is in this folder

| File | What it is |
| --- | --- |
| `index.html` | Storefront home |
| `careers.html` | Hiring page. The paid ad opens this one |
| `404.html` | Shown for any wrong link |
| `site.css`, `site.js`, `products.js`, `fonts/`, `img/`, `favicon.svg` | Look, the preview switch, the product rows, fonts, link preview pictures, tab icon |
| `robots.txt`, `sitemap.xml` | For search engines |
| `CNAME` | One line, `foxcollective.org`. Tells GitHub Pages which domain this site answers to |
| `_config.yml` | Keeps this README off the public site |
| `products.json` | NOT here yet. The shoe rows stay hidden until it exists (see the end) |

## Before going live

1. Open `site.js` and change `var FOX_PREVIEW = true;` to `var FOX_PREVIEW = false;`. That one change removes the "Preview for Antony" bar and every empty photo and video slot on all pages.
2. Add the hero photo and the host video if they are ready (each slot has a comment in the HTML showing the line to paste). They are optional: with the switch off, the pages close up cleanly without them.
3. Run the checks: `python /home/claude/foxsite-tools/tests/check_site.py` and `python -m unittest discover -s /home/claude/foxsite-tools/tests`.

## Part 1: GitHub (about 5 minutes)

1. Make a new **public** repository under the FoxCollective-admin account, for example `foxcollective-site`. GitHub Pages is free only on public repositories on the free plan. Everything in this folder is meant to be public anyway; never put books, photos of paperwork or keys in it.
2. Put the contents of this folder at the top level of the repository's `main` branch (so `index.html` is at the top, not inside a subfolder) and push.
3. In the repository: **Settings > Pages**. Under "Build and deployment", set **Source** to **Deploy from a branch**, pick branch `main` and folder `/ (root)`, and press **Save**.
4. Wait a minute or two, then open `https://foxcollective-admin.github.io/foxcollective-site/careers.html` to see that it published. (The 404 page looks unstyled at this temporary address. It is right once the real domain is on.)
5. Recommended by GitHub, to stop anyone else claiming the domain: on github.com go to your profile picture > **Settings > Pages > Add a domain**, type `foxcollective.org`, and keep the page open. It shows one TXT record to add in Namecheap (step 3 of Part 2). Do this before adding the domain to the repository.
6. Back in the repository: **Settings > Pages > Custom domain**, type `foxcollective.org`, press **Save**. The `CNAME` file in this folder already says the same thing, so GitHub makes no extra change.

## Part 2: Namecheap DNS (about 5 minutes, Antony signs in)

Sign in at namecheap.com > **Domain List** > `foxcollective.org` > **Manage** > **Advanced DNS** tab.

1. **Take a screenshot of every record on the page first.** That is the undo button.
2. In "Host Records", **remove only the records that point the website somewhere else** today:
   - any **A Record** with Host `@` (if the domain points at the old Shopify store this is `23.227.38.65`)
   - any **AAAA Record** with Host `@`
   - any **CNAME Record** with Host `www` (`shops.myshopify.com` for Shopify, or `parkingpage.namecheap.com`)
   - any **URL Redirect Record** with Host `@` or `www`
3. **Add these records** (TTL: Automatic):

   | Type | Host | Value |
   | --- | --- | --- |
   | A Record | `@` | `185.199.108.153` |
   | A Record | `@` | `185.199.109.153` |
   | A Record | `@` | `185.199.110.153` |
   | A Record | `@` | `185.199.111.153` |
   | CNAME Record | `www` | `foxcollective-admin.github.io` |
   | TXT Record | the host GitHub shows in Part 1 step 5 (starts with `_github-pages-challenge-`) | the code GitHub shows |

   The `www` value is the account address only, with no repository name after it. Optional, for IPv6 visitors, four AAAA Records with Host `@`: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`.
4. **Leave everything else alone.** These keep the Google Workspace email (admin@foxcollective.org and the other addresses) working, and the website does not need them changed:
   - every **MX Record** (Google's are `smtp.google.com` or the `aspmx.l.google.com` set). On Namecheap they sit in the **Mail Settings** section lower on the same tab. Do not change that dropdown.
   - every **TXT Record** already there: the SPF one (`v=spf1 include:_spf.google.com ...`), `google-site-verification=...`, the DKIM one (Host `google._domainkey`) and the DMARC one (Host `_dmarc`)
   - any other CNAME that is not `www` (for example ones Google or Klaviyo asked for)
   - the nameservers. Do not switch to "Custom DNS".
5. Do not add a wildcard record (Host `*`). GitHub warns against it.
6. Press the green check on each row to save it.

## Part 3: Finish (same day)

1. DNS changes can take up to 24 hours. It is usually much faster.
2. In the repository's **Settings > Pages**, wait for the green "DNS check successful", then tick **Enforce HTTPS**. The box can take up to 24 hours to become clickable while GitHub issues the certificate.
3. Check from a phone on cellular data: `https://foxcollective.org/`, `https://foxcollective.org/careers.html`, `https://www.foxcollective.org/` (should jump to the address without www) and `https://foxcollective.org/anything-wrong` (should show the "Wrong turn" page).
4. Send a test email to and from admin@foxcollective.org to confirm mail still works.
5. If the old Shopify store still lists foxcollective.org under its **Settings > Domains**, remove it there so Shopify stops warning about it. lvrwholesale.com is not touched by any step in this file.
6. Paste `https://foxcollective.org/careers.html` into a text message or the Facebook Sharing Debugger to see the link preview picture before the ad uses it.

## Undo

Put back the A and CNAME records from the screenshot in Part 2 step 1, and clear **Custom domain** in the repository's Pages settings. Email is never affected by either direction.

## Later: turning on the shoe rows

The home page reads `products.json` from this folder. While the file is missing or empty, the search box, the Men / Women / Kids menu, New Arrivals, Shop by Category, Shop by Brand and Trending stay hidden and the page shows the Whatnot button in their place.

1. Export the products from Shopify (Products > Export, CSV for Excel is fine), or save the Admin products JSON.
2. Run: `python /home/claude/foxsite-tools/shopify_to_products.py EXPORT_FILE --out products.json`
   It prints what it left out (drafts, sold out, no picture) and why.
3. Look at the page locally, then push. To choose what shows under New Arrivals and Trending, tag products `new` and `trending` in Shopify. Tags `running` and `lifestyle` feed those two quick filters.
