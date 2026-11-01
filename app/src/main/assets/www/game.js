/* عالم المكعبات — لعبة فوكسل 3D بأسلوب ماين كرافت */
(function () {
  "use strict";

  // ===== ثوابت العالم =====
  var SX = 48, SY = 24, SZ = 48;
  var SAVE_KEY = "voxel_world_save_v1";
  var isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;

  // ===== أنواع البلوكات =====
  // tiles: [top, side, bottom] في الأطلس
  var BLOCKS = {
    1: { name: "عشب",   top: 0, side: 1, bottom: 2 },
    2: { name: "تراب",  top: 2, side: 2, bottom: 2 },
    3: { name: "حجر",   top: 3, side: 3, bottom: 3 },
    4: { name: "جذع",   top: 5, side: 4, bottom: 5 },
    5: { name: "أوراق", top: 6, side: 6, bottom: 6 },
    6: { name: "رمل",   top: 7, side: 7, bottom: 7 },
    7: { name: "ألواح", top: 8, side: 8, bottom: 8 }
  };
  var HOTBAR = [1, 2, 3, 4, 5, 6, 7];

  // ===== عناصر DOM =====
  var canvas = document.getElementById("gameCanvas");
  var elMenu = document.getElementById("menu");
  var elPause = document.getElementById("pauseMenu");
  var elStats = document.getElementById("statsChip");
  var elToast = document.getElementById("toast");
  var elHotbar = document.getElementById("hotbar");
  var elBreak = document.getElementById("breakBtn");
  var elPlace = document.getElementById("placeBtn");
  var elJump = document.getElementById("jumpBtn");
  var elJoyBase = document.getElementById("joyBase");
  var elJoyKnob = document.getElementById("joyKnob");

  // ===== حالة اللعبة =====
  var world = new Uint8Array(SX * SY * SZ);
  var seed = (Math.random() * 1e9) | 0;
  var playing = false, dirty = false;
  var breakMode = true, slot = 0;
  var player = { x: SX / 2 + 0.5, y: 20, z: SZ / 2 + 0.5, vy: 0, onGround: false };
  var yaw = 0.6, pitch = -0.25;
  var jumpHeld = false;
  var keys = {};

  function idx(x, y, z) { return (y * SZ + z) * SX + x; }
  function getBlock(x, y, z) {
    if (y < 0) return 3;
    if (x < 0 || x >= SX || z < 0 || z >= SZ || y >= SY) return 0;
    return world[idx(x, y, z)];
  }

  // ===== RNG وضوضاء =====
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function valueNoise2D(rng, gx, gz) {
    var g = [];
    for (var i = 0; i < (gx + 1) * (gz + 1); i++) g.push(rng());
    return function (x, z) {
      var fx = x / 8, fz = z / 8;
      var x0 = Math.min(Math.floor(fx), gx - 1), z0 = Math.min(Math.floor(fz), gz - 1);
      var tx = smooth(fx - x0), tz = smooth(fz - z0);
      var a = g[z0 * (gx + 1) + x0], b = g[z0 * (gx + 1) + x0 + 1];
      var c = g[(z0 + 1) * (gx + 1) + x0], d = g[(z0 + 1) * (gx + 1) + x0 + 1];
      return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    };
  }

  // ===== توليد العالم =====
  function generate() {
    var rng = mulberry32(seed);
    var n1 = valueNoise2D(rng, SX / 8, SZ / 8);
    var n2 = valueNoise2D(rng, SX / 8, SZ / 8);
    world.fill(0);
    var heights = [];
    for (var x = 0; x < SX; x++) {
      heights[x] = [];
      for (var z = 0; z < SZ; z++) {
        var h = 8 + Math.round(n1(x, z) * 7 + n2(x, z) * 3);
        h = Math.max(6, Math.min(SY - 7, h));
        heights[x][z] = h;
        for (var y = 0; y <= h; y++) {
          var id;
          if (y === h) id = (h <= 9) ? 6 : 1;
          else if (y >= h - 3) id = (h <= 9) ? 6 : 2;
          else id = 3;
          world[idx(x, y, z)] = id;
        }
      }
    }
    // أشجار
    var treeRng = mulberry32(seed + 777);
    var treeCount = 14;
    for (var t = 0; t < treeCount; t++) {
      var tx2 = 3 + Math.floor(treeRng() * (SX - 6));
      var tz2 = 3 + Math.floor(treeRng() * (SZ - 6));
      var th = heights[tx2][tz2];
      if (th <= 9 || getBlock(tx2, th, tz2) !== 1) continue;
      var trunkH = 4 + Math.floor(treeRng() * 2);
      for (var ty = 1; ty <= trunkH; ty++) world[idx(tx2, th + ty, tz2)] = 4;
      var topY = th + trunkH;
      for (var dy = -1; dy <= 1; dy++) {
        var r = (dy === 1) ? 1 : 2;
        for (var dx = -r; dx <= r; dx++) for (var dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r && treeRng() < 0.5) continue;
          var lx = tx2 + dx, ly = topY + dy, lz = tz2 + dz;
          if (lx >= 0 && lx < SX && lz >= 0 && lz < SZ && ly < SY && getBlock(lx, ly, lz) === 0)
            world[idx(lx, ly, lz)] = 5;
        }
      }
      if (topY + 2 < SY) world[idx(tx2, topY + 2, tz2)] = 5;
    }
    // موضع اللاعب
    var cx = SX >> 1, cz = SZ >> 1;
    player.x = cx + 0.5; player.z = cz + 0.5;
    player.y = heights[cx][cz] + 2; player.vy = 0;
    yaw = 0.6; pitch = -0.25;
  }

  // ===== أطلس الخامات (بكسل آرت) =====
  var atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = 144; atlasCanvas.height = 16;
  (function paintAtlas() {
    var ctx = atlasCanvas.getContext("2d");
    var rng = mulberry32(4242);
    function pick(pal) { return pal[Math.floor(rng() * pal.length)]; }
    function fillTile(t, pal) {
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
        ctx.fillStyle = pick(pal); ctx.fillRect(t * 16 + x, y, 1, 1);
      }
    }
    var grass = ["#6DAE47", "#79BC52", "#63A03E", "#83C65E"];
    var dirt = ["#8B6244", "#7A5539", "#96704E", "#6E4C33"];
    var stone = ["#8F8F8F", "#7D7D7D", "#9C9C9C", "#858585"];
    var leaves = ["#3E7A2E", "#4E8F3A", "#356B27", "#57A344"];
    var sand = ["#E3D6A3", "#D9C98F", "#EDE0B5", "#DECf96"];
    fillTile(0, grass);            // عشب أعلى
    fillTile(1, dirt);             // عشب جانب
    (function () {                 // شريط العشب أعلى الجانب
      for (var x = 0; x < 16; x++) {
        var depth = 3 + Math.floor(rng() * 2);
        for (var y = 0; y < depth; y++) { ctx.fillStyle = pick(grass); ctx.fillRect(16 + x, y, 1, 1); }
      }
    })();
    fillTile(2, dirt);
    fillTile(3, stone);
    (function () {                 // شقوق الحجر
      for (var i = 0; i < 10; i++) {
        ctx.fillStyle = "#6E6E6E";
        ctx.fillRect(48 + Math.floor(rng() * 16), Math.floor(rng() * 16), 2, 1);
      }
    })();
    (function () {                 // جذع جانب — خطوط عمودية
      for (var x = 0; x < 16; x++) {
        var c = (x % 4 < 2) ? ["#6B4E2E", "#75562F"] : ["#5D4326", "#654A2B"];
        for (var y = 0; y < 16; y++) { ctx.fillStyle = pick(c); ctx.fillRect(64 + x, y, 1, 1); }
      }
    })();
    (function () {                 // جذع أعلى — حلقات
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
        var d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        var c = (d > 6.5) ? "#5D4326" : (d > 4.5) ? "#A0824E" : (d > 2.5) ? "#8A6C3C" : "#6B4E2E";
        if (rng() < 0.12) c = "#75562F";
        ctx.fillStyle = c; ctx.fillRect(80 + x, y, 1, 1);
      }
    })();
    fillTile(6, leaves);
    fillTile(7, sand);
    (function () {                 // ألواح — خطوط أفقية
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
        var c = (y % 4 === 3) ? "#96774A" : pick(["#B8945F", "#C09B66", "#AE8A56"]);
        if (y % 8 < 4 && x === 7 && y % 4 !== 3) c = "#96774A";
        ctx.fillStyle = c; ctx.fillRect(128 + x, y, 1, 1);
      }
    })();
  })();

  // ===== Three.js =====
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 34, 95);
  var camera = new THREE.PerspectiveCamera(75, 1, 0.1, 220);
  camera.rotation.order = "YXZ";

  var atlasTex = new THREE.CanvasTexture(atlasCanvas);
  atlasTex.magFilter = THREE.NearestFilter;
  atlasTex.minFilter = THREE.NearestFilter;
  atlasTex.generateMipmaps = false;

  var worldMesh = null;
  var FACES = [
    { dir: [-1, 0, 0], shade: 0.80, corners: [{ p: [0, 1, 0], uv: [0, 1] }, { p: [0, 0, 0], uv: [0, 0] }, { p: [0, 1, 1], uv: [1, 1] }, { p: [0, 0, 1], uv: [1, 0] }] },
    { dir: [1, 0, 0], shade: 0.80, corners: [{ p: [1, 1, 1], uv: [0, 1] }, { p: [1, 0, 1], uv: [0, 0] }, { p: [1, 1, 0], uv: [1, 1] }, { p: [1, 0, 0], uv: [1, 0] }] },
    { dir: [0, -1, 0], shade: 0.55, corners: [{ p: [1, 0, 1], uv: [1, 0] }, { p: [0, 0, 1], uv: [0, 0] }, { p: [1, 0, 0], uv: [1, 1] }, { p: [0, 0, 0], uv: [0, 1] }] },
    { dir: [0, 1, 0], shade: 1.00, corners: [{ p: [0, 1, 1], uv: [1, 1] }, { p: [1, 1, 1], uv: [0, 1] }, { p: [0, 1, 0], uv: [1, 0] }, { p: [1, 1, 0], uv: [0, 0] }] },
    { dir: [0, 0, -1], shade: 0.70, corners: [{ p: [1, 0, 0], uv: [0, 0] }, { p: [0, 0, 0], uv: [1, 0] }, { p: [1, 1, 0], uv: [0, 1] }, { p: [0, 1, 0], uv: [1, 1] }] },
    { dir: [0, 0, 1], shade: 0.70, corners: [{ p: [0, 0, 1], uv: [0, 0] }, { p: [1, 0, 1], uv: [1, 0] }, { p: [0, 1, 1], uv: [0, 1] }, { p: [1, 1, 1], uv: [1, 1] }] }
  ];

  function buildMesh() {
    var positions = [], normals = [], uvs = [], colors = [], indices = [];
    var TILES = 9;
    for (var y = 0; y < SY; y++) for (var z = 0; z < SZ; z++) for (var x = 0; x < SX; x++) {
      var id = world[idx(x, y, z)];
      if (!id) continue;
      var def = BLOCKS[id];
      for (var f = 0; f < 6; f++) {
        var face = FACES[f];
        var nx2 = x + face.dir[0], ny2 = y + face.dir[1], nz2 = z + face.dir[2];
        if (getBlock(nx2, ny2, nz2) !== 0) continue;
        var tile = (f === 3) ? def.top : (f === 2) ? def.bottom : def.side;
        var ndx = positions.length / 3;
        for (var c = 0; c < 4; c++) {
          var cr = face.corners[c];
          positions.push(x + cr.p[0], y + cr.p[1], z + cr.p[2]);
          normals.push(face.dir[0], face.dir[1], face.dir[2]);
          uvs.push((tile + 0.01 + cr.uv[0] * 0.98) / TILES, 0.01 + cr.uv[1] * 0.98);
          colors.push(face.shade, face.shade, face.shade);
        }
        indices.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 1, ndx + 3);
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    if (worldMesh) { scene.remove(worldMesh); worldMesh.geometry.dispose(); }
    worldMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true }));
    scene.add(worldMesh);
  }

  // صندوق تحديد البلوك المستهدف
  var hlGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
  var highlight = new THREE.LineSegments(hlGeo, new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7 }));
  scene.add(highlight);

  // ===== فيزياء اللاعب =====
  var P_W = 0.3, P_H = 1.8, EYE = 1.62;
  function boxCollides(px2, py2, pz2) {
    var x0 = Math.floor(px2 - P_W), x1 = Math.floor(px2 + P_W);
    var y0 = Math.floor(py2), y1 = Math.floor(py2 + P_H);
    var z0 = Math.floor(pz2 - P_W), z1 = Math.floor(pz2 + P_W);
    for (var y = y0; y <= y1; y++) for (var z = z0; z <= z1; z++) for (var x = x0; x <= x1; x++)
      if (getBlock(x, y, z) !== 0) return true;
    return false;
  }
  function physics(dt) {
    var speed = 4.4;
    var jx = 0, jy = 0;
    if (keys["KeyW"]) jy += 1; if (keys["KeyS"]) jy -= 1;
    if (keys["KeyD"]) jx += 1; if (keys["KeyA"]) jx -= 1;
    jx += joy.x; jy += joy.y;
    var len = Math.hypot(jx, jy);
    if (len > 1) { jx /= len; jy /= len; }
    var fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    var rx = Math.cos(yaw), rz = -Math.sin(yaw);
    var mx = (fx * jy + rx * jx) * speed * dt;
    var mz = (fz * jy + rz * jx) * speed * dt;
    // محور X
    if (mx !== 0) {
      var nx3 = player.x + mx;
      if (!boxCollides(nx3, player.y, player.z)) player.x = nx3;
    }
    // محور Z
    if (mz !== 0) {
      var nz3 = player.z + mz;
      if (!boxCollides(player.x, player.y, nz3)) player.z = nz3;
    }
    // الجاذبية والقفز
    player.vy -= 26 * dt;
    if (jumpHeld && player.onGround) { player.vy = 8.6; player.onGround = false; }
    var ny3 = player.y + player.vy * dt;
    if (player.vy <= 0) {
      if (boxCollides(player.x, ny3, player.z)) {
        player.y = Math.floor(ny3) + 1.0001; player.vy = 0; player.onGround = true;
      } else { player.y = ny3; player.onGround = false; }
    } else {
      if (boxCollides(player.x, ny3, player.z)) { player.vy = 0; }
      else { player.y = ny3; }
      player.onGround = false;
    }
    if (player.y < -10) { // سقط خارج العالم
      player.y = SY; player.vy = 0;
    }
  }

  // ===== Raycast (DDA) =====
  function raycast(maxDist) {
    var dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    var ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
    var x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    var stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
    var tdx = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    var tdy = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    var tdz = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
    var tmx = dir.x !== 0 ? ((dir.x > 0 ? x + 1 - ox : ox - x) * tdx) : Infinity;
    var tmy = dir.y !== 0 ? ((dir.y > 0 ? y + 1 - oy : oy - y) * tdy) : Infinity;
    var tmz = dir.z !== 0 ? ((dir.z > 0 ? z + 1 - oz : oz - z) * tdz) : Infinity;
    var nx4 = 0, ny4 = 0, nz4 = 0, t = 0;
    for (var i = 0; i < 64; i++) {
      if (getBlock(x, y, z) !== 0 && i > 0) return { x: x, y: y, z: z, nx: nx4, ny: ny4, nz: nz4 };
      if (tmx < tmy && tmx < tmz) { x += stepX; t = tmx; tmx += tdx; nx4 = -stepX; ny4 = 0; nz4 = 0; }
      else if (tmy < tmz) { y += stepY; t = tmy; tmy += tdy; nx4 = 0; ny4 = -stepY; nz4 = 0; }
      else { z += stepZ; t = tmz; tmz += tdz; nx4 = 0; ny4 = 0; nz4 = -stepZ; }
      if (t > maxDist) return null;
    }
    return null;
  }

  // ===== الصوت =====
  var audioCtx = null;
  function blip(freq, dur, type) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type || "square"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.08, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + dur);
    } catch (e) { }
  }

  // ===== الأفعال =====
  function setBlock(x, y, z, id) {
    if (x < 0 || x >= SX || y < 0 || y >= SY || z < 0 || z >= SZ) return;
    world[idx(x, y, z)] = id;
    dirty = true;
    buildMesh();
  }
  function doBreak() {
    var hit = raycast(6);
    if (hit) { setBlock(hit.x, hit.y, hit.z, 0); blip(160, 0.09); }
  }
  function doPlace() {
    var hit = raycast(6);
    if (!hit || (hit.nx === 0 && hit.ny === 0 && hit.nz === 0)) return;
    var bx = hit.x + hit.nx, by = hit.y + hit.ny, bz = hit.z + hit.nz;
    if (bx < 0 || bx >= SX || by < 0 || by >= SY || bz < 0 || bz >= SZ) return;
    if (getBlock(bx, by, bz) !== 0) return;
    // لا تبنِ داخل جسم اللاعب
    if (bx + 1 > player.x - P_W && bx < player.x + P_W &&
        by + 1 > player.y && by < player.y + P_H &&
        bz + 1 > player.z - P_W && bz < player.z + P_W) return;
    setBlock(bx, by, bz, HOTBAR[slot]);
    blip(300, 0.07, "triangle");
  }
  function doAction() { if (breakMode) doBreak(); else doPlace(); }

  // ===== شريط الأدوات =====
  function buildHotbar() {
    elHotbar.innerHTML = "";
    HOTBAR.forEach(function (id, i) {
      var d = document.createElement("div");
      d.className = "slot" + (i === slot ? " sel" : "");
      var c = document.createElement("canvas");
      c.width = 32; c.height = 32;
      var cx2 = c.getContext("2d");
      cx2.imageSmoothingEnabled = false;
      cx2.drawImage(atlasCanvas, BLOCKS[id].side * 16, 0, 16, 16, 0, 0, 32, 32);
      var n = document.createElement("span");
      n.className = "num"; n.textContent = i + 1;
      d.appendChild(c); d.appendChild(n);
      d.addEventListener("click", function (e) {
        e.stopPropagation();
        slot = i; buildHotbar();
        toast("بلوك: " + BLOCKS[id].name);
      });
      elHotbar.appendChild(d);
    });
  }

  var toastTimer = null;
  function toast(msg) {
    elToast.textContent = msg;
    elToast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { elToast.classList.remove("show"); }, 1400);
  }

  // ===== التحكم اللمسي =====
  var joy = { x: 0, y: 0 };
  var joyTouchId = null, lookTouchId = null;
  var joyOrigin = { x: 0, y: 0 };
  var lookLast = { x: 0, y: 0 };
  var tapInfo = null;

  canvas.addEventListener("touchstart", function (e) {
    if (!playing) return;
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.clientX < window.innerWidth * 0.45 && joyTouchId === null) {
        joyTouchId = t.identifier;
        joyOrigin.x = t.clientX; joyOrigin.y = t.clientY;
        elJoyBase.style.display = "block";
        elJoyKnob.style.display = "block";
        elJoyBase.style.left = (t.clientX - 55) + "px";
        elJoyBase.style.top = (t.clientY - 55) + "px";
        elJoyKnob.style.left = (t.clientX - 24) + "px";
        elJoyKnob.style.top = (t.clientY - 24) + "px";
      } else if (lookTouchId === null) {
        lookTouchId = t.identifier;
        lookLast.x = t.clientX; lookLast.y = t.clientY;
        tapInfo = { x: t.clientX, y: t.clientY, t: Date.now(), moved: 0 };
      }
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", function (e) {
    if (!playing) return;
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === joyTouchId) {
        var dx = t.clientX - joyOrigin.x, dy = t.clientY - joyOrigin.y;
        var d = Math.hypot(dx, dy), max = 48;
        if (d > max) { dx = dx / d * max; dy = dy / d * max; }
        joy.x = dx / max; joy.y = -dy / max;
        elJoyKnob.style.left = (joyOrigin.x + dx - 24) + "px";
        elJoyKnob.style.top = (joyOrigin.y + dy - 24) + "px";
      } else if (t.identifier === lookTouchId) {
        var ldx = t.clientX - lookLast.x, ldy = t.clientY - lookLast.y;
        lookLast.x = t.clientX; lookLast.y = t.clientY;
        if (tapInfo) tapInfo.moved += Math.abs(ldx) + Math.abs(ldy);
        yaw -= ldx * 0.0052;
        pitch -= ldy * 0.0052;
        pitch = Math.max(-1.55, Math.min(1.55, pitch));
      }
    }
  }, { passive: false });

  function endTouch(e) {
    if (!playing) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === joyTouchId) {
        joyTouchId = null; joy.x = 0; joy.y = 0;
        elJoyBase.style.display = "none";
        elJoyKnob.style.display = "none";
      } else if (t.identifier === lookTouchId) {
        if (tapInfo && Date.now() - tapInfo.t < 280 && tapInfo.moved < 14) doAction();
        lookTouchId = null; tapInfo = null;
      }
    }
  }
  canvas.addEventListener("touchend", endTouch);
  canvas.addEventListener("touchcancel", endTouch);

  // أزرار اللمس
  elBreak.addEventListener("click", function (e) {
    e.stopPropagation(); breakMode = true;
    elBreak.classList.add("sel"); elPlace.classList.remove("sel");
  });
  elPlace.addEventListener("click", function (e) {
    e.stopPropagation(); breakMode = false;
    elPlace.classList.add("sel"); elBreak.classList.remove("sel");
  });
  elJump.addEventListener("touchstart", function (e) { e.preventDefault(); e.stopPropagation(); jumpHeld = true; }, { passive: false });
  elJump.addEventListener("touchend", function (e) { e.preventDefault(); jumpHeld = false; }, { passive: false });

  // ===== التحكم بالكمبيوتر =====
  canvas.addEventListener("click", function () {
    if (playing && !isTouch && document.pointerLockElement !== canvas) canvas.requestPointerLock();
  });
  document.addEventListener("mousemove", function (e) {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * 0.0024;
    pitch -= e.movementY * 0.0024;
    pitch = Math.max(-1.55, Math.min(1.55, pitch));
  });
  document.addEventListener("mousedown", function (e) {
    if (document.pointerLockElement !== canvas) return;
    if (e.button === 0) doBreak();
    if (e.button === 2) doPlace();
  });
  document.addEventListener("contextmenu", function (e) {
    if (document.pointerLockElement === canvas) e.preventDefault();
  });
  document.addEventListener("keydown", function (e) {
    keys[e.code] = true;
    if (e.code === "Space") { jumpHeld = true; e.preventDefault(); }
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 7) { slot = n - 1; buildHotbar(); }
  });
  document.addEventListener("keyup", function (e) {
    keys[e.code] = false;
    if (e.code === "Space") jumpHeld = false;
  });
  document.addEventListener("pointerlockchange", function () {
    if (document.pointerLockElement !== canvas && playing && !isTouch) pause();
  });

  // ===== الحفظ =====
  function saveGame() {
    try {
      var bin = "";
      for (var i = 0; i < world.length; i += 8192) {
        bin += String.fromCharCode.apply(null, world.subarray(i, i + 8192));
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        seed: seed, w: btoa(bin),
        p: [player.x, player.y, player.z, yaw, pitch],
        s: slot, m: breakMode ? 1 : 0
      }));
      dirty = false;
    } catch (e) { }
  }
  function loadGame() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      var bin = atob(d.w);
      if (bin.length !== world.length) return false;
      for (var i = 0; i < bin.length; i++) world[i] = bin.charCodeAt(i);
      seed = d.seed;
      player.x = d.p[0]; player.y = d.p[1]; player.z = d.p[2];
      yaw = d.p[3]; pitch = d.p[4];
      slot = d.s || 0; breakMode = d.m !== 0;
      return true;
    } catch (e) { return false; }
  }
  setInterval(function () { if (playing && dirty) saveGame(); }, 8000);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && playing) { saveGame(); pause(); }
  });

  // ===== القوائم =====
  function start() {
    playing = true;
    elMenu.classList.add("hidden");
    elPause.classList.add("hidden");
    if (!isTouch) canvas.requestPointerLock();
    blip(440, 0.08, "sine");
  }
  function pause() {
    playing = false;
    elPause.classList.remove("hidden");
    saveGame();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }
  document.getElementById("startBtn").addEventListener("click", start);
  document.getElementById("resumeBtn").addEventListener("click", start);
  document.getElementById("pauseBtn").addEventListener("click", function (e) {
    e.stopPropagation(); pause();
  });
  document.getElementById("newWorldBtn").addEventListener("click", function () {
    seed = (Math.random() * 1e9) | 0;
    generate();
    buildMesh();
    saveGame();
    elPause.classList.add("hidden");
    playing = true;
    if (!isTouch) canvas.requestPointerLock();
    toast("🌍 عالم جديد وُلد!");
  });

  // ===== الحلقة الرئيسية =====
  var lastT = performance.now(), fps = 0, fpsFrames = 0, fpsTime = 0, statTimer = 0;
  function resize() {
    var w = canvas.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);

  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    if (playing) {
      physics(dt);
      camera.position.set(player.x, player.y + EYE, player.z);
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
      var hit = raycast(6);
      if (hit) {
        highlight.visible = true;
        highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      } else highlight.visible = false;
      fpsFrames++; fpsTime += dt; statTimer += dt;
      if (statTimer > 0.5) {
        fps = Math.round(fpsFrames / fpsTime);
        fpsFrames = 0; fpsTime = 0; statTimer = 0;
        elStats.textContent = "FPS " + fps + " · X " + Math.floor(player.x) + " Y " + Math.floor(player.y) + " Z " + Math.floor(player.z);
      }
    }
    renderer.render(scene, camera);
  }

  // ===== الإقلاع =====
  if (!loadGame()) generate();
  buildMesh();
  buildHotbar();
  if (breakMode) { elBreak.classList.add("sel"); elPlace.classList.remove("sel"); }
  else { elPlace.classList.add("sel"); elBreak.classList.remove("sel"); }
  resize();
  camera.position.set(player.x, player.y + EYE, player.z);
  camera.rotation.y = yaw; camera.rotation.x = pitch;
  requestAnimationFrame(loop);
})();
