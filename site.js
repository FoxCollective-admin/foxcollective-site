/* The Fox Collective site: preview switch.
 *
 * LAUNCH: change true to false on the next line. That one change removes the
 * "Preview for Antony" bar and every empty photo or video slot on every page.
 */
var FOX_PREVIEW = false;

(function () {
  if (!FOX_PREVIEW) return;
  var notes = {
    home: "Preview for Antony. Storefront home for foxcollective.org. Not live yet.",
    hosts: "Preview for Antony. Hiring page (Careers). Not live yet.",
    notfound: "Preview for Antony. The page people see for a wrong link. Not live yet."
  };
  document.documentElement.className += " preview";
  function addNote() {
    var page = document.body.getAttribute("data-page");
    if (!notes[page]) return;
    var bar = document.createElement("div");
    bar.className = "preview-note";
    bar.setAttribute("role", "note");
    bar.textContent = notes[page];
    document.body.insertBefore(bar, document.body.firstChild);
  }
  if (document.body) addNote();
  else document.addEventListener("DOMContentLoaded", addNote);
})();
