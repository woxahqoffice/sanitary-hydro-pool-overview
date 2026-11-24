/* จำลองการทำงาน 3 มิติ ระบบน้ำ 2 อาคาร เทศบาลนครตรัง
   พิกัดแบบ (x ขวา, y ลึกเข้าไป, z ขึ้น) หน่วยเมตร ระดับ ±0.00 = พื้นอาคาร
   แปลงเป็น three.js: X = x, Y = z, Z = -y
   ค่าระดับ ปริมาตร อัตราไหล ใช้ตามแบบ SN, PL และสเปคอุปกรณ์ของโครงการ */
(function () {
'use strict';
const T = THREE;
const V = (x, y, z) => new T.Vector3(x, z, -y);
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- สีและวัสดุ ----------
const COL = {
  clean: 0x2a9fd8, cleanP: 0x7fd8ff, pool: 0x2bb3c9, poolP: 0x9ff3ff, ret: 0x3b6fd6, retP: 0xa8c4ff,
  waste: 0x8a6a3c, wasteP: 0xd9a25a, eff: 0x5aa58a, effP: 0x9ff0c8, rain: 0x4d7f6b, rainP: 0x9fe0c0,
  air: 0xb8c4c9, airP: 0xffffff, drain: 0x7d8a90, drainP: 0xd0dde2, chem: 0xb04fc0, chemP: 0xf0a8ff, heat: 0xd9692b, heatP: 0xffb08a
};
const M = {};
function mats() {
  const S = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.7, metalness: 0 }, o || {}));
  M.soil = S(0xb08a5a, { transparent: true, opacity: 0.16, depthWrite: false });
  M.grass = S(0x6fa04a, { transparent: true, opacity: 0.16, depthWrite: false, side: T.DoubleSide });
  M.conc = S(0xc9cfd2, { roughness: 0.9 });
  M.concT = S(0xc9cfd2, { transparent: true, opacity: 0.28, depthWrite: false });
  M.wall = S(0xf2efe8, { transparent: true, opacity: 0.16, depthWrite: false, side: T.DoubleSide });
  M.floor = S(0xd8d4cc, { roughness: 0.85 });
  M.roof = S(0xc96a55, { transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide });
  M.vault = S(0xeae7df, { transparent: true, opacity: 0.18, depthWrite: false, side: T.DoubleSide });
  M.tank = S(0xdfeef5, { transparent: true, opacity: 0.2, depthWrite: false, side: T.DoubleSide });
  M.tankG = S(0x9fb3a0, { transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide });
  M.water = S(0x2a8fc4, { transparent: true, opacity: 0.55, roughness: 0.15, depthWrite: false });
  M.poolW = S(0x2bb3c9, { transparent: true, opacity: 0.5, roughness: 0.1, depthWrite: false });
  M.waste = S(0x8f7444, { transparent: true, opacity: 0.6, depthWrite: false });
  M.eff = S(0x6aa88c, { transparent: true, opacity: 0.55, depthWrite: false });
  M.sludge = S(0x4a3a24, { roughness: 1 });
  M.steel = S(0x9aa6ad, { metalness: 0.6, roughness: 0.35 });
  M.dark = S(0x39444a, { metalness: 0.4, roughness: 0.5 });
  M.pump = S(0x2c6fc2, { metalness: 0.3, roughness: 0.4 });
  M.motor = S(0x8d989e, { metalness: 0.5, roughness: 0.4 });
  M.white = S(0xf4f4f0, { roughness: 0.5 });
  M.cab = S(0xd9dee0, { roughness: 0.5 });
  M.frp = S(0xf2f2ee, { roughness: 0.4 });
  M.red = S(0xd04a35);
  M.person = S(0xe0a882, { roughness: 0.8 });
  M.sand = S(0xe2cf9c, { transparent: true, opacity: 0.3, depthWrite: false });
}

// ---------- เครื่องมือสร้างรูปทรง ----------
let G = null;              // group ของฉากปัจจุบัน
let PIPES = [];            // ท่อทั้งหมดในฉาก
let ANIM = [];             // ฟังก์ชันเคลื่อนไหวรายเฟรม
function add(m) { G.add(m); return m; }
function box(x0, x1, y0, y1, z0, z1, mat, edges) {
  const m = new T.Mesh(new T.BoxGeometry(x1 - x0, z1 - z0, y1 - y0), mat);
  m.position.copy(V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)); add(m);
  if (edges) { const e = new T.LineSegments(new T.EdgesGeometry(m.geometry), new T.LineBasicMaterial({ color: edges, transparent: true, opacity: 0.55 })); e.position.copy(m.position); add(e); }
  return m;
}
function cyl(a, b, r, mat, seg, open) {
  const A = V(...a), B = V(...b), d = B.clone().sub(A), L = d.length();
  const m = new T.Mesh(new T.CylinderGeometry(r, r, L, seg || 20, 1, !!open), mat);
  m.position.copy(A.clone().add(B).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); add(m); return m;
}
function sph(p, r, mat) { const m = new T.Mesh(new T.SphereGeometry(r, 16, 12), mat); m.position.copy(V(...p)); add(m); return m; }
// ระดับน้ำที่ปรับได้ (กล่องน้ำ ก้น zb)
function level(x0, x1, y0, y1, zb, mat) {
  const m = box(x0, x1, y0, y1, zb, zb + 1, mat); m.userData.zb = zb;
  m.set = (z) => { const h = Math.max(0.005, z - zb); m.scale.y = h; m.position.y = zb + h / 2; };
  return m;
}
// ท่อ: ตัวท่อโปร่ง + จุดน้ำวิ่งภายใน
const PGEO = new T.SphereGeometry(1, 10, 8);
function pipe(id, pts, r, col, pcol, sys) {
  const P = pts.map((p) => V(...p));
  const mat = new T.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.38, roughness: 0.3, depthWrite: false });
  const seg = [], cum = [0];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], d = b.clone().sub(a), L = d.length();
    const m = new T.Mesh(new T.CylinderGeometry(r, r, L, 16, 1, true), mat);
    m.position.copy(a.clone().add(b).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.clone().normalize()); add(m);
    seg.push(m); cum.push(cum[i] + L);
  }
  for (let i = 1; i < P.length - 1; i++) { const j = new T.Mesh(new T.SphereGeometry(r, 12, 10), mat); j.position.copy(P[i]); add(j); }
  const len = cum[cum.length - 1], n = Math.max(3, Math.round(len / 0.32));
  const pm = new T.InstancedMesh(PGEO, new T.MeshBasicMaterial({ color: pcol }), n); pm.frustumCulled = false; add(pm);
  const o = { id, pts, P, r, len, cum, n, pm, mat, seg, sys: sys || '', q: 0, off: Math.random(), vis: true };
  PIPES.push(o); return o;
}
function pointAt(o, s) {
  s = ((s % o.len) + o.len) % o.len;
  let i = 1; while (i < o.cum.length - 1 && o.cum[i] < s) i++;
  const a = o.P[i - 1], b = o.P[i], t = (s - o.cum[i - 1]) / (o.cum[i] - o.cum[i - 1] || 1);
  return a.clone().lerp(b, t);
}
const _m = new T.Matrix4(), _s = new T.Vector3(), _q = new T.Quaternion();
function flowPipes(dt) {
  for (const o of PIPES) {
    const on = Math.abs(o.q) > 0.004 && o.vis;
    o.pm.visible = on; if (!on) continue;
    const v = Math.sign(o.q) * (0.45 + 1.7 * Math.min(1, Math.abs(o.q)));
    o.off += v * dt / o.len;
    const sc = o.r * 0.62; _s.set(sc, sc, sc);
    for (let i = 0; i < o.n; i++) { _m.compose(pointAt(o, (i / o.n + o.off) * o.len), _q, _s); o.pm.setMatrixAt(i, _m); }
    o.pm.instanceMatrix.needsUpdate = true;
  }
}
// ตรวจท่อชนกัน: ระยะระหว่างช่วงท่อน้อยกว่าผลรวมรัศมี + 2 ซม. และไม่ใช่จุดต่อที่ปลายท่อ
function segDist(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r); let s, t;
  const c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
  t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
  const c1 = p1.clone().add(d1.multiplyScalar(s)), c2 = p2.clone().add(d2.multiplyScalar(t));
  return { d: c1.distanceTo(c2), c1, c2 };
}
function clashes() {
  const out = [];
  for (let i = 0; i < PIPES.length; i++) for (let j = i + 1; j < PIPES.length; j++) {
    const A = PIPES[i], B = PIPES[j], lim = A.r + B.r + 0.02;
    const ends = [A.P[0], A.P[A.P.length - 1], B.P[0], B.P[B.P.length - 1]];
    for (let a = 0; a < A.P.length - 1; a++) for (let b = 0; b < B.P.length - 1; b++) {
      const k = segDist(A.P[a], A.P[a + 1], B.P[b], B.P[b + 1]);
      if (k.d >= lim) continue;
      const nearEnd = ends.some((e) => e.distanceTo(k.c1) < lim + 0.06 || e.distanceTo(k.c2) < lim + 0.06);
      if (!nearEnd) out.push(A.id + ' × ' + B.id + ' ระยะ ' + k.d.toFixed(3) + ' ม.');
    }
  }
  return out;
}
// ปั๊ม: ตัวเรือนสีน้ำเงิน มอเตอร์ ใบพัดลมหมุน ไฟสถานะ (แกนตามแนว y)
function pumpY(x, y, z, s) {
  s = s || 1;
  cyl([x, y - 0.08 * s, z], [x, y + 0.08 * s, z], 0.21 * s, M.pump, 28);
  cyl([x, y + 0.08 * s, z], [x, y + 0.55 * s, z], 0.15 * s, M.motor, 24);
  box(x - 0.2 * s, x + 0.2 * s, y - 0.1 * s, y + 0.6 * s, z - 0.32 * s, z - 0.22 * s, M.dark);
  const fan = new T.Group(); fan.position.copy(V(x, y + 0.58 * s, z));
  for (let k = 0; k < 4; k++) { const b = new T.Mesh(new T.BoxGeometry(0.26 * s, 0.05 * s, 0.015), M.dark); b.rotation.z = k * Math.PI / 4; fan.add(b); }
  add(fan);
  const lt = new T.Mesh(new T.SphereGeometry(0.06 * s, 12, 10), new T.MeshBasicMaterial({ color: 0x7a868c })); lt.position.copy(V(x, y + 0.3 * s, z + 0.2 * s)); add(lt);
  const o = { run: false, fault: false };
  o.set = (run, fault) => { o.run = run; o.fault = fault; lt.material.color.setHex(fault ? 0xe0412c : run ? 0x37d06a : 0x7a868c); };
  ANIM.push((dt) => { if (o.run) fan.rotation.z += dt * 18; });
  return o;
}
function person(x, y, zb) {
  const g = new T.Group();
  const b = new T.Mesh(new T.CylinderGeometry(0.13, 0.15, 0.9, 12), M.person); b.position.y = 0.45; g.add(b);
  const h = new T.Mesh(new T.SphereGeometry(0.12, 12, 10), M.person); h.position.y = 1.02; g.add(h);
  g.position.copy(V(x, y, zb)); add(g); return g;
}
function bubbles(x0, x1, y0, y1, z0, z1, n) {
  const m = new T.InstancedMesh(PGEO, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }), n); m.frustumCulled = false; add(m);
  const st = []; for (let i = 0; i < n; i++) st.push([x0 + Math.random() * (x1 - x0), y0 + Math.random() * (y1 - y0), Math.random()]);
  const o = { on: true, rate: 1 };
  ANIM.push((dt) => {
    m.visible = o.on && o.rate > 0.02; if (!m.visible) return;
    for (let i = 0; i < n; i++) {
      const s = st[i]; s[2] = (s[2] + dt * 0.35 * o.rate) % 1;
      const r = 0.018 + 0.012 * Math.sin(i); _s.set(r, r, r);
      _m.compose(V(s[0] + 0.03 * Math.sin(s[2] * 9 + i), s[1], z0 + s[2] * (z1 - z0)), _q, _s); m.setMatrixAt(i, _m);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return o;
}
function ground(x0, x1, y0, y1, zb, zg) {
  box(x0, x1, y0, y1, zb, zg - 0.02, M.soil);
  const p = box(x0, x1, y0, y1, zg - 0.02, zg, M.grass); p.renderOrder = 2;
}

// ---------- ป้ายชี้ (เส้น 45° แล้วแนวนอน) ----------
let LABELS = [];
function label(k, pos, title, sub, dir, d, h) { LABELS.push({ k, p: V(...pos), title, sub, dir: dir || 'ur', d: d || 46, h: h || 18 }); }
const cvs = document.createElement('canvas').getContext('2d');
function tw(s, f) { cvs.font = f; return cvs.measureText(s).width; }

// ---------- ฉาก ----------
const SC = {};

// ===== 1) ถังน้ำใต้ดินและปั๊ม อาคารกายภาพบำบัด =====
SC.tank = {
  name: 'ถังน้ำใต้ดินและปั๊ม', cam: [[6.2, -9.5, 4.6], [5.6, 0.8, -0.3]],
  intro: 'ประปาเทศบาลเติมถังผ่านลูกลอย ปั๊มดูดน้ำจากถังส่งเข้าถังแรงดัน สวิตช์แรงดันสั่งปั๊มเดินที่ 1.9 บาร์ หยุดที่ 2.1 บาร์ ปั๊ม 2 ตัวสลับกันเดิน ลูกลอยไฟฟ้าตัดปั๊มเมื่อน้ำในถังต่ำกว่า -1.75',
  build() {
    const ZG = -0.10, A = 4.36; this.A = A;
    ground(-4.5, 15, -1.6, 3.2, -2.8, ZG);
    box(-0.3, 4.63, -0.95, 0.95, -2.45, -2.15, M.conc, 0x8a969b);                       // แผ่นฐาน
    box(-0.25, 4.58, -0.9, 0.9, -2.15, ZG - 0.02, M.sand);
    box(0, 4.33, -0.7, 0.7, -2.05, -0.5, M.tank, 0x5a8aa0);                               // ถัง WWU-1406
    this.w = level(0.03, 4.30, -0.67, 0.67, -2.03, M.water);
    for (const xn of [0.9, 3.4]) { cyl([xn, 0, -0.5], [xn, 0, ZG + 0.05], 0.28, M.tank, 24, true); cyl([xn, 0, ZG + 0.05], [xn, 0, ZG + 0.09], 0.32, M.frp); }
    // ลูกลอยเติมน้ำ (คอถัง 1) และลูกลอยไฟฟ้าตัดปั๊ม (คอถัง 2)
    this.ball = sph([1.25, 0, -0.9], 0.09, M.white); this.arm = cyl([0.75, 0, -0.82], [1.25, 0, -0.9], 0.012, M.steel);
    this.fs = sph([3.55, -0.12, -1.75], 0.07, M.red); cyl([3.55, -0.12, -0.3], [3.55, -0.12, -1.6], 0.008, M.dark);
    // ประปาเทศบาล มาตรวัดน้ำ
    box(-3.7, -3.3, -0.2, 0.2, -0.5, -0.2, M.steel, 0x555555);
    // แท่นปั๊ม ถังแรงดัน ตู้ควบคุม
    box(5.0, 7.4, -0.1, 1.5, ZG, 0.05, M.conc, 0x8a969b);
    this.p1 = pumpY(5.7, 0.5, 0.3); this.p2 = pumpY(6.5, 0.5, 0.3);
    cyl([7.4, 0.5, 0.08], [7.4, 0.5, 0.62], 0.2, M.pump, 24); this.ptw = level(7.25, 7.55, 0.42, 0.58, 0.1, M.water);
    box(8.2, 8.4, 1.2, 1.8, 0.8, 1.6, M.cab, 0x666666);                                   // ตู้ PCP ติดผนังอาคาร
    cyl([7.75, 0.5, 0.85], [7.75, 0.5, 1.05], 0.03, M.dark); sph([7.75, 0.5, 1.08], 0.05, M.white);   // สวิตช์แรงดัน
    // อาคาร
    box(8.4, 14.5, -1.0, 3.0, -0.15, 0.0, M.floor); box(8.4, 8.55, -1.0, 3.0, 0, 3.0, M.wall); box(8.4, 14.5, 2.9, 3.0, 0, 3.0, M.wall);
    box(8.4, 14.5, -1.0, 3.0, 3.0, 3.06, M.wall);
    box(10.2, 10.8, 2.3, 2.8, 0.8, 0.9, M.frp); box(12.25, 12.75, 2.2, 2.8, 0, 0.42, M.frp); box(12.3, 12.7, 2.65, 2.85, 0.42, 0.85, M.frp);
    // ท่อ (แต่ละเส้นใช้แนวของตัวเองไม่ทับกัน)
    this.pCity = pipe('ประปาเทศบาล', [[-4.4, 0, -0.35], [0.75, 0, -0.35], [0.75, 0, -0.82]], 0.035, COL.clean, COL.cleanP);
    this.pSuc = pipe('ท่อดูด', [[3.4, 0.15, -1.92], [3.4, 0.15, 0.3], [6.5, 0.15, 0.3]], 0.045, COL.clean, COL.cleanP);
    this.pS1 = pipe('ท่อดูดเข้าปั๊ม 1', [[5.7, 0.15, 0.3], [5.7, 0.42, 0.3]], 0.04, COL.clean, COL.cleanP);
    this.pS2 = pipe('ท่อดูดเข้าปั๊ม 2', [[6.5, 0.15, 0.3], [6.5, 0.42, 0.3]], 0.04, COL.clean, COL.cleanP);
    this.pD1 = pipe('ท่อส่งปั๊ม 1', [[5.7, 0.5, 0.51], [5.7, 0.5, 0.85]], 0.035, COL.clean, COL.cleanP);
    this.pD2 = pipe('ท่อส่งปั๊ม 2', [[6.5, 0.5, 0.51], [6.5, 0.5, 0.85]], 0.035, COL.clean, COL.cleanP);
    this.pHdr = pipe('ท่อส่งรวม', [[5.7, 0.5, 0.85], [8.75, 0.5, 0.85], [8.75, 0.5, 2.8], [12.5, 0.5, 2.8]], 0.035, COL.clean, COL.cleanP);
    this.pPT = pipe('ท่อถังแรงดัน', [[7.4, 0.5, 0.85], [7.4, 0.5, 0.63]], 0.03, COL.clean, COL.cleanP);
    this.pB1 = pipe('ท่อลงอ่างล้างมือ', [[10.5, 0.5, 2.8], [10.5, 2.55, 2.8], [10.5, 2.55, 0.95]], 0.022, COL.clean, COL.cleanP);
    this.pB2 = pipe('ท่อลงโถส้วม', [[12.5, 0.5, 2.8], [12.5, 2.75, 2.8], [12.5, 2.75, 0.9]], 0.022, COL.clean, COL.cleanP);
    label('city', [-2.2, 0, -0.35], 'ประปาเทศบาล', () => (!this.city ? 'หยุดจ่าย' : this.qc > 0.5 ? 'กำลังเติม ' + this.qc.toFixed(0) + ' ล./นาที' : 'ลูกลอยปิด'), 'ul', 60, 20);
    label('fv', [1.25, 0, -0.9], 'ลูกลอยเติมน้ำ', 'ปิดเองเมื่อถังเต็ม', 'ur', 70, 18);
    label('tk', [2.2, -0.7, -1.4], 'ถังเก็บน้ำใต้ดิน 6,000 ล.', () => 'น้ำในถัง ' + Math.round(this.V).toLocaleString() + ' ล.', 'dl', 70, 20);
    label('fs', [3.55, -0.12, -1.75], 'ลูกลอยไฟฟ้าตัดปั๊ม', 'ระดับตัด -1.75', 'dr', 64, 18);
    label('pump', [6.1, 0.5, 0.55], 'ปั๊มหอยโข่ง 1.1 kW 1+1', () => (this.lock ? 'ตัดที่น้ำต่ำ' : this.run ? 'ปั๊ม ' + (this.cur + 1) + ' เดิน 131 ล./นาที' : 'หยุด รอแรงดันลดถึง 1.9 บาร์'), 'ul', 90, 20);
    label('pcp', [8.3, 1.5, 1.6], 'ตู้ควบคุม PCP', 'สวิตช์แรงดัน 1.9 / 2.1 บาร์', 'ur', 70, 20);
    label('pt', [7.4, 0.5, 0.62], 'ถังแรงดัน 50 ล. ตั้งลม 1.7 บาร์', () => 'น้ำในถัง ' + this.Vp.toFixed(1) + ' ล. · ' + this.p.toFixed(2) + ' บาร์', 'ur', 130, 20);
    label('bld', [12.5, 2.75, 0.9], 'สุขภัณฑ์ในอาคาร', () => (this.ok ? 'ใช้น้ำ ' + this.dem.toFixed(0) + ' ล./นาที' : 'ไม่มีน้ำ'), 'ur', 50, 18);
  },
  reset() { this.V = 3000; this.Vp = 5; this.run = false; this.cur = 0; this.lead = 0; this.f1 = false; this.city = true; this.mode = 'normal'; this.lock = false; this.p = 1.98; this.qc = 0; this.dem = 0; this.ok = true; this.starts = 0; this.warnC = false; this.sph = 0; },
  scen: [
    ['normal', 'ใช้น้ำปกติ', (s) => { s.mode = 'normal'; return 'กลับมาใช้น้ำปกติ'; }],
    ['peak', 'ช่วงใช้น้ำมาก', (s) => { s.mode = 'peak'; return 'ช่วงใช้น้ำมาก ปั๊มเดินถี่ขึ้น'; }],
    ['city', 'ประปาหยุดจ่าย', (s) => { s.city = !s.city; return s.city ? 'ประปาเทศบาลกลับมาจ่าย' : 'ประปาเทศบาลหยุดจ่าย อาคารใช้น้ำสำรองในถัง'; }, (s) => !s.city],
    ['f1', 'ปั๊ม 1 ขัดข้อง', (s) => { s.f1 = !s.f1; if (s.f1 && s.run && s.cur === 0) { s.cur = 1; return 'ปั๊ม 1 ขัดข้องขณะเดิน ตู้ PCP ตัดปั๊ม 1 และสั่งปั๊ม 2 เดินแทนทันที'; } return s.f1 ? 'ปั๊ม 1 ขัดข้อง ระบบใช้ปั๊ม 2 แทน' : 'ปั๊ม 1 กลับมาใช้งาน'; }, (s) => s.f1]
  ],
  step(dt, t, log) {
    const A = this.A, z = -2.05 + this.V / (A * 1000);
    this.dem = this.mode === 'peak' ? 42 + 10 * Math.sin(t / 13) : 9 + 7 * Math.sin(t / 37) + (Math.sin(t / 5.3) > 0.6 ? 10 : 0);
    const open = this.city ? clamp((5950 - this.V) / 450, 0, 1) : 0; this.qc = 40 * open;
    if (!this.lock && z < -1.75) { this.lock = true; this.run = false; log('น้ำในถังต่ำกว่า -1.75 ลูกลอยไฟฟ้าตัดปั๊มกันปั๊มเดินตัวเปล่า', 'bad'); }
    if (this.lock && z > -1.6) { this.lock = false; log('น้ำในถังกลับถึงระดับใช้งาน ปั๊มพร้อมเดิน', 'ok'); }
    const pr = (v) => (v < 0.3 ? 1.7 * v / 0.3 : 2.713 / (1 - v / 50) - 1.013);   // กฎของบอยล์ ตั้งลม 1.7 บาร์
    this.p = pr(this.Vp);
    if (!this.run && !this.lock && this.p <= 1.9) {
      let c = this.lead; if (c === 0 && this.f1) c = 1;
      this.cur = c; this.run = true; this.starts++; this.lead = 1 - this.lead;
      log('แรงดันลดถึง 1.9 บาร์ ปั๊ม ' + (c + 1) + ' เริ่มเดิน' + (this.f1 && c === 1 ? ' (ปั๊ม 1 ขัดข้อง)' : ''), '');
    }
    if (this.run && this.p >= 2.1) { this.run = false; log('แรงดันถึง 2.1 บาร์ ปั๊ม ' + (this.cur + 1) + ' หยุด', ''); }
    if (this.run && this.lock) this.run = false;
    const Q = this.run ? 131 : 0;
    const use = this.Vp > 0.05 || Q > 0 ? this.dem : 0; this.ok = use > 0;
    if (!this.warnC && t > 900 && this.sph > 30) { this.warnC = true; log('ปั๊มออกตัวเกิน 30 ครั้ง/ชม. ถังแรงดัน 50 ล. กับช่วงสวิตช์ 0.2 บาร์เก็บน้ำได้ราว 3 ล. ต่อรอบ', 'warn'); }
    this.Vp = clamp(this.Vp + (Q - use) * dt / 60, 0, 6.6);
    this.sph = this.starts / Math.max(t / 3600, 0.25);
    this.V = clamp(this.V + (this.qc - Q) * dt / 60, 0, 6000);
    const zn = -2.05 + this.V / (A * 1000);
    this.w.set(zn); this.ptw.set(0.1 + 0.5 * this.Vp / 6.6);
    this.ball.position.copy(V(1.25, 0, Math.max(zn, -1.45))); this.arm.visible = true;
    const a = V(0.75, 0, -0.82), b = this.ball.position, d = b.clone().sub(a); this.arm.position.copy(a.clone().add(b).multiplyScalar(0.5));
    this.arm.scale.y = d.length() / 0.5; this.arm.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    this.fs.position.copy(V(3.55, -0.12, Math.max(zn, -1.95))); this.fs.material.color.setHex(this.lock ? 0xe0412c : 0xf0b030);
    this.p1.set(this.run && this.cur === 0, this.f1); this.p2.set(this.run && this.cur === 1, false);
    const qn = Q / 131;
    this.pCity.q = this.qc / 40; this.pSuc.q = qn; this.pS1.q = this.run && this.cur === 0 ? qn : 0; this.pS2.q = this.run && this.cur === 1 ? qn : 0;
    this.pD1.q = this.pS1.q; this.pD2.q = this.pS2.q; this.pHdr.q = use / 60; this.pPT.q = this.Vp >= 6.6 || this.Vp <= 0 ? 0 : (Q - use) / 131;
    this.pB1.q = use / 120; this.pB2.q = use / 120;
  },
  stats() {
    const z = -2.05 + this.V / (this.A * 1000);
    return [['น้ำในถัง', Math.round(this.V).toLocaleString() + ' ล.', z < -1.75 ? 'bad' : ''], ['ระดับน้ำ', z.toFixed(2) + ' ม.', ''],
      ['แรงดันถังแรงดัน', this.p.toFixed(2) + ' บาร์', this.p < 1.5 ? 'bad' : ''], ['ปั๊ม', this.lock ? 'ตัดที่น้ำต่ำ' : this.run ? 'ปั๊ม ' + (this.cur + 1) + ' เดิน' : 'หยุด', this.lock ? 'bad' : this.run ? 'ok' : ''],
      ['ประปาเติม', this.qc.toFixed(0) + ' ล./นาที', this.city ? '' : 'warn'], ['อาคารใช้น้ำ', this.ok ? this.dem.toFixed(0) + ' ล./นาที' : 'ไม่มีน้ำ', this.ok ? '' : 'bad'],
      ['ปั๊มออกตัว', this.starts + ' ครั้ง · ' + Math.round(this.sph || 0) + ' ครั้ง/ชม.', (this.sph || 0) > 30 ? 'warn' : '']];
  },
  recSpeed: 40, recSec: 44, recInit() { this.V = 2000; }, rec: [[0, 'normal'], [6, 'peak'], [14, 'city'], [40, 'f1']]
};

// ===== 2) ระบบสระวารีบำบัด =====
SC.pool = {
  name: 'ระบบสระวารีบำบัด', cam: [[7.5, -13.5, 6.5], [7.6, 2.4, -0.6]],
  intro: 'น้ำล้นรางรอบสระและช่องดูดก้นสระไหลลงถังพัก BT ปั๊มดูดจาก BT ส่งผ่านถังกรองทราย ยูวี และฮีตปั๊ม แล้วคืนเข้าสระทางหัวจ่ายพื้น 98 ลบ.ม./ชม. ครบรอบ 1.5 ชม. ถังพักรับน้ำที่คนลงสระแทนที่ และเติมน้ำประปาเมื่อระดับต่ำ',
  build() {
    const D = 6.0;
    box(-1.2, 17.2, -0.4, D + 0.3, -3.0, -0.17, M.soil);
    // สระ น้ำลึก 1.55 ม. (ผิวกระเบื้องพื้น -1.57 ผิวน้ำ -0.02)
    box(-0.3, 7.3, 0, D, -1.90, -1.57, M.conc, 0x8a969b); box(-0.3, 0, 0, D, -1.57, -0.12, M.concT); box(7.0, 7.3, 0, D, -1.57, -0.12, M.concT);
    box(-0.3, 7.3, D, D + 0.3, -1.9, -0.12, M.concT);
    this.pw = level(0.02, 6.98, 0.02, D - 0.02, -1.57, M.poolW);
    box(7.3, 7.6, 0, D, -0.45, -0.12, M.concT, 0x8a969b); this.gw = level(7.32, 7.58, 0.02, D - 0.02, -0.43, M.poolW);   // รางน้ำล้น
    for (const xp of [0.6, 2.3, 4.0, 5.7]) box(xp - 0.11, xp + 0.11, 0.3, 0.52, -3.0, -1.9, M.concT);
    box(-1.2, -0.3, 0, D, -0.15, 0, M.floor); box(7.6, 8.7, 0, D, -0.15, 0, M.floor);
    for (const xi of [1.2, 2.9, 4.6]) cyl([xi, 2.0, -1.57], [xi, 2.0, -1.53], 0.07, M.frp);
    for (const xm of [2.3, 5.6]) box(xm - 0.2, xm + 0.2, 0.8, 1.2, -1.57, -1.54, M.dark);
    // ถังพัก BT ภายใน 2.40 × 2.40 ก้น -2.30 ผนังร่วม 0.20 ห้องใต้ดินปั๊ม 4.50 × 2.70
    box(8.7, 16.3, 0, 3.2, -2.70, -2.30, M.conc, 0x8a969b);
    box(8.7, 8.95, 0, 3.2, -2.3, 0, M.concT); box(8.95, 11.35, 2.65, 2.9, -2.3, 0, M.concT);
    box(11.35, 11.55, 0, 3.2, -2.3, 0, M.concT, 0x8a969b);
    this.btm = level(8.97, 11.33, 0.27, 2.63, -2.28, M.poolW);
    box(16.05, 16.3, 0, 3.2, -2.3, 0, M.concT); box(11.55, 16.05, 2.95, 3.2, -2.3, 0, M.concT);
    box(8.7, 17.2, 0, D, 0.0, 0.2, M.concT, 0x8a969b);
    box(8.55, 8.7, 0, D, 0.2, 3.4, M.wall); box(8.7, 17.2, D - 0.1, D, 0.2, 3.4, M.wall);
    this.P1 = pumpY(13.55, 1.5, -1.97); this.P2 = pumpY(14.65, 1.5, -1.97);
    box(12.15, 12.55, 0.8, 1.2, -1.85, -1.53, M.steel, 0x555555);                                  // ตะแกรงดักผม
    for (let k = 0; k < 8; k++) cyl([11.9, 2.2, -2.3 + k * 0.3], [11.9, 2.6, -2.3 + k * 0.3], 0.015, M.steel);   // บันไดลง
    // ถังกรอง ยูวี ฮีตปั๊ม ชุดเคมี MCC
    this.F = [];
    for (const xf of [9.9, 11.8]) {
      cyl([xf, 2.6, 0.45], [xf, 2.6, 1.65], 0.8, M.tankG, 40, true);
      const s1 = sph([xf, 2.6, 1.65], 0.8, M.tankG); s1.scale.y = 0.45; const s2 = sph([xf, 2.6, 0.45], 0.8, M.tankG); s2.scale.y = 0.3;
      const sand = level(xf - 0.55, xf + 0.55, 2.2, 3.0, 0.3, new T.MeshStandardMaterial({ color: 0xd8c08a, roughness: 1 })); sand.set(1.1);
      this.F.push(sand);
    }
    for (const xv of [9.5, 10.3, 11.4, 12.2]) box(xv - 0.06, xv + 0.06, 1.44, 1.56, 1.2, 1.5, M.red);   // ชุดวาล์ว 5 ตัว
    cyl([12.7, 1.2, 0.55], [13.4, 1.2, 0.55], 0.12, M.steel); box(12.85, 13.25, 1.62, 1.9, 0.7, 1.15, M.cab, 0x666666);
    this.uvl = new T.PointLight(0x9c7bff, 0, 1.8); this.uvl.position.copy(V(13.05, 1.2, 0.75)); add(this.uvl);
    for (const yy of [2.3, 3.9]) { box(13.9, 14.6, yy, yy + 1.2, 0.22, 1.45, M.cab, 0x666666); cyl([14.25, yy + 0.6, 1.45], [14.25, yy + 0.6, 1.48], 0.4, M.dark); }
    box(14.17, 14.33, 1.12, 1.28, 0.47, 0.63, M.red);                                               // วาล์วปรับสมดุล
    box(12.5, 13.1, D - 0.3, D - 0.12, 1.1, 1.7, M.cab, 0x666666); box(12.0, 12.35, D - 0.65, D - 0.3, 0.22, 0.8, M.white);
    box(15.6, 16.4, D - 0.5, D - 0.12, 0.22, 2.2, M.cab, 0x666666);
    box(7.7, 8.3, 3.6, 4.2, -1.2, -0.01, M.concT, 0x8a969b); box(7.68, 8.32, 3.58, 4.22, -0.01, 0.02, M.dark);   // บ่อพัก CB4 เปิดพื้น ฝาตะแกรงระดับพื้น
    this.ppl = []; for (let i = 0; i < 10; i++) { const p = person(0.8 + (i % 5) * 1.3, 1.2 + Math.floor(i / 5) * 2.3, -1.57); p.visible = false; this.ppl.push(p); }
    // ท่อ แต่ละระบบใช้แนวลึก (y) และระดับของตัวเอง
    this.pGut = pipe('น้ำล้นราง→BT', [[7.45, 0.5, -0.45], [7.45, 0.5, -0.55], [9.1, 0.5, -0.55]], 0.07, COL.pool, COL.poolP);
    this.pMD = pipe('ช่องดูดก้นสระ→BT', [[2.3, 1.0, -1.57], [2.3, 1.0, -1.74], [9.1, 1.0, -1.74]], 0.07, COL.pool, COL.poolP);
    this.pMD2 = pipe('ช่องดูดก้นสระ 2', [[5.6, 1.0, -1.57], [5.6, 1.0, -1.74]], 0.06, COL.pool, COL.poolP);
    this.pSuc = pipe('ท่อดูด BT→ปั๊ม ø200', [[10.8, 1.0, -2.14], [10.8, 1.0, -1.69], [14.65, 1.0, -1.69]], 0.10, COL.pool, COL.poolP);
    this.pS1 = pipe('ท่อดูดลงปั๊ม P-1', [[13.55, 1.0, -1.69], [13.55, 1.0, -1.97], [13.55, 1.38, -1.97]], 0.08, COL.pool, COL.poolP);
    this.pS2 = pipe('ท่อดูดลงปั๊ม P-2', [[14.65, 1.0, -1.69], [14.65, 1.0, -1.97], [14.65, 1.38, -1.97]], 0.08, COL.pool, COL.poolP);
    this.pD1 = pipe('ท่อส่งปั๊ม P-1', [[13.55, 1.5, -1.75], [13.55, 1.5, -1.2]], 0.07, COL.pool, COL.poolP);
    this.pD2 = pipe('ท่อส่งปั๊ม P-2', [[14.65, 1.5, -1.75], [14.65, 1.5, -1.2]], 0.07, COL.pool, COL.poolP);
    this.pRise = pipe('ท่อเมน ø160 ขึ้นห้องเครื่อง', [[13.55, 1.5, -1.2], [15.7, 1.5, -1.2], [15.7, 1.5, 1.35], [9.9, 1.5, 1.35]], 0.08, COL.pool, COL.poolP);
    this.pFi = [pipe('น้ำเข้าบนถังกรอง F-1', [[9.9, 1.5, 1.35], [9.9, 1.82, 1.35]], 0.06, COL.pool, COL.poolP), pipe('น้ำเข้าบนถังกรอง F-2', [[11.8, 1.5, 1.35], [11.8, 1.82, 1.35]], 0.06, COL.pool, COL.poolP)];
    this.pFo = [pipe('น้ำออกล่างถังกรอง F-1', [[9.9, 1.82, 0.55], [9.9, 1.2, 0.55]], 0.06, COL.ret, COL.retP), pipe('น้ำออกล่างถังกรอง F-2', [[11.8, 1.82, 0.55], [11.8, 1.2, 0.55]], 0.06, COL.ret, COL.retP)];
    this.pVN = pipe('ชุดวาล์วสลับทางล้างย้อน', [[10.85, 1.5, 1.35], [10.85, 1.5, 0.85], [10.85, 1.2, 0.85], [10.85, 1.2, 0.55]], 0.06, COL.pool, COL.poolP);
    this.pC1 = pipe('น้ำกรองแล้ว F-1', [[9.9, 1.2, 0.55], [10.85, 1.2, 0.55]], 0.08, COL.ret, COL.retP);
    this.pC2 = pipe('น้ำกรองแล้ว→ยูวี→ฮีตปั๊ม', [[10.85, 1.2, 0.55], [15.2, 1.2, 0.55], [15.2, 0.6, 0.55]], 0.08, COL.ret, COL.retP);
    this.pHs = pipe('ท่อแยกเข้าฮีตปั๊ม', [[13.75, 1.2, 0.55], [13.75, 4.5, 0.55], [13.9, 4.5, 0.55]], 0.04, COL.heat, COL.heatP);
    this.pHs1 = pipe('ท่อเข้าฮีตปั๊ม HP-1', [[13.75, 2.9, 0.55], [13.9, 2.9, 0.55]], 0.04, COL.heat, COL.heatP);
    this.pHr = pipe('ท่อกลับจากฮีตปั๊ม', [[14.6, 4.5, 1.1], [14.75, 4.5, 1.1], [14.75, 1.2, 1.1], [14.75, 1.2, 0.55]], 0.04, COL.heat, COL.heatP);
    this.pHr1 = pipe('ท่อออกฮีตปั๊ม HP-1', [[14.6, 2.9, 1.1], [14.75, 2.9, 1.1]], 0.04, COL.heat, COL.heatP);
    this.pRet = pipe('ท่อคืนน้ำเข้าสระ ø160', [[15.2, 0.6, 0.55], [8.1, 0.6, 0.55], [8.1, 2.0, 0.55], [8.1, 2.0, -1.78], [1.2, 2.0, -1.78]], 0.08, COL.ret, COL.retP);
    this.pRI = [1.2, 2.9, 4.6].map((x, i) => pipe('หัวจ่ายพื้น ' + (i + 1), [[x, 2.0, -1.78], [x, 2.0, -1.57]], 0.04, COL.ret, COL.retP));
    this.pBW = pipe('ท่อล้างย้อน→บ่อพัก CB4', [[9.9, 3.42, 1.5], [9.9, 3.9, 1.5], [8.0, 3.9, 1.5], [8.0, 3.9, 0.27]], 0.07, COL.drain, COL.drainP);
    this.pCB = pipe('ท่อออกบ่อพัก CB4 ø150', [[8.0, 4.2, -1.0], [8.0, 6.2, -1.05]], 0.075, COL.drain, COL.drainP);
    this.pBW2 = pipe('ท่อล้างย้อน F-2', [[11.8, 3.42, 1.5], [11.8, 3.9, 1.5], [9.9, 3.9, 1.5]], 0.07, COL.drain, COL.drainP);
    this.pMU = pipe('น้ำประปาเติม BT', [[17.2, 5.4, 2.0], [9.02, 5.4, 2.0], [9.02, 2.4, 2.0], [9.02, 2.4, -0.5]], 0.03, COL.clean, COL.cleanP);
    this.pCh = pipe('ท่อเติมคลอรีน', [[12.8, 5.7, 1.1], [12.8, 5.2, 1.1], [15.0, 5.2, 1.1], [15.0, 1.2, 1.1], [15.0, 1.2, 0.63]], 0.015, COL.chem, COL.chemP);
    label('pump', [14.1, 1.5, -2.2], 'ปั๊ม P-1 / P-2 7.5 kW (1+1)', () => (this.run ? 'P-' + (this.cur + 1) + ' ' + this.Q.toFixed(0) + ' ลบ.ม./ชม. · VSD ' + Math.min(50, Math.round(50 * this.Q / 98)) + ' Hz' : 'หยุด'), 'dr', 60, 20);
    label('cb4', [8.0, 3.9, -0.1], 'บ่อพัก CB4', 'ปลายท่อเหนือฝาตะแกรง', 'dl', 50, 20);
    label('pool', [3.0, 0, -0.6], 'สระวารีบำบัด 146 ลบ.ม. ลึก 1.55 ม.', () => 'น้ำ ' + this.T.toFixed(1) + ' °C · คนในสระ ' + this.n, 'ul', 60, 30);
    label('gut', [7.45, 0, -0.3], 'รางน้ำล้น', () => this.qg.toFixed(0) + ' ลบ.ม./ชม.', 'ul', 120, 20);
    label('md', [2.3, 0.8, -1.57], 'ช่องดูดก้นสระ 2 จุด', () => this.qmd.toFixed(0) + ' ลบ.ม./ชม.', 'dl', 70, 20);
    label('bt', [10.15, 0.25, -1.6], 'ถังพัก BT 2.40 × 2.40 ม.', () => 'ระดับ ' + this.zb.toFixed(2) + ' ม. · ' + this.Vb.toFixed(1) + ' ลบ.ม.', 'dl', 120, 20);
    label('flt', [9.9, 2.6, 2.05], 'ถังกรองทราย F-1 F-2', () => (this.bw ? 'ล้างย้อนถัง F-1' : 'ความดันตก ' + this.dp.toFixed(2) + ' บาร์'), 'ul', 50, 20);
    label('uv', [13.05, 1.2, 0.55], 'ยูวีฆ่าเชื้อ', () => (this.uvOn ? 'ทำงาน' : 'หยุดตามปั๊ม'), 'dr', 150, 20);
    label('hp', [14.25, 3.9, 1.45], 'ฮีตปั๊ม 2 × 21 kW (ความร้อน)', () => (this.hpRun ? 'ทำความร้อน · น้ำผ่าน 18 ลบ.ม./ชม.' : this.hp ? 'รอปั๊มหมุนเวียน' : 'พัก อุณหภูมิถึงค่า'), 'ur', 50, 20);
    label('mcc', [16.0, D - 0.5, 2.2], 'ตู้ MCC-PL', 'สลับปั๊มนำตามชั่วโมงทำงาน', 'ur', 30, 14);
    label('mu', [17.0, 5.4, 2.0], 'น้ำประปาเติม', () => (this.mu > 0 ? 'เปิด ' + this.mu + ' ลบ.ม./ชม.' : 'ปิด'), 'dr', 40, 14);
  },
  reset() {
    this.Vb = 5.8; this.h = 3.4; this.run = true; this.cur = 0; this.f1 = false; this.Q = 98; this.n = 0; this.tn = 0; this.T = 33.2; this.hp = false;
    this.dp = 0.35; this.bw = 0; this.ph = ''; this.lead = 0; this.hrs = 0; this.lsh = false; this.uvOn = true; this.hpRun = false; this.mu = 0; this.lock = false; this.qg = 68; this.qmd = 30; this.tBW = 0; this.vsd = false; this.zb = -1.45;
  },
  scen: [
    ['in', 'คนลงสระ 10 คน', (s) => { s.tn = 10; return 'ผู้ใช้ 10 คนลงสระ น้ำถูกแทนที่ล้นรางลงถังพัก'; }],
    ['out', 'คนขึ้นจากสระ', (s) => { s.tn = 0; return 'ผู้ใช้ขึ้นจากสระ น้ำในสระลดลง ถังพักจ่ายน้ำคืน'; }],
    ['bw', 'ล้างย้อนถังกรอง', (s) => { if (s.ph) return 'กำลังล้างย้อนอยู่'; s.ph = 'fill'; return 'เริ่มล้างย้อน ขั้นที่ 1 เติมถังพักถึง HWL -0.70'; }, (s) => !!s.ph],
    ['f1', 'ปั๊ม P-1 ขัดข้อง', (s) => { s.f1 = !s.f1; return s.f1 ? 'P-1 ขัดข้อง ตู้ MCC-PL สั่ง P-2 รับงานแทนทันที' : 'P-1 กลับมาใช้งาน เป็นปั๊มสำรอง'; }, (s) => s.f1]
  ],
  step(dt, t, log) {
    const Ab = 5.76, Ap = 94.2;
    // จำนวนคนค่อย ๆ ลง/ขึ้น
    if (this.n !== this.tn) { this.acc = (this.acc || 0) + dt; if (this.acc > 3) { this.acc = 0; const dn = Math.sign(this.tn - this.n); this.n += dn; this.h += dn * 0.075 / Ap * 1000; } }
    // ขั้นตอนล้างย้อน
    const zb = -2.30 + this.Vb / Ab; this.zb = zb;
    if (this.ph === 'fill' && zb < -0.70 && !this.fillSkip) { const need = (-0.69 - zb) * Ab; this.fillSkip = true; this.Vb += need; log('เติมน้ำประปา 1" (4 ลบ.ม./ชม.) ' + need.toFixed(1) + ' ลบ.ม. ใช้เวลา ' + Math.round(need / 4 * 60) + ' นาที แบบจำลองข้ามช่วงนี้', ''); }
    if (this.ph !== 'fill') this.fillSkip = false;
    if (this.ph === 'fill' && this.Vb / Ab - 2.30 >= -0.70) { this.ph = 'bw'; this.tBW = 0; log('BT ถึง HWL ขั้นที่ 2 ล้างย้อนถัง F-1 100 ลบ.ม./ชม. 4 นาที ทิ้งลงบ่อพัก CB4', 'warn'); }
    if (this.ph === 'bw') { this.tBW += dt; if (this.tBW > 240) { this.ph = 'rec'; this.dp = 0.32; log('ล้างย้อนเสร็จ ขั้นที่ 3 VSD ลดอัตราไหลจนน้ำในสระคืนระดับ', 'ok'); } }
    if (this.ph === 'rec' && this.h >= 2.5) { this.ph = ''; log('น้ำในสระคืนระดับขอบราง กลับเดินกรองปกติ 98 ลบ.ม./ชม.', 'ok'); }
    this.bw = this.ph === 'bw';
    // ปั๊ม
    if (!this.lock && zb < -1.65) { this.lock = true; log('BT ต่ำกว่า LWL -1.65 หยุดปั๊มกันดูดอากาศ', 'bad'); }
    if (this.lock && zb > -1.50) { this.lock = false; log('BT กลับเหนือ -1.50 ปั๊มเดินต่อ', 'ok'); }
    this.run = !this.lock;
    this.hrs = (this.hrs || 0) + dt;
    if (this.hrs > 4 * 3600 && !this.f1) { this.hrs = 0; this.lead = 1 - (this.lead || 0); log('ครบ 4 ชม. ตู้ MCC-PL สลับปั๊มนำเป็น P-' + (this.lead + 1), ''); }
    this.cur = this.f1 ? 1 : (this.lead || 0);
    this.Q = !this.run ? 0 : this.bw ? 100 : this.ph === 'rec' ? (zb > -1.45 ? 70 : 40) : 98;
    const Qr = this.bw ? 0 : this.Q;
    this.qmd = this.bw ? 49 : 0.3 * this.Q;
    this.qg = Math.max(0, 20 * this.h);
    // น้ำเติม
    const fillTo = this.ph === 'fill' ? -0.68 : -1.30;
    if (this.mu === 0 && (zb < -1.40 || this.ph === 'fill' || this.ph === 'rec')) { this.mu = 4; if (!this.ph) log('BT ต่ำกว่า LSM -1.40 เปิดน้ำประปาเติม', ''); }
    if (this.mu > 0 && zb > fillTo && this.ph !== 'rec' && this.ph !== 'fill') { this.mu = 0; log('BT ถึง ' + zb.toFixed(2) + ' ปิดน้ำเติม', ''); }
    if (!this.lsh && zb > -0.65) { this.lsh = true; this.mu = 0; log('BT ถึง LSH -0.65 แจ้งเตือนระดับสูง ปิดน้ำเติม น้ำส่วนเกินออกท่อน้ำล้น -0.62', 'warn'); }
    if (this.lsh && zb < -0.75) this.lsh = false;
    // สมดุลน้ำ
    this.h += (Qr - this.qg - this.qmd - 0.05) / 3600 * dt / Ap * 1000;
    this.Vb = clamp(this.Vb + (this.qg + this.qmd + this.mu - this.Q) / 3600 * dt, 0.3, 9.68);
    // ความร้อน
    if (!this.hp && this.T < 33.0) { this.hp = true; log('น้ำต่ำกว่า 33.0 °C ฮีตปั๊มเริ่มทำงาน', ''); }
    if (this.hp && this.T >= 33.5) { this.hp = false; log('น้ำถึง 33.5 °C ฮีตปั๊มพัก', ''); }
    this.T += ((this.hp && this.run && !this.bw ? 42 : 0) - 15 - this.n * 0.4) * dt / (146000 * 4.186);
    if (!this.bw) this.dp = Math.min(0.9, this.dp + dt * 0.00002 * (1 + this.n));
    // ภาพ
    this.pw.set(-0.02 + Math.min(this.h, 6) / 1000 + (this.n ? 0.012 * Math.sin(t * 3) : 0));
    this.gw.set(-0.43 + clamp(this.qg / 160, 0.02, 0.25));
    if (this.bw) this.F[0].material.color.setHex((Math.floor(t * 4) % 2) ? 0xc4aa74 : 0xd8c08a); else this.F[0].material.color.setHex(0xd8c08a);
    this.btm.set(-2.30 + this.Vb / Ab);
    this.ppl.forEach((p, i) => { p.visible = i < this.n; });
    this.P1.set(this.run && this.cur === 0, this.f1); this.P2.set(this.run && this.cur === 1, false);
    this.uvOn = this.run && !this.bw; this.uvl.intensity = this.uvOn ? 2.2 : 0;
    const q = this.Q / 98;
    this.pGut.q = this.qg / 98; this.pMD.q = this.qmd / 98; this.pMD2.q = this.qmd / 196; this.pSuc.q = q;
    this.pS1.q = this.run && this.cur === 0 ? q : 0; this.pS2.q = this.run && this.cur === 1 ? q : 0; this.pD1.q = this.pS1.q; this.pD2.q = this.pS2.q; this.pRise.q = q;
    if (this.bw) { this.pFi[0].q = 0; this.pFi[1].q = 0; this.pVN.q = q; this.pC1.q = -q; this.pFo[0].q = -q; this.pFo[1].q = 0; this.pC2.q = 0; this.pBW.q = q; this.pBW2.q = 0; this.pRet.q = 0; this.pCB.q = q; }
    else { this.pFi[0].q = q / 2; this.pFi[1].q = q / 2; this.pVN.q = 0; this.pFo[0].q = q / 2; this.pFo[1].q = q / 2; this.pC1.q = q / 2; this.pC2.q = q; this.pBW.q = 0; this.pBW2.q = 0; this.pRet.q = q; this.pCB.q = 0; }
    this.pRI.forEach((p) => { p.q = this.pRet.q / 3; });
    this.hpRun = this.hp && this.run && !this.bw;
    this.pHs.q = this.hpRun ? 0.18 : 0; this.pHs1.q = this.pHs.q / 2; this.pHr.q = this.pHs.q; this.pHr1.q = this.pHs1.q; this.pMU.q = this.mu / 15; this.pCh.q = this.uvOn ? 0.3 : 0;
  },
  stats() {
    return [['อัตราไหลปั๊ม', this.Q.toFixed(0) + ' ลบ.ม./ชม.', this.run ? 'ok' : 'bad'], ['ปั๊มที่เดิน', this.run ? 'P-' + (this.cur + 1) : 'หยุด', this.f1 ? 'warn' : ''],
      ['ระดับ BT', this.zb.toFixed(2) + ' ม.', this.zb < -1.65 || this.zb > -0.65 ? 'bad' : this.zb < -1.40 ? 'warn' : ''], ['น้ำใน BT', this.Vb.toFixed(1) + ' ลบ.ม.', ''],
      ['น้ำล้นราง', this.qg.toFixed(0) + ' ลบ.ม./ชม.', ''], ['อุณหภูมิสระ', this.T.toFixed(2) + ' °C', ''],
      ['ความดันตกถังกรอง', this.dp.toFixed(2) + ' บาร์', this.dp > 0.7 ? 'warn' : ''], ['ขั้นตอน', { fill: 'เติม BT', bw: 'ล้างย้อน F-1', rec: 'คืนระดับ', '': 'กรองปกติ' }[this.ph], this.ph ? 'warn' : 'ok']];
  },
  recSpeed: 60, recSec: 52, recZoom: 0.74, rec: [[0, ''], [4, 'in'], [13, 'out'], [21, 'bw']]
};

// ===== 3) น้ำเสียและถังบำบัด อาคารกายภาพบำบัด =====
SC.san = {
  name: 'น้ำเสียและถังบำบัด', cam: [[6.6, -10.5, 4.8], [6.4, 0.9, -0.4]],
  intro: 'น้ำเสียจากโถส้วมและอ่างล้างมือไหลตามความลาดท่อ 1:100 ผ่านบ่อพัก เข้าถังบำบัด 3 ห้อง ห้องแรกตกตะกอน ห้องกลางเติมอากาศให้จุลินทรีย์ย่อย ห้องท้ายตกตะกอนรอบสอง น้ำที่ผ่านการบำบัดออกบ่อพักลงท่อสาธารณะ น้ำฝนจากหลังคาไม่ผ่านถังบำบัด',
  build() {
    const ZG = -0.10, x0 = 5.5, L = 2.97, zt = -0.40, zb = zt - 1.35; this.g = { x0, L, zt, zb };
    ground(3.0, 15, -0.9, 2.2, -2.6, ZG);
    box(-1.0, 3.0, -0.9, 3.0, -0.15, 0, M.floor); box(2.85, 3.0, -0.9, 3.0, 0, 3.1, M.wall); box(-1.0, 3.6, -0.9, 3.0, 3.1, 3.2, M.roof);
    box(-1.0, 2.85, 2.9, 3.0, 0, 3.1, M.wall); box(2.75, 3.0, -0.9, 3.0, -0.75, -0.15, M.concT, 0x8a969b);
    box(0.25, 0.7, 1.0, 1.4, 0, 0.42, M.frp); box(0.3, 0.65, 1.38, 1.55, 0.42, 0.85, M.frp); box(1.4, 1.95, 2.4, 2.85, 0.8, 0.9, M.frp);
    // บ่อพัก MH
    box(3.9, 4.6, -0.35, 0.35, -1.4, ZG, M.concT, 0x8a969b); this.mhw = level(4.0, 4.5, -0.25, 0.25, -1.38, M.waste); this.mhw.set(-0.95);
    // ถังบำบัด 3 ห้อง
    box(x0 - 0.3, x0 + L + 0.3, -0.9, 0.9, zb - 0.4, zb - 0.1, M.conc, 0x8a969b);
    box(x0, x0 + L, -0.6, 0.6, zb, zt, M.tank, 0x5a8aa0);
    for (const xp of [x0 + 0.95, x0 + 1.95]) box(xp, xp + 0.03, -0.58, 0.58, zb + 0.01, zt - 0.1, M.tank, 0x5a8aa0);   // ผนังกั้นเต็มสูง น้ำผ่านท่อตัว T
    this.c1 = level(x0 + 0.02, x0 + 0.95, -0.58, 0.58, zb + 0.02, M.waste); this.c1.set(-0.835);
    this.c2 = level(x0 + 0.98, x0 + 1.95, -0.58, 0.58, zb + 0.02, M.waste); this.c2.set(-0.835);
    this.c3 = level(x0 + 1.98, x0 + L - 0.02, -0.58, 0.58, zb + 0.02, M.eff); this.c3.set(-0.835);
    this.sl = level(x0 + 0.05, x0 + 0.92, -0.55, 0.55, zb + 0.03, M.sludge);
    this.bub = bubbles(x0 + 1.05, x0 + 1.9, -0.45, 0.45, zb + 0.1, zt - 0.22, 90);
    for (const xn of [x0 + 0.5, x0 + 2.45]) { cyl([xn, 0, zt], [xn, 0, ZG + 0.04], 0.28, M.tank, 24, true); cyl([xn, 0, ZG + 0.04], [xn, 0, ZG + 0.08], 0.32, M.frp); }
    box(x0 + 1.2, x0 + 1.75, 1.0, 1.4, ZG + 0.1, ZG + 0.42, M.cab, 0x666666); box(x0 + 1.1, x0 + 1.85, 0.9, 1.5, ZG, ZG + 0.1, M.conc);
    box(x0 + 0.95, x0 + 2.0, 0.75, 1.65, ZG + 0.8, ZG + 0.84, M.roof); for (const [cx, cy] of [[x0 + 1.0, 0.8], [x0 + 1.95, 0.8], [x0 + 1.0, 1.6], [x0 + 1.95, 1.6]]) cyl([cx, cy, ZG], [cx, cy, ZG + 0.8], 0.02, M.steel);
    this.blwFan = new T.Group(); this.blwFan.position.copy(V(x0 + 1.47, 0.98, ZG + 0.26)); add(this.blwFan);
    for (let k = 0; k < 3; k++) { const b = new T.Mesh(new T.BoxGeometry(0.2, 0.04, 0.01), M.dark); b.rotation.z = k * Math.PI / 3; this.blwFan.add(b); }
    // บ่อพัก CB และท่อสาธารณะ
    for (const [xa, xb, zbot] of [[9.9, 10.5, -1.5], [12.0, 12.6, -1.8]]) box(xa, xb, -0.3, 0.9, zbot, ZG, M.concT, 0x8a969b);
    cyl([12.6, 0, -1.35], [15, 0, -1.4], 0.15, M.concT, 24, true);
    // ท่อ
    this.pWC = pipe('ท่อโถส้วม 4"', [[0.47, 1.2, 0.0], [0.47, 1.2, -0.42], [0.47, 0, -0.45], [1.0, 0, -0.5]], 0.055, COL.waste, COL.wasteP);
    this.pT = [x0 + 0.95, x0 + 1.95].map((xp, i) => pipe('ท่อตัว T ผ่านผนังกั้น ' + (i + 1), [[xp - 0.15, 0, -1.05], [xp + 0.18, 0, -1.05]], 0.045, i ? COL.eff : COL.waste, i ? COL.effP : COL.wasteP));
    this.pLV = pipe('ท่ออ่างล้างมือ 2"', [[1.67, 2.6, 0.8], [1.67, 2.6, -0.35], [1.67, 0.35, -0.38], [1.67, 0.35, -0.47], [1.67, 0.09, -0.505]], 0.03, COL.waste, COL.wasteP);
    this.pMain = pipe('ท่อเมนน้ำเสีย 6"', [[1.0, 0, -0.5], [4.25, 0, -0.533]], 0.083, COL.waste, COL.wasteP);
    this.pIn = pipe('บ่อพัก→ถังบำบัด', [[4.5, 0, -0.55], [x0 + 0.1, 0, -0.561]], 0.083, COL.waste, COL.wasteP);
    this.pOut = pipe('ถังบำบัด→บ่อพัก CB', [[x0 + L - 0.1, 0, -0.78], [10.0, 0, -0.82]], 0.055, COL.eff, COL.effP);
    this.pRing = pipe('ท่อระหว่างบ่อพัก', [[10.4, 0, -1.05], [12.1, 0, -1.2]], 0.083, COL.eff, COL.effP);
    this.pPub = pipe('ท่อระบายสาธารณะ', [[12.5, 0, -1.35], [15, 0, -1.4]], 0.12, COL.eff, COL.effP);
    this.pVent = pipe('ท่ออากาศ', [[0.75, 0, -0.475], [0.75, 0, 2.7], [2.6, 0, 2.7], [2.6, 0, 3.5]], 0.025, COL.air, COL.airP);
    this.pAir = pipe('ท่อลมเติมอากาศ', [[x0 + 1.45, 1.0, ZG + 0.26], [x0 + 1.45, 0.3, ZG + 0.26], [x0 + 1.45, 0.3, zb + 0.12], [x0 + 1.75, 0.3, zb + 0.12]], 0.018, COL.air, COL.airP);
    this.pRD = pipe('ท่อน้ำฝน', [[3.45, 0.95, 3.1], [3.45, 0.95, -0.3], [10.2, 0.95, -0.37], [10.2, 0.7, -0.7]], 0.05, COL.rain, COL.rainP);
    label('wc', [0.47, 1.2, 0.85], 'โถส้วม อ่างล้างมือ', () => this.lastSrc || 'รอการใช้งาน', 'ul', 50, 20);
    label('main', [2.2, 0, -0.52], 'ท่อน้ำเสีย 6" ลาด 1:100', 'ผ่านปลอกที่คานคอดิน', 'dl', 80, 20);
    label('mh', [4.25, 0, -1.2], 'บ่อพัก', '', 'dl', 40, 18);
    label('c1', [x0 + 0.47, 0, zb + 0.25], 'ห้องตกตะกอน', () => 'ตะกอน ' + this.sludge.toFixed(0) + ' %', 'dl', 50, 20);
    label('c2', [x0 + 1.46, 0, zb + 0.6], 'ห้องเติมอากาศ', () => 'ออกซิเจน ' + this.DO.toFixed(1) + ' มก./ล.', 'dr', 120, 20);
    label('c3', [x0 + 2.45, 0, zb + 0.9], 'ห้องตกตะกอนรอบสอง', 'น้ำใสออกที่ระดับท่อออก', 'ur', 120, 18);
    label('blw', [x0 + 1.47, 1.2, ZG + 0.84], 'เครื่องเติมอากาศ ใต้หลังคา', () => (this.blw ? 'เดินตลอด 24 ชม.' : 'หยุด ตู้ควบคุมแจ้งเตือน'), 'ul', 70, 18);
    label('cb', [10.2, 0.3, -0.9], 'บ่อพักน้ำทิ้ง', 'รับน้ำบำบัดและน้ำฝน', 'ur', 60, 20);
    label('pub', [14.0, 0, -1.38], 'ท่อระบายสาธารณะ', '', 'dr', 40, 18);
    label('rd', [3.45, 0.95, 2.0], 'ท่อน้ำฝนหลังคา', () => (this.rainI > 0 ? 'ฝน ' + this.rainI + ' มม./ชม.' : 'ไม่มีฝน'), 'ur', 50, 20);
  },
  reset() { this.mode = 'normal'; this.blw = true; this.rainI = 0; this.DO = 2.5; this.sludge = 35; this.ev = []; this.next = 4; this.today = 0; this.lastSrc = ''; this.qp = {}; },
  scen: [
    ['normal', 'ใช้งานปกติ', (s) => { s.mode = 'normal'; return 'ใช้ห้องน้ำปกติ'; }],
    ['peak', 'ช่วงคนใช้มาก', (s) => { s.mode = 'peak'; return 'ช่วงคนใช้มาก น้ำเสียเข้าถังถี่ขึ้น'; }],
    ['rain', 'ฝนตกหนัก', (s) => { s.rainI = s.rainI ? 0 : 90; return s.rainI ? 'ฝนตก 90 มม./ชม. น้ำฝนลงบ่อพักโดยไม่ผ่านถังบำบัด' : 'ฝนหยุด'; }, (s) => s.rainI > 0],
    ['blw', 'เครื่องเติมอากาศหยุด', (s) => { s.blw = !s.blw; return s.blw ? 'เครื่องเติมอากาศกลับมาเดิน' : 'เครื่องเติมอากาศหยุด ตู้ควบคุมแจ้งเตือนทันที ออกซิเจนในห้องเติมอากาศเริ่มลด'; }, (s) => !s.blw]
  ],
  pulse(p, t0, dur, amp) { this.ev.push([p, t0, dur, amp]); },
  step(dt, t, log) {
    this.next -= dt;
    if (this.next <= 0) {
      const wc = Math.random() < 0.6;
      this.next = (this.mode === 'peak' ? 7 : 22) * (0.6 + Math.random() * 0.8);
      const vol = wc ? 6 : 3; this.today += vol; this.lastSrc = wc ? 'กดชักโครก 6 ล.' : 'ล้างมือ 3 ล.';
      const p0 = wc ? 'pWC' : 'pLV';
      this.pulse(p0, t, 3.5, 1); this.pulse('pMain', t + 2.5, 4.5, 0.9); this.pulse('pIn', t + 6, 4, 0.8); this.pulse('pT0', t + 8, 4, 0.5); this.pulse('pT1', t + 10, 4, 0.5); this.pulse('pOut', t + 12, 5, 0.5);
      this.pulse('pRing', t + 16, 5, 0.45); this.pulse('pPub', t + 19, 5, 0.4);
    }
    const q = { pWC: 0, pLV: 0, pMain: 0, pIn: 0, pT0: 0, pT1: 0, pOut: 0, pRing: 0, pPub: 0 };
    this.ev = this.ev.filter((e) => { if (t < e[1]) return true; if (t > e[1] + e[2]) return false; q[e[0]] = Math.max(q[e[0]], e[3] * Math.sin(Math.PI * (t - e[1]) / e[2])); return true; });
    const rq = this.rainI / 90;
    for (const k in q) { if (k === 'pT0' || k === 'pT1') this.pT[+k[2]].q = q[k]; else this[k].q = q[k]; }
    this.pRD.q = rq; this.pRing.q = Math.max(q.pRing, rq * 0.9); this.pPub.q = Math.max(q.pPub, rq);
    this.pAir.q = this.blw ? 0.6 : 0; this.pVent.q = (q.pWC + q.pMain) * 0.4;
    this.DO += ((this.blw ? 2.6 : 0.2) - this.DO) * dt / (this.blw ? 600 : 1500);
    this.sludge = Math.min(80, this.sludge + dt * 0.00005);
    this.bub.on = this.blw; this.bub.rate = 1;
    this.c2.material.color.setHex(this.DO < 1 ? 0x5a4a30 : 0x8f7444);
    if (this.blw) this.blwFan.rotation.z += dt * 20;
    if (!this.blw && this.DO < 1 && !this.warned) { this.warned = true; log('ออกซิเจนต่ำกว่า 1 มก./ล. จุลินทรีย์ทำงานลดลง เริ่มมีกลิ่น น้ำออกไม่ผ่านเกณฑ์', 'bad'); }
    if (this.DO > 1.5) this.warned = false;
    const g = this.g; this.sl.set(g.zb + 0.03 + 0.4 * this.sludge / 100);
    this.mhw.set(-1.3 + 0.12 * (q.pMain + q.pIn));
  },
  stats() {
    return [['น้ำเสียสะสมวันนี้', Math.round(this.today) + ' ล.', ''], ['ออกซิเจนห้องเติมอากาศ', this.DO.toFixed(1) + ' มก./ล.', this.DO < 1 ? 'bad' : this.DO < 2 ? 'warn' : 'ok'],
      ['เครื่องเติมอากาศ', this.blw ? 'เดิน' : 'หยุด', this.blw ? 'ok' : 'bad'], ['ตะกอนห้องแรก', this.sludge.toFixed(0) + ' %', this.sludge > 70 ? 'warn' : ''],
      ['น้ำฝน', this.rainI ? this.rainI + ' มม./ชม.' : 'ไม่มี', ''], ['ความถี่การใช้', this.mode === 'peak' ? 'ช่วงคนใช้มาก' : 'ปกติ', '']];
  },
  recSpeed: 4, recSec: 40, rec: [[0, 'normal'], [8, 'peak'], [18, 'rain'], [29, 'blw']]
};

// ===== 4) ภาพรวมทั้งโครงการ =====
SC.over = {
  name: 'ภาพรวมทั้งโครงการ', cam: [[16, -32, 15], [20, 2, -0.2]],
  intro: 'ท่อประปาเทศบาลแนวหน้าที่ดินจ่ายเข้าถังเก็บน้ำของทั้ง 2 อาคาร และเติมถังพักสระ ปั๊มของแต่ละอาคารส่งน้ำขึ้นใช้งาน สระหมุนเวียนผ่านห้องเครื่อง น้ำเสียของแต่ละอาคารเข้าถังบำบัดของตัวเองแล้วออกท่อระบายสาธารณะ',
  build() {
    ground(-2.5, 42.5, -3.4, 9.5, -3.6, -0.10);
    // อาคารกายภาพ
    box(0, 12, 0, 9, -0.15, 0.15, M.floor); box(0, 0.15, 0, 9, 0.15, 3.3, M.wall); box(11.85, 12, 0, 9, 0.15, 3.3, M.wall); box(0, 12, 8.85, 9, 0.15, 3.3, M.wall);
    const rf = new T.Shape(); rf.moveTo(-0.8, 3.3); rf.lineTo(6, 5.6); rf.lineTo(12.8, 3.3); rf.lineTo(-0.8, 3.3);
    const rg = new T.Mesh(new T.ExtrudeGeometry(rf, { depth: 9, bevelEnabled: false }), M.roof); rg.position.set(0, 0, -9); add(rg);
    box(2.0, 2.5, 4.0, 4.4, 0.15, 0.6, M.frp);
    box(13.25, 17.58, -0.7, 0.7, -2.05, -0.5, M.tank, 0x5a8aa0); level(13.28, 17.55, -0.67, 0.67, -2.03, M.water).set(-0.95);
    box(13.4, 15.4, 1.2, 2.4, -0.1, 0.05, M.conc); this.h1 = pumpY(14.0, 1.6, 0.3, 0.8); this.h2 = pumpY(14.8, 1.6, 0.3, 0.8);
    box(6.75, 9.72, -1.4, -0.2, -1.8, -0.45, M.tank, 0x5a8aa0); level(6.78, 9.69, -1.37, -0.23, -1.78, M.waste).set(-0.92);
    for (const xn of [7.25, 9.2]) cyl([xn, -0.8, -0.45], [xn, -0.8, -0.06], 0.28, M.tank, 20, true);
    box(15.55, 15.75, 1.3, 1.9, 0.3, 0.95, M.cab, 0x666666); cyl([15.65, 1.6, -0.1], [15.65, 1.6, 0.3], 0.03, M.steel);
    box(40.25, 40.45, 0.4, 1.0, 0.3, 0.95, M.cab, 0x666666); cyl([40.35, 0.7, -0.1], [40.35, 0.7, 0.3], 0.03, M.steel);
    // อาคารวารีบำบัด
    box(19.5, 41.6, -0.5, 9, -0.15, 0.0, M.floor);
    const vs = new T.Shape(); vs.absarc(30.5, -6.9, 13.62, Math.PI * 0.19, Math.PI * 0.81, false); vs.absarc(30.5, -6.9, 13.5, Math.PI * 0.81, Math.PI * 0.19, true);
    const vg = new T.Mesh(new T.ExtrudeGeometry(vs, { depth: 9.5, bevelEnabled: false, curveSegments: 40 }), M.vault); vg.position.set(0, 0, -9); add(vg);
    box(21.7, 29.3, 0, 7, -1.8, -1.5, M.conc); box(21.7, 22.0, 0, 7, -1.5, -0.12, M.concT); box(29.0, 29.3, 0, 7, -1.5, -0.12, M.concT);
    level(22.0, 29.0, 0.02, 6.98, -1.48, M.poolW).set(-0.03);
    box(29.7, 31.6, 0.5, 2.9, -2.3, 0, M.concT, 0x8a969b); level(29.75, 31.55, 0.55, 2.85, -2.28, M.poolW).set(-1.2);
    box(31.6, 33.6, 0.5, 3.2, -2.3, 0, M.concT, 0x8a969b); this.y1 = pumpY(32.2, 1.5, -1.97, 0.8); this.y2 = pumpY(33.0, 1.5, -1.97, 0.8);
    box(29.7, 36, 0.5, 6, 0.0, 0.2, M.concT);
    for (const xf of [30.6, 32.4]) cyl([xf, 4.0, 0.3], [xf, 4.0, 1.6], 0.65, M.tankG, 32);
    box(34.2, 34.9, 3.3, 4.5, 0.2, 1.4, M.cab, 0x666666);
    box(36.8, 41.13, -1.9, -0.5, -2.05, -0.5, M.tank, 0x5a8aa0); level(36.83, 41.1, -1.87, -0.53, -2.03, M.water).set(-0.95);
    box(38.0, 40.0, 0.2, 1.4, -0.1, 0.05, M.conc); this.y3 = pumpY(38.6, 0.6, 0.3, 0.8); this.y4 = pumpY(39.4, 0.6, 0.3, 0.8);
    box(39.6, 41.4, 2.0, 3.4, -2.0, -0.45, M.tank, 0x5a8aa0); level(39.63, 41.37, 2.03, 3.37, -1.98, M.waste).set(-0.97);
    // ท่อ
    this.P = {
      city: pipe('ประปาเทศบาล', [[-2.5, -2.2, -0.75], [42.5, -2.2, -0.75]], 0.06, COL.clean, COL.cleanP, 'w'),
      cH: pipe('เข้าถังกายภาพ', [[13.7, -2.2, -0.75], [13.7, -2.2, -0.35], [13.7, 0, -0.35], [13.7, 0, -0.8]], 0.035, COL.clean, COL.cleanP, 'w'),
      sH: pipe('ท่อดูดกายภาพ', [[17.1, 0.2, -1.95], [17.1, 0.2, 0.3], [17.1, 1.15, 0.3], [14.0, 1.15, 0.3]], 0.04, COL.clean, COL.cleanP, 'w'),
      sH1: pipe('ดูดปั๊ม H2', [[14.8, 1.15, 0.3], [14.8, 1.5, 0.3]], 0.035, COL.clean, COL.cleanP, 'w'),
      sH0: pipe('ดูดปั๊ม H1', [[14.0, 1.15, 0.3], [14.0, 1.5, 0.3]], 0.035, COL.clean, COL.cleanP, 'w'),
      dH0: pipe('ส่งปั๊ม H1', [[14.0, 1.6, 0.48], [14.0, 1.6, 0.8]], 0.035, COL.clean, COL.cleanP, 'w'),
      dH1: pipe('ส่งปั๊ม H2', [[14.8, 1.6, 0.48], [14.8, 1.6, 0.8]], 0.035, COL.clean, COL.cleanP, 'w'),
      dHa: pipe('ท่อส่งรวมช่วงปั๊ม H2', [[14.8, 1.6, 0.8], [14.0, 1.6, 0.8]], 0.035, COL.clean, COL.cleanP, 'w'),
      dH: pipe('ส่งขึ้นอาคารกายภาพ', [[14.0, 1.6, 0.8], [12.3, 1.6, 0.8], [12.3, 1.6, 3.0], [2.25, 1.6, 3.0], [2.25, 4.0, 3.0], [2.25, 4.0, 0.8]], 0.035, COL.clean, COL.cleanP, 'w'),
      wH: pipe('น้ำเสียกายภาพ', [[2.6, 4.2, 0.0], [2.6, 4.2, -0.5], [2.6, -0.8, -0.56], [6.95, -0.8, -0.6]], 0.06, COL.waste, COL.wasteP, 's'),
      oH: pipe('น้ำบำบัดกายภาพ', [[9.6, -0.8, -0.87], [10.4, -0.8, -0.9], [10.4, -3.0, -1.25]], 0.05, COL.eff, COL.effP, 's'),
      pub: pipe('ท่อระบายสาธารณะ', [[-2.5, -3.0, -1.3], [42.5, -3.0, -1.45]], 0.12, COL.eff, COL.effP, 's'),
      rH: pipe('น้ำฝนหลังคากายภาพ', [[12.8, 4.5, 3.3], [12.8, 4.5, -0.3], [12.8, -3.0, -1.32]], 0.045, COL.rain, COL.rainP, 's'),
      gut: pipe('น้ำล้นราง→BT', [[29.45, 1.0, -0.45], [29.45, 1.0, -0.55], [29.9, 1.0, -0.55]], 0.06, COL.pool, COL.poolP, 'p'),
      md: pipe('ช่องดูดก้นสระ→BT', [[27.5, 1.6, -1.5], [27.5, 1.6, -1.62], [29.9, 1.6, -1.62]], 0.06, COL.pool, COL.poolP, 'p'),
      sY: pipe('ท่อดูดสระ', [[31.3, 1.2, -2.05], [31.3, 1.2, -1.69], [33.0, 1.2, -1.69]], 0.07, COL.pool, COL.poolP, 'p'),
      sY1: pipe('ดูดปั๊ม P-1', [[32.2, 1.2, -1.69], [32.2, 1.2, -1.97], [32.2, 1.4, -1.97]], 0.055, COL.pool, COL.poolP, 'p'),
      sY2: pipe('ดูดปั๊ม P-2', [[33.0, 1.2, -1.69], [33.0, 1.2, -1.97], [33.0, 1.4, -1.97]], 0.055, COL.pool, COL.poolP, 'p'),
      dY2: pipe('ส่งปั๊ม P-2', [[33.0, 1.5, -1.8], [33.0, 1.5, -1.2]], 0.06, COL.pool, COL.poolP, 'p'),
      dY: pipe('ส่งขึ้นห้องเครื่อง', [[32.2, 1.5, -1.8], [32.2, 1.5, -1.2], [33.4, 1.5, -1.2], [33.4, 1.5, 1.3], [33.4, 3.0, 1.3], [30.6, 3.0, 1.3], [30.6, 3.35, 1.3]], 0.06, COL.pool, COL.poolP, 'p'),
      fi2: pipe('เข้าถังกรอง 2', [[32.4, 3.0, 1.3], [32.4, 3.35, 1.3]], 0.05, COL.pool, COL.poolP, 'p'),
      fo2: pipe('ออกถังกรอง 2', [[32.4, 3.35, 0.55], [32.4, 2.4, 0.55]], 0.05, COL.ret, COL.retP, 'p'),
      fo: pipe('น้ำกรองแล้ว', [[30.6, 3.35, 0.55], [30.6, 2.4, 0.55], [35.0, 2.4, 0.55], [35.0, 0.8, 0.55], [29.55, 0.8, 0.55], [29.55, 2.2, 0.55], [29.55, 2.2, -1.62], [23.0, 2.2, -1.62]], 0.06, COL.ret, COL.retP, 'p'),
      mu: pipe('ประปาเติมถังพัก', [[30.2, -2.2, -0.75], [30.2, -2.2, -0.3], [30.2, 0.7, -0.3], [30.2, 0.7, -0.5]], 0.03, COL.clean, COL.cleanP, 'w'),
      cY: pipe('เข้าถังวารีฯ', [[37.2, -2.2, -0.75], [37.2, -2.2, -0.35], [37.2, -1.2, -0.35], [37.2, -1.2, -0.8]], 0.035, COL.clean, COL.cleanP, 'w'),
      sYw: pipe('ท่อดูดวารีฯ', [[40.7, -1.2, -1.95], [40.7, -1.2, 0.3], [40.7, 0.3, 0.3], [38.6, 0.3, 0.3], [38.6, 0.5, 0.3]], 0.04, COL.clean, COL.cleanP, 'w'),
      sYw2: pipe('ดูดปั๊มวารีฯ 2', [[39.4, 0.3, 0.3], [39.4, 0.5, 0.3]], 0.035, COL.clean, COL.cleanP, 'w'),
      dYw1: pipe('ส่งปั๊มวารีฯ 1', [[38.6, 0.6, 0.48], [38.6, 0.6, 0.8]], 0.035, COL.clean, COL.cleanP, 'w'),
      dYw: pipe('ส่งขึ้นอาคารวารีฯ', [[39.4, 0.6, 0.48], [39.4, 0.6, 0.8], [37.5, 0.6, 0.8], [37.5, 0.6, 3.0], [36.6, 0.6, 3.0], [36.6, 0.6, 1.0]], 0.035, COL.clean, COL.cleanP, 'w'),
      wY: pipe('น้ำเสียวารีฯ', [[36.9, 1.5, 0.0], [36.9, 1.5, -0.55], [39.8, 1.5, -0.6], [39.8, 2.7, -0.615]], 0.06, COL.waste, COL.wasteP, 's'),
      oY: pipe('น้ำบำบัดวารีฯ', [[41.4, 2.7, -0.9], [41.9, 2.7, -0.95], [41.9, -3.0, -1.44]], 0.05, COL.eff, COL.effP, 's')
    };
    label('tkY', [39, -1.9, -0.6], 'ถังน้ำ 6,000 ล. ปั๊ม 1+1', 'ถังบำบัด 5,000 ล. วารีฯ', 'ul', 140, 20);
    label('city', [3, -2.2, -0.75], 'ท่อประปาเทศบาล', 'จ่ายทั้ง 2 อาคารและเติมสระ', 'dr', 40, 20);
    label('hb', [6, 4.5, 5.0], 'อาคารกายภาพบำบัด', 'น้ำใช้ 4,400 ล./วัน', 'ur', 70, 20);
    label('tkH', [15.4, -0.7, -1.4], 'ถังน้ำ 6,000 ล. ปั๊ม 1+1 ตู้ PCP', 'กายภาพบำบัด', 'dr', 90, 20);
    label('stH', [8.2, -1.4, -1.2], 'ถังบำบัด WSA-1203 × 2', 'กายภาพบำบัด', 'dl', 90, 20);
    label('yb', [27, 4.5, 6.0], 'อาคารวารีบำบัด', 'สระ 146 ลบ.ม. น้ำใช้ 4,550 ล./วัน', 'ur', 60, 20);
    label('pool', [25.5, 0, -0.6], 'สระหมุนเวียน 98 ลบ.ม./ชม.', '', 'ul', 60, 20);
    label('bt', [30.6, 0.5, -1.6], 'ถังพัก BT และห้องปั๊ม', '', 'dr', 120, 20);
    label('flt', [31.5, 4.0, 1.8], 'ห้องเครื่อง กรอง ยูวี ฮีตปั๊ม', '', 'ur', 60, 20);
    label('pub', [20, -3.0, -1.37], 'ท่อระบายสาธารณะ', '', 'dl', 60, 20);
  },
  reset() { this.on = { w: true, p: true, s: true }; },
  scen: [
    ['w', 'น้ำประปา', (s) => { s.on.w = !s.on.w; return (s.on.w ? 'แสดง' : 'ซ่อน') + 'ระบบน้ำประปา'; }, (s) => s.on.w],
    ['p', 'ระบบสระ', (s) => { s.on.p = !s.on.p; return (s.on.p ? 'แสดง' : 'ซ่อน') + 'ระบบสระ'; }, (s) => s.on.p],
    ['s', 'น้ำเสียและน้ำฝน', (s) => { s.on.s = !s.on.s; return (s.on.s ? 'แสดง' : 'ซ่อน') + 'น้ำเสียและน้ำฝน'; }, (s) => s.on.s]
  ],
  step(dt, t) {
    const P = this.P, cyc = (a) => (Math.sin(t / a) > 0 ? 1 : 0);
    const rH = cyc(9), rY = cyc(7.3);
    for (const k in P) P[k].vis = this.on[P[k].sys];
    P.city.q = 0.6; P.cH.q = 0.5; P.cY.q = 0.5; P.mu.q = cyc(23) * 0.4;
    const lH = Math.floor(t / 40) % 2, lY = Math.floor(t / 47) % 2;
    P.sH.q = rH; P.sH0.q = lH ? 0 : rH; P.dH0.q = P.sH0.q; P.sH1.q = lH ? rH : 0; P.dH1.q = P.sH1.q; P.dHa.q = P.sH1.q; P.dH.q = 0.6; this.h1.set(rH > 0 && !lH, false); this.h2.set(rH > 0 && !!lH, false);
    P.sYw.q = rY; P.sYw2.q = lY ? rY : 0; P.dYw1.q = lY ? 0 : rY; P.dYw.q = 0.6; this.y3.set(rY > 0 && !lY, false); this.y4.set(rY > 0 && !!lY, false);
    ['gut', 'md', 'sY', 'sY1', 'dY', 'fo'].forEach((k) => { P[k].q = 0.8; }); P.md.q = 0.35; P.sY2.q = 0; P.dY2.q = 0; P.fi2.q = 0.4; P.fo2.q = 0.4; this.y1.set(true, false); this.y2.set(false, false);
    const w = Math.max(0, Math.sin(t / 3)); P.wH.q = w; P.oH.q = 0.4; P.wY.q = Math.max(0, Math.sin(t / 3.7 + 1)); P.oY.q = 0.4; P.pub.q = 0.5; P.rH.q = 0;
  },
  stats() {
    return [['อาคารกายภาพ น้ำใช้', '4,400 ล./วัน', ''], ['อาคารวารีฯ น้ำใช้', '4,550 ล./วัน', ''], ['สระหมุนเวียน', '98 ลบ.ม./ชม.', 'ok'], ['รอบหมุนเวียน', '1.5 ชม.', ''], ['ถังน้ำสำรอง', '6,000 ล. × 2', '']];
  },
  recSpeed: 4, recSec: 24, rec: [[0, '']]
};

// ---------- เรนเดอร์และ UI ----------
let renderer, scene, camera, controls, cur, curKey, simT = 0, speed = 10, playing = true, showLab = true, LOG = [];
const view = $('#view'), svg = $('#lab');
function init() {
  mats();
  renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); view.prepend(renderer.domElement);
  camera = new T.PerspectiveCamera(34, 16 / 9, 0.1, 400);
  controls = new T.OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.enablePan = false; controls.touches = { ONE: T.TOUCH.ROTATE, TWO: T.TOUCH.DOLLY_ROTATE }; controls.maxPolarAngle = Math.PI * 0.62;
  scene = new T.Scene();
  scene.add(new T.HemisphereLight(0xffffff, 0xb8a888, 0.85));
  const sun = new T.DirectionalLight(0xffffff, 0.75); sun.position.set(-8, 20, 14); scene.add(sun);
  window.addEventListener('resize', resize);
  // มือถือ: ปิดการหมุนไว้ก่อนเพื่อให้เลื่อนหน้าได้ กดปุ่มเพื่อหมุนหรือซูมภาพ
  const coarse = window.matchMedia && window.matchMedia('(pointer:coarse)').matches, rb = $('#rot');
  const setTouch = (on) => { controls.enabled = on; renderer.domElement.style.touchAction = on ? 'none' : 'pan-y'; if (rb) { rb.classList.toggle('on', on); rb.textContent = on ? 'เสร็จ กลับไปเลื่อนหน้า' : 'แตะเพื่อหมุนภาพ'; } };
  if (coarse) setTouch(false);
  if (rb) rb.onclick = () => setTouch(!controls.enabled);
  document.querySelectorAll('[data-scene]').forEach((b) => b.addEventListener('click', () => load(b.dataset.scene)));
  $('#play').onclick = () => { playing = !playing; $('#play').textContent = playing ? 'หยุดชั่วคราว' : 'เล่นต่อ'; };
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => { speed = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b)); }));
  $('#home').onclick = () => setCam(); $('#labt').onclick = () => { showLab = !showLab; $('#labt').classList.toggle('on', showLab); };
  const q = new URLSearchParams(location.search); load(q.get('s') && SC[q.get('s')] ? q.get('s') : 'tank');
  if (q.has('rec')) window.REC = true;
  requestAnimationFrame(loop);
}
function fitCam() {
  const c = cur.cam, P0 = V(...c[0]), Tg = V(...c[1]), dir = P0.clone().sub(Tg).normalize();
  const bx = new T.Box3(); G.children.forEach((o) => { if (!(o.material && o.material === M.soil)) bx.expandByObject(o); });
  const sp = bx.getBoundingSphere(new T.Sphere()), ctr = sp.center.clone().lerp(Tg, 0.35);
  const vf = camera.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect), f = Math.min(vf, hf);
  const dist = sp.radius / Math.sin(f / 2) * (cur.zoom || (camera.aspect < 1 ? 0.6 : 0.66));
  return [ctr.clone().add(dir.multiplyScalar(dist)), ctr];
}
function setCam() { const [p, t] = fitCam(); camera.position.copy(p); controls.target.copy(t); controls.update(); }
function load(k) {
  if (G) { scene.remove(G); G.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  G = new T.Group(); scene.add(G); PIPES = []; ANIM = []; LABELS = []; LOG = []; simT = 0;
  cur = SC[k]; curKey = k; cur.build(); cur.reset(); resize(); setCam();
  document.querySelectorAll('[data-scene]').forEach((b) => b.classList.toggle('on', b.dataset.scene === k));
  $('#intro').textContent = cur.intro; $('#log').innerHTML = '';
  const sb = $('#scen'); sb.innerHTML = '';
  cur.scen.forEach(([id, txt, fn, act]) => {
    const b = document.createElement('button'); b.className = 'sb'; b.textContent = txt; b.dataset.id = id;
    b.onclick = () => { log(fn(cur)); paintScen(); }; sb.appendChild(b);
  });
  paintScen();
  window.__clashes = clashes(); window.__scene = k;
  $('#clash').textContent = window.__clashes.length ? 'ท่อชนกัน ' + window.__clashes.length + ' จุด' : (view.clientWidth < 640 ? 'ท่อไม่ทับกัน' : 'ตรวจแนวท่อแล้ว ไม่มีท่อทับกัน');
  $('#clash').className = 'clash ' + (window.__clashes.length ? 'bad' : 'ok') + (/[?&]debug/.test(location.search) ? ' dbg' : '');
  try { history.replaceState(null, '', '?s=' + k); } catch (e) {}
  resize();
}
function paintScen() { cur.scen.forEach(([id, , , act]) => { const b = document.querySelector('#scen [data-id="' + id + '"]'); if (b) b.classList.toggle('on', !!(act && act(cur))); }); }
function fmt(t) { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = Math.floor(t) % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); }
function log(msg, cls) {
  if (!msg) return; LOG.unshift([fmt(simT), msg, cls || '']); LOG = LOG.slice(0, 7);
  $('#log').innerHTML = LOG.map(([a, b, c]) => '<li class="' + c + '"><b>' + a + '</b>' + b + '</li>').join('');
}
function resize() {
  const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false);
  renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
  camera.aspect = w / h; camera.updateProjectionMatrix(); svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
}
// วางป้ายอัตโนมัติ: เส้นชี้ 45° แล้วแนวนอน ไม่ไขว้กัน ป้ายไม่ทับกัน ไม่ล้นขอบภาพ
function segX(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
function segRect(a, b, r) {
  if (Math.max(a[0], b[0]) < r[0] || Math.min(a[0], b[0]) > r[2] || Math.max(a[1], b[1]) < r[1] || Math.min(a[1], b[1]) > r[3]) return false;
  const c = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
  if (a[0] > r[0] && a[0] < r[2] && a[1] > r[1] && a[1] < r[3]) return true;
  for (let i = 0; i < 4; i++) if (segX(a, b, c[i], c[(i + 1) % 4])) return true;
  return false;
}
const DIRS = ['ur', 'ul', 'dr', 'dl'];
function drawLabels() {
  if (!showLab) { svg.innerHTML = ''; return; }
  const w = view.clientWidth, h = view.clientHeight, sm = w < 640, k = sm ? 0.62 : 1;
  const fT = '600 ' + (sm ? 11 : 14) + "px 'IBM Plex Sans Thai',sans-serif", fS = '400 ' + (sm ? 10 : 12.5) + "px 'IBM Plex Sans Thai',sans-serif";
  const lh = sm ? 13 : 16, placed = [];
  const geo = (x, y, dir, d, hl, twd, nl) => {
    const sx = dir[1] === 'r' ? 1 : -1, sy = dir[0] === 'u' ? -1 : 1;
    const ex = x + sx * d, ey = y + sy * d, fx = ex + sx * (hl + twd + 6), tx = sx > 0 ? ex + hl : fx;
    const r = [tx - 3, ey - 4 - lh * nl - 2, tx + twd + 3, ey - 2];
    return { ex, ey, fx, tx, r, s: [[[x, y], [ex, ey]], [[ex, ey], [fx, ey]]] };
  };
  const ok = (g) => {
    if (g.r[0] < 4 || g.r[2] > w - 4 || g.r[1] < 30 || g.r[3] > h - (sm ? 58 : 4) || g.fx < 2 || g.fx > w - 2) return false;
    for (const P of placed) {
      if (!(g.r[2] < P.r[0] || g.r[0] > P.r[2] || g.r[3] < P.r[1] || g.r[1] > P.r[3])) return false;
      for (const a of g.s) { if (segRect(a[0], a[1], P.r)) return false; for (const b of P.s) if (segX(a[0], a[1], b[0], b[1])) return false; }
      for (const b of P.s) if (segRect(b[0], b[1], g.r)) return false;
    }
    return true;
  };
  let s = '';
  const AN = LABELS.map((L) => { const p = L.p.clone().project(camera); return p.z > 1 ? null : [(p.x + 1) / 2 * w, (1 - p.y) / 2 * h]; });
  const okA = (g, me) => { for (let i = 0; i < AN.length; i++) { const a = AN[i]; if (!a || i === me) continue; if (a[0] > g.r[0] - 8 && a[0] < g.r[2] + 8 && a[1] > g.r[1] - 8 && a[1] < g.r[3] + 8) return false; for (const sg of g.s) if (segRect(sg[0], sg[1], [a[0] - 5, a[1] - 5, a[0] + 5, a[1] + 5])) return false; } return true; };
  for (let li = 0; li < LABELS.length; li++) {
    const L = LABELS[li];
    if (!AN[li]) continue;
    const x = AN[li][0], y = AN[li][1];
    if (x < 0 || x > w || y < 0 || y > h) continue;
    const sub = sm ? '' : (typeof L.sub === 'function' ? L.sub() : L.sub);
    const twd = Math.max(tw(L.title, fT), sub ? tw(sub, fS) : 0), nl = sub ? 2 : 1, hl = L.h * k;
    const cands = [];
    if (L.pick) cands.push(L.pick);
    for (const m of [1, 1.6, 2.3, 0.6]) for (const dr of [L.dir].concat(DIRS.filter((q) => q !== L.dir))) cands.push([dr, m]);
    let g = null, pick = null, useSub = !!sub;
    for (const c of cands) { const t = geo(x, y, c[0], L.d * k * c[1], hl, twd, nl); if (ok(t) && okA(t, li)) { g = t; pick = c; break; } }
    if (!g && sub) { const tw1 = tw(L.title, fT); for (const c of cands) { const t = geo(x, y, c[0], L.d * k * c[1], hl, tw1, 1); if (ok(t) && okA(t, li)) { g = t; pick = null; useSub = false; break; } } }
    if (!g) { L.pick = null; continue; }
    L.pick = useSub ? pick : null; placed.push(g);
    s += '<polyline points="' + x + ',' + y + ' ' + g.ex + ',' + g.ey + ' ' + g.fx + ',' + g.ey + '" class="ld"/><circle cx="' + x + '" cy="' + y + '" r="' + (sm ? 3 : 4) + '" class="dt"/>';
    s += '<rect x="' + (g.r[0] + 1) + '" y="' + (g.r[1] + 1) + '" width="' + (g.r[2] - g.r[0] - 2) + '" height="' + (g.r[3] - g.r[1] - 4) + '" rx="4" class="lb"/>';
    s += '<text x="' + g.tx + '" y="' + (g.ey - 6 - (useSub ? lh : 0)) + '" class="lt" style="font:' + fT + '">' + L.title + '</text>';
    if (useSub) s += '<text x="' + g.tx + '" y="' + (g.ey - 5) + '" class="ls" style="font:' + fS + '">' + sub + '</text>';
  }
  svg.innerHTML = s;
}
function paintStats() {
  $('#stats').innerHTML = cur.stats().map(([a, b, c]) => '<div class="st ' + c + '"><span>' + a + '</span><b>' + b + '</b></div>').join('');
  $('#clock').textContent = (view.clientWidth < 640 ? '' : 'เวลาจำลอง ') + fmt(simT) + ' · ' + speed + '×';
}
let last = performance.now(), acc = 0;
function frame(dtReal) {
  if (playing) {
    let d = dtReal * speed; while (d > 0) { const h = Math.min(d, 0.5); cur.step(h, simT, log); simT += h; d -= h; }
  }
  for (const f of ANIM) f(dtReal);
  flowPipes(playing ? dtReal : 0);
  controls.update(); renderer.render(scene, camera); drawLabels();
  acc += dtReal; paintStats(); if (acc > 0.25) { acc = 0; paintScen(); }
}
function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!window.REC) frame(dt); requestAnimationFrame(loop); }
// สำหรับอัดวิดีโอ: เดินทีละเฟรม กล้องโคจรช้า ๆ และสั่งสถานการณ์ตามเวลา
window.__rec = function (k, fps, sec) { document.body.classList.add('rec'); load(k); if (cur.recInit) cur.recInit(); speed = cur.recSpeed || 10; cur.zoom = cur.recZoom || 0.56; window.__fc = fitCam(); cur.zoom = 0; window.REC = true; window.__f = 0; window.__fps = fps; window.__sec = sec; return cur.rec.length; };
window.__frame = function () {
  const f = window.__f++, t = f / window.__fps, fps = window.__fps;
  for (const [ts, id] of cur.rec) if (Math.abs(t - ts) < 0.5 / fps && id) { const s = cur.scen.find((x) => x[0] === id); if (s) { log(s[2](cur)); paintScen(); } }
  const [P0, Tg] = window.__fc, r = P0.clone().sub(Tg), a = Math.sin(t / window.__sec * Math.PI * 2) * 0.32;
  const rx = r.x * Math.cos(a) + r.z * Math.sin(a), rz = -r.x * Math.sin(a) + r.z * Math.cos(a);
  camera.position.set(Tg.x + rx, Tg.y + r.y, Tg.z + rz); controls.target.copy(Tg); camera.lookAt(Tg);
  frame(1 / fps); paintStats();
  const rc = document.getElementById('reccap'); if (rc) rc.innerHTML = '<b>' + cur.name + '</b>' + (LOG[0] ? '<span>' + LOG[0][1] + '</span>' : '');
  return f;
};
window.__clash = clashes;
init();
})();
