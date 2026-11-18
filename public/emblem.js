// شعارات الفرق: كل فرقة لها شكل + لون + رمز
const SHAPES = {
  shield:   { name: "درع",   path: "M50 4 L92 17 V48 C92 74 72 90 50 97 C28 90 8 74 8 48 V17 Z", ty: 56 },
  hex:      { name: "سداسي", path: "M50 3 L92 26 V74 L50 97 L8 74 V26 Z", ty: 56 },
  star:     { name: "نجمة",  path: "M50 2 L62 36 L98 37 L69 59 L80 95 L50 74 L20 95 L31 59 L2 37 L38 36 Z", ty: 60 },
  diamond:  { name: "ماسة",  path: "M50 2 L96 50 L50 98 L4 50 Z", ty: 57 },
  circle:   { name: "دائرة", path: "M50 3 A47 47 0 1 1 49.9 3 Z", ty: 57 },
  octagon:  { name: "مثمن",  path: "M31 4 H69 L96 31 V69 L69 96 H31 L4 69 V31 Z", ty: 57 },
  crown:    { name: "تاج",   path: "M6 28 L28 50 L50 10 L72 50 L94 28 L85 90 H15 Z", ty: 66 },
  triangle: { name: "مثلث",  path: "M50 4 L97 92 H3 Z", ty: 70 }
};
let _eid = 0;
function emblem(shape, color, emoji, size = 52, anim = false) {
  const s = SHAPES[shape] || SHAPES.shield, id = "eg" + (++_eid);
  return `<svg class="emblem${anim ? " emb-anim" : ""}" width="${size}" height="${size}" viewBox="0 0 100 100" style="flex:none;overflow:visible;filter:drop-shadow(0 0 ${size / 8}px ${color}88)">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".35" stop-color="${color}"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient></defs>
    <path d="${s.path}" fill="${color}"/>
    <path d="${s.path}" fill="url(#${id})" stroke="#fff" stroke-opacity=".85" stroke-width="4" stroke-linejoin="round"/>
    <text x="50" y="${s.ty}" text-anchor="middle" dominant-baseline="middle" font-size="40">${emoji || ""}</text>
  </svg>`;
}
