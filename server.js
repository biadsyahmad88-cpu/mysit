// =====================================================
//  غرفة الهروب — آفة اللسان: الغيبة
//  Node.js فقط (بدون مكتبات) — شغّل: node server.js
// =====================================================
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { main: MAIN, doors: DOOR_Q, extra: EXTRA } = require("./questions");

const PORT = process.env.PORT || 3000;
const DOORS = 4;              // 4 أبواب، كل باب فيه سؤال ورقم من الكود
const QUIZ_Q = 8;             // 8 أسئلة بالبداية قبل الأبواب
const HINT_PENALTY = 30; // ثواني تُضاف عند استخدام تلميح الخزنة
const TEACHER_KEY = crypto.randomBytes(4).toString("hex");
const ALL_Q = Object.fromEntries([...MAIN, ...DOOR_Q, ...EXTRA].map(q => [q.id, q]));

const AVATARS = ["🦊","🐼","🦁","🐯","🐸","🐵","🐧","🦉","🐙","🦄","🐲","🐺","🐨","🐰","🦅","🐬"];
const TEAM_EMOJIS = ["🗝️","🔥","⚡","🌙","⭐","🚀","🛡️","💎","🏹","🦂","🌪️","🎯"];
const TEAM_SHAPES = ["shield","hex","star","diamond","circle","octagon","crown","triangle"];
const COLORS = ["#ff6b6b","#4ecdc4","#ffd93d","#a78bfa","#3ddc84","#ff9f43","#54a0ff","#ff6bcb","#00d2d3","#c8d6e5"];

function getIPs() {
  // نفضّل عنوان الواي فاي الحقيقي (192.168 / 10.x) ونترك كروت الشبكة الوهمية للآخر
  const good = [], other = [];
  for (const [name, list] of Object.entries(os.networkInterfaces()))
    for (const n of list) {
      if ((n.family !== "IPv4" && n.family !== 4) || n.internal) continue;
      const virt = /vEthernet|VirtualBox|VMware|WSL|Hyper-V|docker|Bluetooth|Tailscale|ZeroTier|Radmin|Hamachi|Loopback/i.test(name);
      const priv = /^192\.168\./.test(n.address) || /^10\./.test(n.address);
      (!virt && priv ? good : other).push(n.address);
    }
  const all = [...good, ...other];
  return all.length ? all : ["localhost"];
}
const IPS = getIPs();
// الرابط السهل للطلاب
const STUDENT_PATH = "/" + (process.env.STUDENT_PATH || "alaa-siraj");
// إذا اللعبة مرفوعة أونلاين (Render يعطي الرابط تلقائياً) نستعمل الرابط العام
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
let TUNNEL_URL = "";
const lanUrls = () => IPS.map(ip => `http://${ip}:${PORT}${STUDENT_PATH}`);
const onlineUrl = () => (PUBLIC_URL || TUNNEL_URL) ? (PUBLIC_URL || TUNNEL_URL) + STUDENT_PATH : "";
const playUrl = () => onlineUrl() || lanUrls()[0];

// رابط أونلاين مجاني عبر cloudflared — يشتغل من أي إنترنت (حتى بيانات الهاتف)
function startTunnel() {
  if (PUBLIC_URL || process.env.TUNNEL === "0") return;
  const exe = path.join(__dirname, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
  const cmd = fs.existsSync(exe) ? exe : "cloudflared";
  let child;
  try { child = spawn(cmd, ["tunnel", "--no-autoupdate", "--url", "http://localhost:" + PORT]); } catch (e) { return; }
  child.on("error", () => console.log("   (الرابط الأونلاين غير متاح — ملف cloudflared غير موجود)"));
  const onData = d => {
    const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !TUNNEL_URL) { TUNNEL_URL = m[0]; console.log("   رابط أونلاين :  " + onlineUrl()); broadcast(); }
  };
  child.stdout.on("data", onData); child.stderr.on("data", onData);
  const kill = () => { try { child.kill(); } catch (e) {} };
  process.on("exit", kill);
  process.on("SIGINT", () => { kill(); process.exit(); });
}

const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const uid = () => crypto.randomBytes(5).toString("hex");
const clean = (s, n) => String(s || "").replace(/[<>]/g, "").trim().slice(0, n);

// ================= حالة اللعبة =================
let G;
function resetGame() {
  const settings = G ? G.settings : { teamSize: 2, timeLimit: 0 };
  G = { phase: "lobby", settings, players: {}, teams: {}, chat: [], startTime: 0, endTime: 0, rank: 0, teamNo: 0, msgNo: 0 };
  addSystem("all", "🎮 أهلاً بكم! اختاروا مجموعة وانتظروا المعلم ليبدأ اللعبة");
}

function addMsg(m) {
  m.id = ++G.msgNo; m.t = Date.now();
  G.chat.push(m);
  if (G.chat.length > 300) G.chat.shift();
}
function addSystem(scope, text) { addMsg({ scope, system: true, text }); }

function teamFree(t) { return t.members.length < G.settings.teamSize; }

function createTeam(name, emoji, shape) {
  const used = Object.values(G.teams).map(t => t.color);
  const color = COLORS.find(c => !used.includes(c)) || COLORS[G.teamNo % COLORS.length];
  const usedS = Object.values(G.teams).map(t => t.shape);
  if (!TEAM_SHAPES.includes(shape)) shape = TEAM_SHAPES.find(x => !usedS.includes(x)) || TEAM_SHAPES[G.teamNo % TEAM_SHAPES.length];
  const t = {
    id: uid(), name, emoji: TEAM_EMOJIS.includes(emoji) ? emoji : TEAM_EMOJIS[G.teamNo % TEAM_EMOJIS.length],
    color, shape, members: [], slot: 0, questions: [], pool: [], code: [], digits: [], shuffled: [],
    revealed: [], mistakes: 0, hints: 0, finished: false, finishTime: 0, rank: 0, event: { n: 0 }
  };
  G.teamNo++;
  G.teams[t.id] = t;
  return t;
}

function removeFromTeam(p) {
  const t = G.teams[p.teamId];
  if (t) {
    t.members = t.members.filter(id => id !== p.id);
    if (!t.members.length && G.phase === "lobby") delete G.teams[t.id];
  }
  p.teamId = null;
}

function setupTeam(t) {
  t.questions = MAIN.map(q => q.id);          // أسئلة البداية
  t.doorQs = DOOR_Q.map(q => q.id);           // سؤال لكل باب
  t.doorsDone = DOOR_Q.map(() => false);
  t.active = null;                            // الباب اللي اختاروه
  t.pool = shuffle(EXTRA.map(q => q.id));     // أسئلة بديلة
  t.code = shuffle([0,1,2,3,4,5,6,7,8,9]).slice(0, DOORS);
  t.slot = 0; t.digits = []; t.shuffled = []; t.revealed = [];
  t.mistakes = 0; t.hints = 0; t.finished = false; t.finishTime = 0; t.rank = 0;
  t.event = { n: 0 };
}

function startGame() {
  // وزّع الطلاب اللي بدون مجموعة
  for (const p of Object.values(G.players)) {
    if (p.teamId && G.teams[p.teamId]) continue;
    let t = Object.values(G.teams).find(teamFree);
    if (!t) t = createTeam("مجموعة " + (G.teamNo + 1));
    t.members.push(p.id); p.teamId = t.id;
  }
  for (const t of Object.values(G.teams)) {
    if (!t.members.length) { delete G.teams[t.id]; continue; }
    setupTeam(t);
  }
  G.phase = "playing"; G.startTime = Date.now(); G.endTime = 0; G.rank = 0;
  addSystem("all", "🚀 بدأت اللعبة! جاوبوا على 8 أسئلة، بعدها اختاروا الأبواب واجمعوا أرقام الخزنة");
}

function endGame() {
  if (G.phase !== "playing") return;
  G.phase = "ended"; G.endTime = Date.now();
  // الترتيب النهائي 1-2-3 حسب النقاط (السرعة + الأخطاء + التقدم)
  const order = Object.values(G.teams).sort(compareScore);
  order.forEach((t, i) => { t.rank = i + 1; });
  addSystem("all", "🏁 انتهت اللعبة! النتائج على شاشة المعلم");
}

// ================= حساب النقاط =================
const PTS = { quiz: 10, door: 25, safe: 100, speedMax: 300, speedPerSec: 0.25, mistake: 15, hint: 20 };
function scoreOf(t) {
  const quiz = Math.min(t.slot || 0, QUIZ_Q) * PTS.quiz;
  const doors = (t.doorsDone || []).filter(Boolean).length * PTS.door;
  const safe = t.finished ? PTS.safe : 0;
  const time = G.startTime ? teamTime(t) : 0;
  const speed = t.finished ? Math.max(0, Math.round(PTS.speedMax - time * PTS.speedPerSec)) : 0;
  const mist = (t.mistakes || 0) * PTS.mistake;
  const hint = (t.hints || 0) * PTS.hint;
  return { quiz, doors, safe, speed, mist, hint, total: Math.max(0, quiz + doors + safe + speed - mist - hint) };
}
function compareScore(a, b) {
  const sa = scoreOf(a), sb = scoreOf(b);
  return sb.total - sa.total || teamTime(a) - teamTime(b) || a.mistakes - b.mistakes;
}

function teamTime(t) {
  const end = t.finished ? t.finishTime : (G.endTime || Date.now());
  return Math.max(0, Math.round((end - G.startTime) / 1000)) + t.hints * HINT_PENALTY;
}

function ranking() {
  if (G.phase === "ended") return Object.values(G.teams).sort((a, b) => (a.rank || 999) - (b.rank || 999));
  return Object.values(G.teams).sort(compareScore);
}

// المرحلة: quiz = أسئلة البداية، doors = اختيار الأبواب، safe = الخزنة
function stage(t) {
  if (t.finished) return "done";
  if (t.slot < QUIZ_Q) return "quiz";
  if (t.doorsDone.every(Boolean)) return "safe";
  return "doors";
}
function currentQ(t) {
  const st = stage(t);
  if (st === "quiz") return { key: t.slot, qid: t.questions[t.slot], kind: "quiz" };
  if (st === "doors" && t.active !== null) return { key: 100 + t.active, qid: t.doorQs[t.active], kind: "door", door: t.active };
  return null;
}
function nextExtra(t) {
  if (!t.pool.length) t.pool = shuffle(EXTRA.map(x => x.id).filter(id => !t.questions.includes(id) && !t.doorQs.includes(id)));
  return t.pool.shift();
}

function fireEvent(t, ev) { t.event = { ...ev, n: t.event.n + 1, t: Date.now() }; }

// ================= أفعال الطلاب =================
function studentAction(p, a) {
  const t = G.teams[p.teamId];
  switch (a.type) {
    case "createTeam": {
      if (G.phase !== "lobby") return "اللعبة بدأت";
      const name = clean(a.name, 18);
      if (!name) return "اكتب اسم المجموعة";
      if (Object.values(G.teams).some(x => x.name === name)) return "الاسم مستخدم";
      removeFromTeam(p);
      const nt = createTeam(name, a.emoji, a.shape);
      nt.members.push(p.id); p.teamId = nt.id;
      addSystem("all", `${p.avatar} ${p.name} أنشأ مجموعة ${nt.emoji} ${nt.name}`);
      return;
    }
    case "joinTeam": {
      if (G.phase !== "lobby") return "اللعبة بدأت";
      const jt = G.teams[a.teamId];
      if (!jt) return "المجموعة غير موجودة";
      if (jt.id === p.teamId) return;
      if (!teamFree(jt)) return "المجموعة ممتلئة";
      removeFromTeam(p);
      jt.members.push(p.id); p.teamId = jt.id;
      addSystem("all", `${p.avatar} ${p.name} انضم إلى ${jt.emoji} ${jt.name}`);
      return;
    }
    case "leaveTeam": {
      if (G.phase !== "lobby") return;
      removeFromTeam(p); return;
    }
    case "chat": {
      const text = clean(a.text, 150);
      if (!text) return;
      const now = Date.now();
      if (now - (p.lastChat || 0) < 700) return "تمهّل قليلاً";
      p.lastChat = now;
      const scope = G.phase === "lobby" || !t ? "all" : (a.scope === "all" ? "all" : t.id);
      addMsg({ scope, name: p.name, avatar: p.avatar, team: t ? t.name : "", color: t ? t.color : "#aaa", text, pid: p.id });
      return;
    }
    case "pickDoor": {
      if (G.phase !== "playing" || !t || stage(t) !== "doors") return;
      const d = Number(a.door);
      if (!(d >= 0 && d < DOORS) || t.doorsDone[d]) return "هذا الباب مسكّر";
      if (t.active === d) return;
      t.active = d;
      fireEvent(t, { type: "pick", door: d, by: p.name });
      return;
    }
    case "leaveDoor": {
      if (!t || stage(t) !== "doors") return;
      t.active = null; fireEvent(t, { type: "leave", by: p.name }); return;
    }
    case "answer": {
      if (G.phase !== "playing" || !t) return;
      const cur = currentQ(t);
      if (!cur || a.slot !== cur.key || a.qid !== cur.qid) return; // سؤال قديم
      const q = ALL_Q[cur.qid];
      if (Number(a.choice) === q.answer) {
        if (cur.kind === "quiz") {
          t.slot++;
          if (t.slot >= QUIZ_Q) {
            fireEvent(t, { type: "quizDone", by: p.name });
            addSystem(t.id, "🚪 خلصتم الأسئلة! اختاروا أي باب وحلّوا سؤاله");
          } else fireEvent(t, { type: "correct", by: p.name });
        } else {
          const d = cur.door;
          t.doorsDone[d] = true; t.active = null;
          t.digits = t.code.map((c, i) => t.doorsDone[i] ? c : null);
          fireEvent(t, { type: "door", door: d, digit: t.code[d], by: p.name });
          if (t.doorsDone.every(Boolean)) {
            t.slot = QUIZ_Q + DOORS;
            do { t.shuffled = shuffle(t.code); } while (t.shuffled.join("") === t.code.join(""));
            addSystem(t.id, "🔐 سكّرتم الأبواب الأربعة! رتّبوا الأرقام لفتح الخزنة");
          }
        }
      } else {
        t.mistakes++;
        const right = q.options[q.answer];
        if (cur.kind === "quiz") t.questions[t.slot] = nextExtra(t);
        else t.doorQs[cur.door] = nextExtra(t);
        fireEvent(t, { type: "wrong", by: p.name, right });
      }
      return;
    }
    case "safe": {
      if (G.phase !== "playing" || !t || stage(t) !== "safe") return;
      const order = (a.order || []).map(Number);
      if (order.join(",") === t.code.join(",")) {
        t.finished = true; t.finishTime = Date.now(); t.finishOrder = ++G.rank;
        fireEvent(t, { type: "win", by: p.name });
        addSystem("all", `🔓 مجموعة ${t.emoji} ${t.name} فتحت الخزنة! (رقم ${t.finishOrder} بالوصول) — الترتيب النهائي لما يخلص المعلم اللعبة`);
      } else {
        t.mistakes++;
        do { t.shuffled = shuffle(t.code); } while (t.shuffled.join("") === t.code.join("") && t.revealed.length < DOORS - 1);
        fireEvent(t, { type: "safeWrong", by: p.name });
      }
      return;
    }
    case "hint": {
      if (G.phase !== "playing" || !t || stage(t) !== "safe") return;
      if (t.revealed.length >= DOORS - 1) return "لا يوجد تلميحات أخرى";
      const next = [0,1,2,3].find(i => !t.revealed.includes(i));
      t.revealed.push(next); t.hints++;
      fireEvent(t, { type: "hint", by: p.name, pos: next });
      return;
    }
  }
}

// ================= أفعال المعلم =================
function teacherAction(a) {
  switch (a.type) {
    case "settings":
      if (a.teamSize >= 1 && a.teamSize <= 4) G.settings.teamSize = Number(a.teamSize);
      if (a.timeLimit !== undefined) G.settings.timeLimit = Math.max(0, Number(a.timeLimit) || 0);
      return;
    case "start": if (G.phase === "lobby") { if (!Object.keys(G.players).length) return "لا يوجد طلاب"; startGame(); } return;
    case "end": endGame(); return;
    case "reset": resetGame(); return;
    case "kick": {
      const p = G.players[a.pid]; if (!p) return;
      removeFromTeam(p); delete G.players[p.id];
      for (const c of clients) if (c.pid === p.id) { c.res.write("event: kicked\ndata: 1\n\n"); }
      return;
    }
    case "deleteTeam": {
      const t = G.teams[a.teamId]; if (!t || G.phase !== "lobby") return;
      t.members.forEach(id => { if (G.players[id]) G.players[id].teamId = null; });
      delete G.teams[t.id]; return;
    }
    case "announce": {
      const text = clean(a.text, 200); if (!text) return;
      addMsg({ scope: "all", teacher: true, name: "المعلم", avatar: "👨‍🏫", text }); return;
    }
  }
}

// ================= الحالة المرسلة =================
function publicTeam(t) {
  return {
    id: t.id, name: t.name, emoji: t.emoji, color: t.color, shape: t.shape,
    members: t.members.map(id => G.players[id]).filter(Boolean).map(p => ({ id: p.id, name: p.name, avatar: p.avatar, online: isOnline(p.id) })),
    stage: t.doorsDone ? stage(t) : "quiz", quiz: Math.min(t.slot, QUIZ_Q),
    doorsDone: t.doorsDone || [], doors: (t.doorsDone || []).filter(Boolean).length, active: t.active ?? null,
    slot: t.slot, mistakes: t.mistakes, hints: t.hints,
    finished: t.finished, rank: G.phase === "ended" ? t.rank : 0, finishOrder: t.finishOrder || 0, score: scoreOf(t), time: G.startTime ? teamTime(t) : 0, atSafe: !!t.doorsDone && stage(t) === "safe"
  };
}

function studentState(p) {
  const t = G.teams[p.teamId];
  const s = {
    phase: G.phase, settings: G.settings, startTime: G.startTime, endTime: G.endTime, now: Date.now(),
    me: { id: p.id, name: p.name, avatar: p.avatar, teamId: p.teamId },
    teams: ranking().map(publicTeam), doors: DOORS, quizQ: QUIZ_Q, hintPenalty: HINT_PENALTY,
    chat: G.chat.filter(m => m.scope === "all" || (t && m.scope === t.id)).slice(-80)
  };
  if (t && G.phase !== "lobby") {
    const my = { ...publicTeam(t), digits: t.digits, event: t.event, revealed: t.revealed.map(i => ({ pos: i, digit: t.code[i] })) };
    const cur = currentQ(t);
    if (cur) {
      const q = ALL_Q[cur.qid];
      my.question = { qid: q.id, q: q.q, options: q.options, slot: cur.key, kind: cur.kind, door: cur.door, num: t.slot + 1, isExtra: q.id[0] === "e" };
    }
    if (stage(t) === "safe") my.shuffled = t.shuffled;
    if (G.phase === "ended" || t.finished) my.code = t.code;
    s.team = my;
  }
  return s;
}

function teacherState() {
  return {
    phase: G.phase, settings: G.settings, startTime: G.startTime, endTime: G.endTime, now: Date.now(),
    url: playUrl(), onlineUrl: onlineUrl(), lanUrls: PUBLIC_URL ? [] : lanUrls(), doors: DOORS, quizQ: QUIZ_Q,
    teams: ranking().map(t => ({ ...publicTeam(t), code: t.code })),
    unassigned: Object.values(G.players).filter(p => !p.teamId || !G.teams[p.teamId]).map(p => ({ id: p.id, name: p.name, avatar: p.avatar, online: isOnline(p.id) })),
    playerCount: Object.keys(G.players).length,
    chat: G.chat.slice(-120).map(m => ({ ...m, scopeName: m.scope === "all" ? "" : (G.teams[m.scope] ? G.teams[m.scope].name : "") }))
  };
}

// ================= SSE =================
let clients = [];
function isOnline(pid) { const p = G.players[pid]; return clients.some(c => c.pid === pid) || !!(p && Date.now() - (p.lastPoll || 0) < 5000); }
let pending = false;
function broadcast() {
  if (pending) return; pending = true;
  setTimeout(() => {
    pending = false;
    for (const c of clients) {
      let data;
      if (c.role === "teacher") data = teacherState();
      else { const p = G.players[c.pid]; if (!p) continue; data = studentState(p); }
      c.res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  }, 40);
}

setInterval(() => {
  if (G.phase === "playing" && G.settings.timeLimit > 0 && Date.now() - G.startTime >= G.settings.timeLimit * 60000) { endGame(); broadcast(); }
}, 1000);
setInterval(() => { for (const c of clients) c.res.write(": ping\n\n"); }, 15000);

// ================= HTTP =================
function send(res, code, data, type = "application/json") {
  res.writeHead(code, { "Content-Type": type + "; charset=utf-8", "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(data) : data);
}
function readBody(req) {
  return new Promise(r => {
    let b = ""; req.on("data", c => { b += c; if (b.length > 1e5) req.destroy(); });
    req.on("end", () => { try { r(JSON.parse(b || "{}")); } catch { r({}); } });
  });
}
const isLocal = req => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
const page = f => fs.readFileSync(path.join(__dirname, "public", f), "utf8");

http.createServer(async (req, res) => {
  const [url, qs] = req.url.split("?");
  const params = new URLSearchParams(qs || "");

  // الرابط الرئيسي = شاشة المعلم فقط
  if (url === "/" || url === "/teacher") return send(res, 200, page("teacher.html").replace("__KEY__", TEACHER_KEY), "text/html");
  // الطلاب يدخلون عبر الباركود إلى /play
  if (url === "/emblem.js") return send(res, 200, page("emblem.js"), "application/javascript");
  if (url === STUDENT_PATH || url === STUDENT_PATH + "/" || url === "/play") return send(res, 200, page("play.html"), "text/html");

  if (url === "/events") {
    const role = params.get("role") === "teacher" && params.get("key") === TEACHER_KEY ? "teacher" : "student";
    const pid = params.get("pid");
    if (role === "student" && !G.players[pid]) return send(res, 404, { error: "gone" });
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    if (res.flushHeaders) res.flushHeaders();
    res.write("retry: 2000\n\n");
    const c = { res, role, pid };
    clients.push(c);
    req.on("close", () => { clients = clients.filter(x => x !== c); broadcast(); });
    broadcast();
    return;
  }

  // بديل للاتصال المباشر (إذا الشبكة تمنع EventSource)
  if (url === "/api/state") {
    const p = G.players[params.get("pid")];
    if (!p) return send(res, 404, { error: "gone" });
    p.lastPoll = Date.now();
    return send(res, 200, studentState(p));
  }
  if (url === "/api/tstate") {
    if (params.get("key") !== TEACHER_KEY) return send(res, 403, { error: "no" });
    return send(res, 200, teacherState());
  }

  if (url === "/api/join" && req.method === "POST") {
    const b = await readBody(req);
    const name = clean(b.name, 16);
    if (!name) return send(res, 400, { error: "اكتب اسمك" });
    if (Object.values(G.players).some(p => p.name === name)) return send(res, 400, { error: "هذا الاسم موجود، اختر اسماً آخر" });
    const p = { id: uid(), name, avatar: AVATARS.includes(b.avatar) ? b.avatar : AVATARS[0], teamId: null };
    G.players[p.id] = p;
    if (G.phase !== "lobby") {
      // انضم متأخراً: أضفه لمجموعة فيها مكان
      const t = Object.values(G.teams).find(x => teamFree(x) && !x.finished);
      if (t) { t.members.push(p.id); p.teamId = t.id; }
      else { const nt = createTeam("مجموعة " + (G.teamNo + 1)); setupTeam(nt); nt.members.push(p.id); p.teamId = nt.id; }
    }
    broadcast();
    return send(res, 200, { id: p.id });
  }

  if (url === "/api/action" && req.method === "POST") {
    const b = await readBody(req);
    const p = G.players[b.pid];
    if (!p) return send(res, 404, { error: "gone" });
    const err = studentAction(p, b);
    broadcast();
    return send(res, 200, err ? { error: err } : { ok: true });
  }

  if (url === "/api/teacher" && req.method === "POST") {
    const b = await readBody(req);
    if (b.key !== TEACHER_KEY) return send(res, 403, { error: "no" });
    const err = teacherAction(b);
    broadcast();
    return send(res, 200, err ? { error: err } : { ok: true });
  }

  send(res, 404, "Not found", "text/plain");
}).on("error", e => {
  if (e.code === "EADDRINUSE") console.log("\n  [!] اللعبة شغالة أصلاً بنافذة ثانية — سكّرها أو افتح http://localhost:" + PORT + "\n");
  else console.log("\n  [!] خطأ: " + e.message + "\n");
}).listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("  ================================================");
  console.log("     غرفة الهروب — آفة اللسان: الغيبة");
  console.log("  ================================================");
  console.log("   شاشة المعلم :  " + (PUBLIC_URL || "http://localhost:" + PORT));
  lanUrls().forEach((u, i) => console.log((i ? "   أو          :  " : "   رابط الطلاب :  ") + u));
  startTunnel();
  // افتح شاشة المعلم بعد ما يجهز السيرفر (مش قبل)
  if (!PUBLIC_URL && process.env.NO_OPEN !== "1") {
    const u = "http://localhost:" + PORT;
    const c = process.platform === "win32" ? spawn("cmd", ["/c", "start", "", u], { detached: true, stdio: "ignore" })
      : spawn(process.platform === "darwin" ? "open" : "xdg-open", [u], { detached: true, stdio: "ignore" });
    c.on("error", () => {}); c.unref();
  }
  console.log("  ================================================");
  console.log("   لا تغلق هذه النافذة أثناء اللعب");
  console.log("");
});

resetGame();
