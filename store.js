/* The Fox Collective storefront. Reads products.json and draws the home page rails,
 * the shop grid with filters, and the product page. No cart and no checkout: every
 * product sends the buyer to our Whatnot page.
 *
 * products.json shape (written by foxsite-tools/build_products.py):
 *   { "generated": "2026-11-19", "sample": false, "products": [
 *       { "sku": "IF1234", "name": "...", "brand": "adidas", "gender": "men|women|kids|unisex",
 *         "tier": 1, "price": 49, "sale": false, "image": "https://...",
 *         "sizes": [ { "l": "M 9 / W 10", "m": 9, "w": 10, "k": "", "q": 2 } ] } ] }
 */
(function () {
  "use strict";
  var WHATNOT = "https://www.whatnot.com/user/thefoxcollective";
  var PAGE_SIZE = 24;
  var GENDER_WORD = { men: "Men's", women: "Women's", kids: "Kids'", unisex: "Unisex" };
  var page = document.body.getAttribute("data-page");
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag), k;
    for (k in attrs || {}) {
      if (attrs[k] === null || attrs[k] === undefined || attrs[k] === false) continue;
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else n.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function money(n) { return "$" + (Math.round(n * 100) % 100 === 0 ? String(Math.round(n)) : n.toFixed(2)); }
  function pairs(p) { return p.sizes.reduce(function (t, s) { return t + (s.q || 0); }, 0); }
  function matchesGender(p, g) {
    if (g === "kids") return p.gender === "kids";
    if (g === "men") return p.gender === "men" || p.gender === "unisex";
    if (g === "women") return p.gender === "women" || p.gender === "unisex";
    return true;
  }
  function productUrl(p) { return "product.html?sku=" + encodeURIComponent(p.sku); }

  /* A picture, or a clean placeholder when the link is missing or broken. */
  function picture(p, eager) {
    var box = el("span", { class: "im" });
    function blank() {
      box.textContent = "";
      box.appendChild(el("span", { class: "noimg" }, [el("b", { text: "THE FOX COLLECTIVE" }), el("span", { text: "Photo coming soon" })]));
    }
    if (!p.image) { blank(); return box; }
    var img = el("img", { src: p.image, alt: "", loading: eager ? "eager" : "lazy", decoding: "async", referrerpolicy: "no-referrer" });
    img.addEventListener("error", blank);
    box.appendChild(img);
    return box;
  }
  function card(p) {
    var a = el("a", { class: "pc", href: productUrl(p) }, [
      p.sale ? el("span", { class: "badge", text: "Sale" }) : null,
      picture(p),
      el("div", { class: "bd", text: p.brand }),
      el("div", { class: "nm", text: p.name }),
      el("div", { class: "gd", text: GENDER_WORD[p.gender] || "" }),
      el("div", { class: "pr" + (p.sale ? " sale" : ""), text: money(p.price) })
    ]);
    return el("li", {}, [a]);
  }

  function load() {
    return fetch("products.json", { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("products.json " + r.status);
      return r.json();
    }).then(function (d) {
      var list = (d.products || []).filter(function (p) { return p && p.sku && p.name && p.price > 0 && p.sizes && pairs(p) > 0; });
      if (d.sample) {
        var note = el("div", { class: "sample-note", role: "note", text: "Preview with placeholder products. These are not real shoes or real stock." });
        document.body.insertBefore(note, document.body.firstChild);
      }
      return { list: list, meta: d };
    });
  }

  /* Search box in the header: always goes to the shop page. */
  var sf = $("s-search");
  if (sf) sf.addEventListener("submit", function (e) {
    if (page === "shop") { e.preventDefault(); if (window.FOX_SHOP) window.FOX_SHOP.search($("s-q").value); }
  });

  /* ---------------- home ---------------- */
  function home(data) {
    var list = data.list;
    if (!list.length) return;
    document.querySelectorAll("[data-needs-products]").forEach(function (n) { n.hidden = false; });
    var withPic = list.filter(function (p) { return p.image; });
    var pics = $("hero-pics");
    var heroIn = pics.parentNode;
    var top = withPic.slice().sort(function (a, b) { return b.tier - a.tier || pairs(b) - pairs(a); });
    var seen = {}, heroSet = [];
    top.forEach(function (p) { if (heroSet.length < 3 && !seen[p.brand]) { seen[p.brand] = 1; heroSet.push(p); } });
    if (heroSet.length === 3) {
      heroSet.forEach(function (p) {
        var a = el("a", { href: productUrl(p), "aria-label": p.name });
        var img = el("img", { src: p.image, alt: "", referrerpolicy: "no-referrer" });
        img.addEventListener("error", function () { pics.hidden = true; heroIn.classList.add("nopics"); });
        a.appendChild(img); pics.appendChild(a);
      });
    } else { pics.hidden = true; heroIn.classList.add("nopics"); }

    function fill(id, items, limit) {
      var ul = $(id); if (!ul) return;
      var blk = ul.closest(".blk");
      if (!items.length) { blk.hidden = true; return; }
      items.slice(0, limit).forEach(function (p) { ul.appendChild(card(p)); });
    }
    var byRuns = list.slice().sort(function (a, b) { return b.sizes.length - a.sizes.length || pairs(b) - pairs(a); });
    fill("rail-runs", byRuns, 10);
    var cnt = {}; list.forEach(function (p) { if (!p.sale) cnt[p.price] = (cnt[p.price] || 0) + 1; });
    var floor = Object.keys(cnt).map(Number).filter(function (v) { return cnt[v] >= 20; }).reduce(function (m, v) { return Math.min(m, v); }, Infinity);
    var cheap = list.filter(function (p) { return !p.sale && p.price === floor; });
    var t = $("rail-low-title");
    if (t && isFinite(floor)) { t.textContent = "Shoes at " + money(floor); $("rail-low-link").href = "shop.html?max=" + floor; }
    fill("rail-low", cheap.sort(function (a, b) { return pairs(b) - pairs(a); }), 5);
    fill("rail-sale", list.filter(function (p) { return p.sale; }), 5);

    /* category tiles get a real product photo each */
    document.querySelectorAll("[data-tile]").forEach(function (a) {
      var g = a.getAttribute("data-tile");
      var pick = withPic.filter(function (p) { return g === "sale" ? p.sale : p.gender === g || (g !== "kids" && p.gender === "unisex" && !withPic.some(function (x) { return x.gender === g; })); })[0];
      if (g === "sale" && !pick) { a.parentNode.hidden = true; return; }
      if (pick) {
        var img = el("img", { src: pick.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
        img.addEventListener("error", function () { img.remove(); });
        a.querySelector(".im").appendChild(img);
      }
    });
    var counts = {};
    list.forEach(function (p) { counts[p.brand] = (counts[p.brand] || 0) + 1; });
    var bl = $("brand-list");
    Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); }).slice(0, 12).forEach(function (b) {
      bl.appendChild(el("li", {}, [el("a", { href: "shop.html?brand=" + encodeURIComponent(b) }, [el("span", {}, [b, el("small", { text: counts[b] + (counts[b] === 1 ? " style" : " styles") })])])]));
    });
  }

  /* ---------------- shop ---------------- */
  function shop(data) {
    var list = data.list;
    var qs = new URLSearchParams(location.search);
    var st = {
      g: (qs.get("g") || "").split(",").filter(Boolean),
      brand: (qs.get("brand") || "").split("|").filter(Boolean),
      size: (qs.get("size") || "").split(",").filter(Boolean),   /* "m:9", "w:8.5", "k:5K" */
      price: (qs.get("price") || "").split(",").filter(Boolean).map(Number),
      max: Number(qs.get("max")) || 0,
      sale: qs.get("sale") === "1",
      q: qs.get("q") || "",
      sort: qs.get("sort") || "featured",
      shown: PAGE_SIZE
    };
    $("s-q").value = st.q;
    $("sort").value = st.sort;

    function sizeKeys(p) {
      var out = [];
      p.sizes.forEach(function (s) {
        if (!s.q) return;
        if (s.k) out.push("k:" + s.k);
        if (s.m) out.push("m:" + s.m);
        if (s.w) out.push("w:" + s.w);
      });
      return out;
    }
    function pass(p, skip) {
      if (skip !== "g" && st.g.length && !st.g.some(function (g) { return matchesGender(p, g); })) return false;
      if (skip !== "brand" && st.brand.length && st.brand.indexOf(p.brand) < 0) return false;
      if (skip !== "price" && st.price.length && st.price.indexOf(p.price) < 0) return false;
      if (st.max && p.price > st.max) return false;
      if (st.sale && !p.sale) return false;
      if (skip !== "size" && st.size.length) {
        var keys = sizeKeys(p);
        if (!st.size.some(function (k) { return keys.indexOf(k) >= 0; })) return false;
      }
      if (st.q) {
        var hay = (p.name + " " + p.brand + " " + p.sku + " " + (GENDER_WORD[p.gender] || "")).toLowerCase();
        if (!st.q.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; })) return false;
      }
      return true;
    }
    function sorted(items) {
      var a = items.slice();
      if (st.sort === "low") a.sort(function (x, y) { return x.price - y.price; });
      else if (st.sort === "high") a.sort(function (x, y) { return y.price - x.price; });
      else if (st.sort === "name") a.sort(function (x, y) { return x.name.localeCompare(y.name); });
      else if (st.sort === "sizes") a.sort(function (x, y) { return y.sizes.length - x.sizes.length; });
      return a;
    }
    function toggle(arr, v) { var i = arr.indexOf(v); if (i < 0) arr.push(v); else arr.splice(i, 1); }
    function sizeLabel(k) { var t = k.split(":"); return t[0] === "m" ? "Men's " + t[1] : t[0] === "w" ? "Women's " + t[1] : "Kids' " + t[1]; }

    function check(group, value, label, count, on) {
      var input = el("input", { type: "checkbox", checked: on });
      input.addEventListener("change", function () { toggle(st[group], value); st.shown = PAGE_SIZE; draw(); });
      return el("label", { class: "ck" }, [input, el("span", { text: label }), el("small", { text: String(count) })]);
    }
    function drawFilters() {
      var box, n;
      box = $("f-gender"); box.textContent = "";
      [["men", "Men"], ["women", "Women"], ["kids", "Kids"]].forEach(function (g) {
        n = list.filter(function (p) { return pass(p, "g") && matchesGender(p, g[0]); }).length;
        box.appendChild(check("g", g[0], g[1], n, st.g.indexOf(g[0]) >= 0));
      });
      box = $("f-brand"); box.textContent = "";
      var bc = {};
      list.forEach(function (p) { if (pass(p, "brand")) bc[p.brand] = (bc[p.brand] || 0) + 1; });
      st.brand.forEach(function (b) { if (!bc[b]) bc[b] = 0; });
      Object.keys(bc).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (b) {
        box.appendChild(check("brand", b, b, bc[b], st.brand.indexOf(b) >= 0));
      });
      box = $("f-price"); box.textContent = "";
      var pc = {};
      list.forEach(function (p) { if (pass(p, "price")) pc[p.price] = (pc[p.price] || 0) + 1; });
      Object.keys(pc).map(Number).sort(function (a, b) { return a - b; }).forEach(function (v) {
        box.appendChild(check("price", v, money(v), pc[v], st.price.indexOf(v) >= 0));
      });
      var sale = $("f-sale"); sale.checked = st.sale;
      box = $("f-size"); box.textContent = "";
      var have = { m: {}, w: {}, k: {} };
      list.forEach(function (p) { if (pass(p, "size")) sizeKeys(p).forEach(function (k) { have[k[0]][k.slice(2)] = 1; }); });
      [["m", "Men's"], ["w", "Women's"], ["k", "Kids'"]].forEach(function (grp) {
        var vals = Object.keys(have[grp[0]]);
        if (!vals.length) return;
        vals.sort(function (a, b) {
          var ya = /Y$/.test(a) ? 1 : 0, yb = /Y$/.test(b) ? 1 : 0;
          return ya - yb || parseFloat(a) - parseFloat(b);
        });
        box.appendChild(el("div", { class: "sub", text: grp[1] }));
        var wrap = el("div", { class: "szs" });
        vals.forEach(function (v) {
          var key = grp[0] + ":" + v;
          var b = el("button", { type: "button", "aria-pressed": st.size.indexOf(key) >= 0 ? "true" : "false", "aria-label": grp[1] + " size " + v, text: v });
          b.addEventListener("click", function () { toggle(st.size, key); st.shown = PAGE_SIZE; draw(); });
          wrap.appendChild(b);
        });
        box.appendChild(wrap);
      });
    }
    function drawChips() {
      var box = $("chips"); box.textContent = "";
      function chip(label, undo) {
        var b = el("button", { type: "button", "aria-label": "Remove filter " + label, text: label });
        b.addEventListener("click", function () { undo(); st.shown = PAGE_SIZE; draw(); });
        box.appendChild(b);
      }
      st.g.slice().forEach(function (g) { chip(GENDER_WORD[g].replace(/'s?$/, ""), function () { toggle(st.g, g); }); });
      st.brand.slice().forEach(function (b) { chip(b, function () { toggle(st.brand, b); }); });
      st.size.slice().forEach(function (k) { chip(sizeLabel(k), function () { toggle(st.size, k); }); });
      st.price.slice().forEach(function (v) { chip(money(v), function () { toggle(st.price, v); }); });
      if (st.max) chip("Up to " + money(st.max), function () { st.max = 0; });
      if (st.sale) chip("Sale", function () { st.sale = false; });
      if (st.q) chip("“" + st.q + "”", function () { st.q = ""; $("s-q").value = ""; });
      if (box.childNodes.length) {
        var c = el("button", { type: "button", class: "clear", text: "Clear all" });
        c.addEventListener("click", reset);
        box.appendChild(c);
      }
      box.hidden = !box.childNodes.length;
    }
    function reset() {
      st.g = []; st.brand = []; st.size = []; st.price = []; st.max = 0; st.sale = false; st.q = ""; $("s-q").value = ""; st.shown = PAGE_SIZE; draw();
    }
    function title() {
      var t = "All Shoes";
      if (st.sale) t = "Sale";
      else if (st.q) t = "Results for “" + st.q + "”";
      else if (st.brand.length === 1 && st.g.length <= 1) t = st.brand[0] + (st.g.length ? " " + GENDER_WORD[st.g[0]] : "") + " Shoes";
      else if (st.g.length === 1) t = GENDER_WORD[st.g[0]] + " Shoes";
      return t;
    }
    function syncUrl() {
      var p = new URLSearchParams();
      if (st.g.length) p.set("g", st.g.join(","));
      if (st.brand.length) p.set("brand", st.brand.join("|"));
      if (st.size.length) p.set("size", st.size.join(","));
      if (st.price.length) p.set("price", st.price.join(","));
      if (st.max) p.set("max", st.max);
      if (st.sale) p.set("sale", "1");
      if (st.q) p.set("q", st.q);
      if (st.sort !== "featured") p.set("sort", st.sort);
      var s = p.toString();
      history.replaceState(null, "", "shop.html" + (s ? "?" + s : ""));
    }
    function draw() {
      var items = sorted(list.filter(function (p) { return pass(p); }));
      var grid = $("grid"); grid.textContent = "";
      var frag = document.createDocumentFragment();
      items.slice(0, st.shown).forEach(function (p) { frag.appendChild(card(p)); });
      grid.appendChild(frag);
      var t = title();
      $("shop-title").textContent = t;
      $("crumb-here").textContent = t;
      document.title = t + " | The Fox Collective";
      $("shop-count").textContent = items.length + (items.length === 1 ? " style" : " styles");
      $("none").hidden = items.length > 0;
      var more = $("more");
      more.hidden = items.length <= st.shown;
      $("more-text").textContent = "Showing " + Math.min(st.shown, items.length) + " of " + items.length;
      $("fapply-btn").textContent = "Show " + items.length + (items.length === 1 ? " style" : " styles");
      var nf = st.g.length + st.brand.length + st.size.length + st.price.length + (st.sale ? 1 : 0) + (st.max ? 1 : 0);
      $("fbtn").textContent = "Filters" + (nf ? " (" + nf + ")" : "");
      drawFilters(); drawChips(); syncUrl();
      document.querySelectorAll(".s-nav a").forEach(function (a) {
        var k = a.getAttribute("data-nav");
        var on = (k === "sale" && st.sale) || (!st.sale && st.g.length === 1 && st.g[0] === k);
        if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      });
    }
    $("sort").addEventListener("change", function () { st.sort = this.value; draw(); });
    $("f-sale").addEventListener("change", function () { st.sale = this.checked; st.shown = PAGE_SIZE; draw(); });
    $("more-btn").addEventListener("click", function () { st.shown += PAGE_SIZE; draw(); });
    $("none-reset").addEventListener("click", reset);
    var panel = $("filters");
    function openPanel(on) { panel.classList.toggle("open", on); document.body.style.overflow = on ? "hidden" : ""; }
    $("fbtn").addEventListener("click", function () { openPanel(true); });
    $("fclose").addEventListener("click", function () { openPanel(false); });
    $("fapply-btn").addEventListener("click", function () { openPanel(false); window.scrollTo(0, 0); });
    window.FOX_SHOP = { search: function (q) { st.q = q.trim(); st.shown = PAGE_SIZE; draw(); } };
    draw();
  }

  /* ---------------- product ---------------- */
  function product(data) {
    var sku = new URLSearchParams(location.search).get("sku") || "";
    var p = data.list.filter(function (x) { return x.sku === sku; })[0];
    var box = $("pd");
    if (!p) {
      $("pd-missing").hidden = false;
      box.hidden = true;
      return;
    }
    document.title = p.name + " | The Fox Collective";
    $("crumb-brand").textContent = p.brand;
    $("crumb-brand").href = "shop.html?brand=" + encodeURIComponent(p.brand);
    $("crumb-here").textContent = p.name;
    var im = picture(p, true);
    im.className = "im";
    if (p.sale) im.appendChild(el("span", { class: "badge", text: "Sale" }));
    var imgEl = im.querySelector("img");
    if (imgEl) imgEl.alt = p.name;
    var inStock = p.sizes.filter(function (s) { return s.q > 0; });
    var sizes = el("ul", { class: "sizes", "aria-label": "Sizes in stock" }, inStock.map(function (s) {
      return el("li", {}, [s.l, s.q <= 2 ? el("small", { text: s.q === 1 ? "1 left" : "2 left" }) : null]);
    }));
    var price = el("p", { class: "pr" + (p.sale ? " sale" : "") }, [money(p.price), p.sale ? el("span", { class: "tag", text: "Sale" }) : null]);
    var info = el("div", {}, [
      el("div", { class: "bd", text: p.brand }),
      el("h1", { text: p.name }),
      el("div", { class: "gd", text: (GENDER_WORD[p.gender] || "") + " shoes" }),
      price,
      el("h2", {}, ["Sizes in stock", el("small", { text: inStock.length + (inStock.length === 1 ? " size" : " sizes") })]),
      sizes,
      el("div", { class: "buy" }, [el("a", { class: "bt block", href: WHATNOT, rel: "noopener", text: "Shop on Whatnot" })]),
      el("p", { class: "note", text: "We sell on Whatnot as @TheFoxCollective. Sizes move fast, so what you see here can sell out. Every pair is new in the box and ships from Chicago." }),
      el("dl", {}, [
        el("div", {}, [el("dt", { text: "Style code" }), el("dd", { text: p.sku })]),
        el("div", {}, [el("dt", { text: "Brand" }), el("dd", { text: p.brand })]),
        el("div", {}, [el("dt", { text: "Condition" }), el("dd", { text: "New in box" })])
      ])
    ]);
    box.appendChild(im); box.appendChild(info);
    var also = data.list.filter(function (x) { return x.sku !== p.sku && (x.brand === p.brand || x.gender === p.gender); })
      .sort(function (a, b) { return (b.brand === p.brand) - (a.brand === p.brand) || Math.abs(a.price - p.price) - Math.abs(b.price - p.price); }).slice(0, 5);
    if (also.length) { $("also").hidden = false; also.forEach(function (x) { $("rail-also").appendChild(card(x)); }); }
  }

  if (page === "home" || page === "shop" || page === "product") {
    load().then(function (d) {
      if (page === "home") home(d); else if (page === "shop") shop(d); else product(d);
      document.documentElement.setAttribute("data-store", "ready");
    }).catch(function () {
      /* No products file: the pages still stand on their own with the Whatnot link. */
      document.querySelectorAll("[data-no-products]").forEach(function (n) { n.hidden = false; });
      document.documentElement.setAttribute("data-store", "empty");
    });
  }
})();
