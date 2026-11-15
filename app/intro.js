// First screen: the elephant draws itself big in the middle, then flies down into the logo spot
// while the dark cover fades and the room "lands" underneath. Click anywhere to skip.
(() => {
  const intro = document.getElementById("intro");
  if (!intro) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const done = () => { intro.remove(); document.body.classList.remove("intro-on", "intro-landing"); };
  if (reduce) return done();
  document.body.classList.add("intro-on");
  const mark = intro.querySelector(".intro-mark");
  let left = false;
  const land = () => {
    if (left) return; left = true;
    const brand = document.querySelector(".brand svg");
    const to = brand && brand.getBoundingClientRect();
    intro.classList.add("out");
    document.body.classList.add("intro-landing");
    document.body.classList.remove("intro-on");   // the frame fades in (CSS transition), the logo stays hidden until the mark arrives
    document.querySelector(".brand")?.style.setProperty("visibility", "hidden");
    const from = mark.getBoundingClientRect();
    const showBrand = () => { document.querySelector(".brand")?.style.removeProperty("visibility"); done(); };
    if (!to || !to.width) {   // no logo on screen (phones): just fade away
      mark.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: "forwards" }).onfinish = showBrand;
      return;
    }
    const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
    mark.animate([
      { transform: "translate(0,0) scale(1)" },
      { transform: `translate(${dx}px,${dy}px) scale(${to.width / from.width})` },
    ], { duration: 1000, easing: "cubic-bezier(.7,0,.2,1)", fill: "forwards" }).onfinish = showBrand;
  };
  intro.addEventListener("click", land);
  setTimeout(land, 2000);
})();
