/* The Fox Collective storefront: fills the home page from products.json.
 *
 * products.json is a plain list of shoes:
 *   [{ "name": "", "brand": "", "gender": "men|women|kids|unisex", "price": 49,
 *      "retail_price": 110, "image": "https://...", "url": "https://...", "tags": ["new","running"] }]
 *
 * Rules:
 *  - No file, an empty list or a broken file: every product part of the page stays hidden.
 *  - New Arrivals: shoes tagged "new" (if none are tagged, the first shoes in the file).
 *  - Trending Now: shoes tagged "trending" (if none are tagged, the next shoes in the file).
 *  - "% off retail" shows only when retail_price is there and higher than price.
 *  - A card opens the shoe's own url, or our Whatnot page when it has none.
 *  - No server, no build step, no outside library. Text is always set as text, never as HTML.
 */
(function () {
  "use strict";

  var WHATNOT = "https://www.whatnot.com/user/thefoxcollective";
  var RAIL_MAX = 10;
  var TOP_BRANDS = 3;

  var PILLS = {
    "new": "New Arrivals",
    under50: "Under $50",
    running: "Running",
    lifestyle: "Lifestyle",
    kids: "Kids' Sizes",
    sale: "Sale"
  };
  var TAB_TITLES = { all: "All Shoes", men: "Men's Shoes", women: "Women's Shoes", kids: "Kids' Shoes" };
  var GENDER_LABELS = { men: "Men's", women: "Women's", kids: "Kids'", unisex: "Unisex" };
  var GENDER_WORDS = {
    men: ["men", "mens", "men's", "male", "m"],
    women: ["women", "womens", "women's", "female", "w", "ladies"],
    kids: ["kids", "kid", "kids'", "kid's", "youth", "boys", "girls", "boy", "girl", "toddler", "infant", "child", "children", "grade school", "preschool", "y"],
    unisex: ["unisex", "adult", "all"]
  };

  var products = [];
  var anyNewTag = false;
  var state = { tab: "all", pill: null, brand: null, q: "", browse: false };

  function byId(id) { return document.getElementById(id); }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---------- reading the file ---------- */

  function toNumber(v) {
    if (typeof v === "number") return isFinite(v) ? v : NaN;
    if (typeof v !== "string") return NaN;
    var n = parseFloat(v.replace(/[$,\s]/g, ""));
    return isFinite(n) ? n : NaN;
  }

  function cleanUrl(v) {
    if (typeof v !== "string" || !v.trim()) return "";
    try {
      var u = new URL(v.trim(), document.baseURI);
      if (u.protocol === "https:" || u.protocol === "http:" || u.protocol === window.location.protocol) return u.href;
    } catch (e) { /* not a link */ }
    return "";
  }

  function cleanGender(v) {
    var g = String(v == null ? "" : v).trim().toLowerCase();
    for (var key in GENDER_WORDS) {
      if (GENDER_WORDS[key].indexOf(g) !== -1) return key;
    }
    return "";
  }

  function cleanTags(v) {
    var list = Array.isArray(v) ? v : (typeof v === "string" ? v.split(",") : []);
    var out = [];
    list.forEach(function (t) {
      t = String(t).trim().toLowerCase();
      if (t && out.indexOf(t) === -1) out.push(t);
    });
    return out;
  }

  function clean(raw) {
    if (!raw || typeof raw !== "object") return null;
    var name = String(raw.name == null ? "" : raw.name).trim();
    var price = toNumber(raw.price);
    if (!name || !(price > 0)) return null;
    var retail = toNumber(raw.retail_price);
    var p = {
      name: name,
      brand: String(raw.brand == null ? "" : raw.brand).trim(),
      gender: cleanGender(raw.gender),
      price: price,
      retail: retail > price ? retail : 0,
      image: cleanUrl(raw.image),
      url: cleanUrl(raw.url),
      tags: cleanTags(raw.tags)
    };
    p.search = (p.name + " " + p.brand + " " + p.tags.join(" ")).toLowerCase();
    return p;
  }

  /* ---------- matching ---------- */

  function hasTag(p, t) { return p.tags.indexOf(t) !== -1; }
  function onSale(p) { return p.retail > 0 || hasTag(p, "sale"); }

  function inTab(p, tab) {
    if (tab === "all") return true;
    if (p.gender === "unisex") return tab === "men" || tab === "women";
    return p.gender === tab;
  }

  function inPill(p, pill) {
    switch (pill) {
      case "new": return anyNewTag ? hasTag(p, "new") : true;
      case "under50": return p.price < 50;
      case "running": return hasTag(p, "running");
      case "lifestyle": return hasTag(p, "lifestyle");
      case "kids": return p.gender === "kids";
      case "sale": return onSale(p);
    }
    return true;
  }

  function newArrivals() { return products.filter(function (p) { return inPill(p, "new"); }); }

  function trending() {
    var tagged = products.filter(function (p) { return hasTag(p, "trending"); });
    if (tagged.length) return tagged.slice(0, RAIL_MAX);
    var shown = newArrivals().slice(0, RAIL_MAX);
    return products.filter(function (p) { return shown.indexOf(p) === -1; }).slice(0, RAIL_MAX);
  }

  function results() {
    var list = products;
    if (state.pill) list = list.filter(function (p) { return inPill(p, state.pill); });
    else if (state.brand) list = list.filter(function (p) { return p.brand.toLowerCase() === state.brand.toLowerCase(); });
    else if (state.q) {
      var words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter(function (p) { return words.every(function (w) { return p.search.indexOf(w) !== -1; }); });
    } else if (!state.browse) list = newArrivals();
    list = list.filter(function (p) { return inTab(p, state.tab); });
    return state.browse ? list : list.slice(0, RAIL_MAX);
  }

  function title() {
    if (state.pill) return PILLS[state.pill];
    if (state.brand) return state.brand;
    if (state.q) return "Results for “" + state.q + "”";
    return state.browse ? TAB_TITLES[state.tab] : "New Arrivals";
  }

  /* How many shoes a link like "gender:men" or "pill:sale" would show. */
  function countFor(go) {
    var parts = String(go).split(":");
    if (parts[0] === "gender") return products.filter(function (p) { return inTab(p, parts[1]); }).length;
    if (parts[0] === "pill") return products.filter(function (p) { return inPill(p, parts[1]); }).length;
    if (parts[0] === "brand") return products.filter(function (p) { return p.brand.toLowerCase() === parts.slice(1).join(":").toLowerCase(); }).length;
    return products.length;
  }

  /* ---------- drawing ---------- */

  function money(n) {
    return "$" + (Math.round(n * 100) % 100 === 0 ? String(Math.round(n)) : n.toFixed(2));
  }

  function picture(p) {
    var img = document.createElement("img");
    img.alt = p.name;
    img.loading = "lazy";
    img.decoding = "async";
    img.width = 400;
    img.height = 400;
    img.addEventListener("error", function () { if (img.parentNode) img.parentNode.removeChild(img); });
    img.src = p.image;
    return img;
  }

  function card(p) {
    var li = document.createElement("li");
    var a = el("a", "prod");
    a.href = p.url || WHATNOT;
    a.rel = "noopener";

    var frame = el("div", "img");
    if (p.image) frame.appendChild(picture(p));
    a.appendChild(frame);
    a.appendChild(el("p", "nm", p.name));

    var sub = GENDER_LABELS[p.gender] || p.brand;
    if (sub) a.appendChild(el("p", "gd", sub));

    var pr = el("p", "pr");
    pr.appendChild(el("span", "vh", "Price "));
    pr.appendChild(el("b", p.retail ? "sale" : "", money(p.price)));
    if (p.retail) {
      pr.appendChild(el("span", "vh", ", retail price "));
      pr.appendChild(el("s", "", money(p.retail)));
    }
    a.appendChild(pr);

    if (p.retail) {
      var off = Math.round((1 - p.price / p.retail) * 100);
      if (off > 0) a.appendChild(el("p", "off", off + "% off retail"));
    }
    li.appendChild(a);
    return li;
  }

  function fill(rail, list) {
    while (rail.firstChild) rail.removeChild(rail.firstChild);
    list.forEach(function (p) { rail.appendChild(card(p)); });
  }

  function press(sel, attr, value) {
    all(sel).forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute(attr) === value ? "true" : "false");
    });
  }

  function draw() {
    var list = results();
    var rail = byId("rail-new");
    fill(rail, list);
    rail.classList.toggle("scroll", !state.browse);
    rail.hidden = !list.length;
    byId("results-title").textContent = title();
    byId("results-count").textContent = state.browse ? (list.length === 1 ? "1 pair" : list.length + " pairs") : "";
    byId("results-empty").hidden = list.length > 0;
    press("[data-tab]", "data-tab", state.tab);
    press("[data-pill]", "data-pill", state.pill || "");
  }

  function show(change, jump) {
    for (var key in change) state[key] = change[key];
    draw();
    if (jump) {
      var heading = byId("results-title");
      byId("new").scrollIntoView();
      heading.focus({ preventScroll: true });
    }
  }

  function reset() { return { tab: "all", pill: null, brand: null, q: "", browse: false }; }

  function go(target) {
    var parts = String(target).split(":");
    var next = reset();
    next.browse = true;
    if (parts[0] === "gender") next.tab = parts[1];
    else if (parts[0] === "pill") next.pill = parts[1];
    else if (parts[0] === "brand") next.brand = parts.slice(1).join(":");
    var box = byId("q");
    if (box) box.value = "";
    show(next, true);
  }

  /* ---------- tiles ---------- */

  function tileFace(frame, list, word) {
    var withImage = list.filter(function (p) { return p.image; })[0];
    frame.textContent = "";
    if (!withImage) { frame.textContent = word; return; }
    var img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", function () { frame.textContent = word; });
    img.src = withImage.image;
    frame.appendChild(img);
  }

  function categoryTiles() {
    all("#cat-tiles .tile").forEach(function (tile) {
      var target = tile.getAttribute("data-go").split(":");
      var list = products.filter(function (p) {
        return target[0] === "gender" ? inTab(p, target[1]) : inPill(p, target[1]);
      });
      tileFace(tile.querySelector(".img"), list, tile.getAttribute("data-tile"));
    });
  }

  function brandTiles() {
    var counts = {};
    products.forEach(function (p) { if (p.brand) counts[p.brand] = (counts[p.brand] || 0) + 1; });
    var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); });
    var holder = byId("brand-tiles");
    if (!names.length) {
      byId("brands").hidden = true;
      all('a[href="#brands"]').forEach(function (a) { a.hidden = true; });
      return;
    }
    function add(label, target, list, word) {
      var li = document.createElement("li");
      var b = el("button", "tile");
      b.type = "button";
      b.setAttribute("data-go", target);
      var frame = el("span", "img");
      frame.setAttribute("aria-hidden", "true");
      if (list) tileFace(frame, list, word); else frame.textContent = word;
      b.appendChild(frame);
      b.appendChild(el("span", "lb", label));
      li.appendChild(b);
      holder.appendChild(li);
    }
    names.slice(0, TOP_BRANDS).forEach(function (name) {
      add(name, "brand:" + name, products.filter(function (p) { return p.brand === name; }), name);
    });
    add("All Brands", "all", null, "All");
  }

  /* ---------- start ---------- */

  function start(list) {
    products = (Array.isArray(list) ? list : (list && Array.isArray(list.products) ? list.products : []))
      .map(clean).filter(Boolean);
    if (!products.length) return;            /* nothing to sell yet: leave the page as it is */
    anyNewTag = products.some(function (p) { return hasTag(p, "new"); });

    all("[data-needs-products]").forEach(function (n) { n.hidden = false; });
    all("[data-no-products]").forEach(function (n) { n.hidden = true; });
    byId("hdr").classList.add("has-nav");

    categoryTiles();
    brandTiles();

    /* Hide any link, pill or tab that would show nothing. */
    all("[data-go]").forEach(function (n) {
      if (countFor(n.getAttribute("data-go")) === 0) (n.classList.contains("tile") ? n.parentNode : n).hidden = true;
    });
    all("[data-pill]").forEach(function (n) { if (countFor("pill:" + n.getAttribute("data-pill")) === 0) n.hidden = true; });
    all("[data-tab]").forEach(function (n) { if (countFor("gender:" + n.getAttribute("data-tab")) === 0) n.hidden = true; });

    var hot = trending();
    if (hot.length) { fill(byId("rail-trending"), hot); byId("trending").hidden = false; }

    document.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-go],[data-pill],[data-tab],#results-reset") : null;
      if (!t) return;
      if (t.id === "results-reset") { byId("q").value = ""; show(reset(), false); return; }
      if (t.hasAttribute("data-go")) { go(t.getAttribute("data-go")); return; }
      if (t.hasAttribute("data-tab")) {
        var tab = t.getAttribute("data-tab");
        var change = { tab: tab };
        if (state.pill === "kids" && tab !== "all" && tab !== "kids") { change.pill = null; change.browse = true; }
        show(change, false);
        return;
      }
      var pill = t.getAttribute("data-pill");
      var next = reset();
      if (state.pill !== pill) { next.pill = pill; next.browse = true; }   /* pressing it again turns it off */
      if (pill !== "kids") next.tab = state.tab;
      byId("q").value = "";
      show(next, false);
    });

    var form = byId("search-form");
    var box = byId("q");
    function search(jump) {
      var q = box.value.trim();
      var next = reset();
      next.q = q;
      next.browse = q !== "";
      show(next, jump && q !== "");
    }
    box.addEventListener("input", function () { search(false); });
    form.addEventListener("submit", function (e) { e.preventDefault(); search(true); });

    draw();
  }

  if (!window.fetch || !byId("rail-new")) return;
  window.fetch("products.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : []; })
    .catch(function () { return []; })
    .then(start)
    .catch(function () { /* a bad file must never break the page */ });
})();
