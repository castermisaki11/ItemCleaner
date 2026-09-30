// ระบบล้างไอเทมอัตโนมัติ
// Script By Prakan

import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

// ================= ตั้งค่าเริ่มต้น =================
const CONFIG = {
  checkIntervalSec: 2,         // เช็คพื้นที่ที่ไอเทมเยอะทุกกี่วินาที (ยิ่งน้อยยิ่งเริ่มทำงานไว)
  threshold: 250,              // ไอเทมในพื้นที่ เกิน ค่านี้ จะเริ่มนับถอยหลังทันที
  countdownSec: 10,            // นับถอยหลังก่อนล้างทั้งเซิร์ฟเวอร์ (ล้างเมื่อเกินเกณฑ์จะลบทันที ไม่รอ)
  fullClearIntervalSec: 600,   // ล้างทั้งเซิร์ฟเวอร์ทุกกี่วินาที (0 = ปิด)
  cellSize: 64,                // ขนาดพื้นที่ (บล็อก) ที่ใช้แบ่งนับ
  warnMargin: 32,              // เตือนผู้เล่นที่อยู่ในพื้นที่ + ระยะขอบนี้ (บล็อก)
  minY: -64,
  height: 384,
  dimensions: ["overworld", "nether", "the_end"],

  // ไอเทมที่ไม่ลบ: ถ้า id มีคำเหล่านี้อยู่ข้างใน
  keepIds: [
    "netherite", "elytra", "totem_of_undying", "shulker_box",
    "nether_star", "enchanted_golden_apple", "beacon", "dragon_egg",
  ],
  keepNamed: true,             // ไม่ลบไอเทมที่ตั้งชื่อไว้
  keepLore: true,              // ไม่ลบไอเทมที่มี lore

  // เป้าหมายอื่นที่ลบพร้อมกันในพื้นที่ที่ล้าง
  extraTypes: ["minecraft:xp_orb", "minecraft:arrow"],
};
// ==================================================

const KEEP_TAG = "cleaner_keep";
const SAVE_KEY = "cleaner:config";
const STATS_KEY = "cleaner:stats";
const SAVED_FIELDS = [
  "checkIntervalSec", "threshold", "countdownSec",
  "fullClearIntervalSec", "warnMargin",
];

// ---------- โหลด/บันทึกค่า ----------
try {
  const raw = world.getDynamicProperty(SAVE_KEY);
  if (typeof raw === "string") {
    const saved = JSON.parse(raw);
    for (const k of SAVED_FIELDS) if (typeof saved[k] === "number") CONFIG[k] = saved[k];
  }
} catch (e) {}

function saveConfig() {
  const data = {};
  for (const k of SAVED_FIELDS) data[k] = CONFIG[k];
  world.setDynamicProperty(SAVE_KEY, JSON.stringify(data));
}

// ---------- สถิติ ----------
let STATS = { totalRemoved: 0, clears: 0, lastRemoved: 0, top: null };
try {
  const raw = world.getDynamicProperty(STATS_KEY);
  if (typeof raw === "string") STATS = { ...STATS, ...JSON.parse(raw) };
} catch (e) {}

function saveStats() {
  world.setDynamicProperty(STATS_KEY, JSON.stringify(STATS));
}

function noteBusiest(dimId, x, z, count) {
  if (!STATS.top || count > STATS.top.count) {
    STATS.top = { dimId, x, z, count };
    saveStats();
  }
}

// ---------- ตัวช่วย ----------
let busy = false;
let checkRunId = null;
let fullRunId = null;

function valid(e) {
  try {
    return typeof e.isValid === "function" ? e.isValid() : e.isValid;
  } catch (err) {
    return false;
  }
}

/** ไอเทมชิ้นนี้ต้องเก็บไว้ (ไม่ลบ) หรือไม่ */
function shouldKeep(item) {
  try {
    const stack = item.getComponent("item")?.itemStack;
    if (stack) {
      const id = stack.typeId;
      if (CONFIG.keepIds.some((k) => id.includes(k))) return true;
      if (CONFIG.keepNamed && stack.nameTag) return true;
      if (CONFIG.keepLore && stack.getLore().length > 0) return true;
    }
  } catch (e) {}
  return false;
}

/** หาพื้นที่ (cell) ที่มีไอเทมที่ลบได้ เกิน minCount ชิ้น */
function findCells(minCount) {
  const result = [];
  const size = CONFIG.cellSize;

  for (const dimId of CONFIG.dimensions) {
    const dim = world.getDimension(dimId);
    const cells = new Map();

    for (const item of dim.getEntities({ type: "minecraft:item" })) {
      if (!valid(item) || shouldKeep(item)) continue;
      const cx = Math.floor(item.location.x / size) * size;
      const cz = Math.floor(item.location.z / size) * size;
      const key = `${cx},${cz}`;
      cells.set(key, (cells.get(key) ?? 0) + 1);
    }

    for (const [key, count] of cells) {
      const [x, z] = key.split(",").map(Number);
      noteBusiest(dimId, x, z, count);
      if (count > minCount) result.push({ dimId, x, z, count });
    }
  }
  return result;
}

/** ผู้เล่นอยู่ใกล้พื้นที่นี้ไหม */
function isNear(player, cell) {
  if (player.dimension.id.replace("minecraft:", "") !== cell.dimId) return false;
  const m = CONFIG.warnMargin;
  const { x, z } = player.location;
  return (
    x >= cell.x - m && x < cell.x + CONFIG.cellSize + m &&
    z >= cell.z - m && z < cell.z + CONFIG.cellSize + m
  );
}

/** ลบด้วย kill @e[type=item] (เว้นไอเทมที่ติดแท็กเก็บไว้) คืนจำนวนที่ลบ */
function clearCell(cell) {
  const dim = world.getDimension(cell.dimId);
  const size = CONFIG.cellSize;
  const loc = { x: cell.x, y: CONFIG.minY, z: cell.z };
  const vol = { x: size - 1, y: CONFIG.height, z: size - 1 };

  const kept = [];
  let removable = 0;
  for (const item of dim.getEntities({ type: "minecraft:item", location: loc, volume: vol })) {
    if (!valid(item)) continue;
    if (shouldKeep(item)) {
      item.addTag(KEEP_TAG);
      kept.push(item);
    } else {
      removable++;
    }
  }

  const area = `x=${cell.x},y=${CONFIG.minY},z=${cell.z},dx=${size - 1},dy=${CONFIG.height},dz=${size - 1}`;
  try {
    dim.runCommand(`kill @e[type=item,tag=!${KEEP_TAG},${area}]`);
  } catch (e) {}
  for (const t of CONFIG.extraTypes) {
    try {
      dim.runCommand(`kill @e[type=${t},${area}]`);
    } catch (e) {}
  }

  for (const item of kept) {
    try { item.removeTag(KEEP_TAG); } catch (e) {}
  }
  return removable;
}

function startCountdown(cells, full) {
  busy = true;
  let remaining = CONFIG.countdownSec;
  const total = cells.reduce((s, c) => s + c.count, 0);
  const dimIds = new Set(cells.map((c) => c.dimId));

  const id = system.runInterval(() => {
    if (remaining > 0) {
      const urgent = remaining <= 3;
      const color = urgent ? "§c" : "§e";

      for (const p of world.getAllPlayers()) {
        let n = 0;
        if (full) {
          if (!dimIds.has(p.dimension.id.replace("minecraft:", ""))) continue;
          n = total;
        } else {
          const nearby = cells.filter((c) => isNear(p, c));
          if (nearby.length === 0) continue;
          n = nearby.reduce((s, c) => s + c.count, 0);
        }

        const title = full ? "ล้างไอเทมทั้งเซิร์ฟเวอร์" : "ไอเทมบนพื้นเยอะ";
        p.onScreenDisplay.setActionBar(
          `${color}⚠ ${title} (§c${n}${color} ชิ้น) §fจะถูกลบใน §c${remaining} §fวินาที`
        );
        if (urgent) {
          try {
            p.playSound("note.pling", { pitch: remaining === 1 ? 2 : 1.4, volume: 1 });
          } catch (e) {}
        }
      }
      remaining--;
      return;
    }

    system.clearRun(id);
    try {
      doClear(cells);
    } finally {
      busy = false;
    }
  }, 20);
}

/** ลบทันที + บันทึกสถิติ */
function doClear(cells) {
  let removed = 0;
  for (const cell of cells) removed += clearCell(cell);

  STATS.totalRemoved += removed;
  STATS.clears += 1;
  STATS.lastRemoved = removed;
  saveStats();

  if (removed > 0) {
    world.sendMessage(`§a[ล้างไอเทม] §fลบไอเทมบนพื้นแล้ว §7(${removed} ชิ้น)`);
  }
}

/** full = true คือล้างทั้งเซิร์ฟเวอร์ (ไม่สนใจ threshold) */
function runCheck(full = false) {
  if (full) {
    if (busy) return false;
    const cells = findCells(0);
    if (cells.length === 0) return false;
    startCountdown(cells, true);
    return true;
  }
  // เกินเกณฑ์ = ลบทันที ไม่นับถอยหลัง
  const cells = findCells(CONFIG.threshold);
  if (cells.length === 0) return false;
  doClear(cells);
  return true;
}

// ---------- ตั้งเวลา ----------
function scheduleChecks() {
  if (checkRunId !== null) system.clearRun(checkRunId);
  checkRunId = system.runInterval(() => runCheck(false), CONFIG.checkIntervalSec * 20);
}

function scheduleFull() {
  if (fullRunId !== null) system.clearRun(fullRunId);
  fullRunId = null;
  if (CONFIG.fullClearIntervalSec > 0) {
    fullRunId = system.runInterval(() => runCheck(true), CONFIG.fullClearIntervalSec * 20);
  }
}

scheduleChecks();
scheduleFull();
console.warn("[ล้างไอเทม] โหลดสำเร็จ | Script By Prakan");

// ===== คำสั่งในเกม (ต้องเป็น OP / เปิด cheats) =====
// /scriptevent cleaner:check          เช็คพื้นที่ที่เยอะทันที
// /scriptevent cleaner:clearall       ล้างทั้งเซิร์ฟเวอร์ทันที
// /scriptevent cleaner:status         ดูค่าปัจจุบัน
// /scriptevent cleaner:stats          ดูสถิติ
// /scriptevent cleaner:threshold 250  จำนวนไอเทมที่ต้องเกินจึงเริ่มทำงาน
// /scriptevent cleaner:interval 30    รอบเช็ค (วินาที)
// /scriptevent cleaner:countdown 15   เวลานับถอยหลังของการล้างทั้งเซิร์ฟเวอร์ (วินาที)
// /scriptevent cleaner:full 600       รอบล้างทั้งเซิร์ฟเวอร์ (วินาที, 0 = ปิด)
// /scriptevent cleaner:margin 48      ระยะเตือนผู้เล่น (บล็อก)
// /scriptevent cleaner:menu           เปิดเมนูแอดมิน (ฟอร์ม)
// /scriptevent cleaner:giveitem      รับนาฬิกาเมนู (คลิกขวาเพื่อเปิดเมนู)
const SETTERS = {
  "cleaner:threshold": ["threshold", 1, 10000, "จำนวนไอเทมที่ต้องเกิน"],
  "cleaner:interval": ["checkIntervalSec", 1, 3600, "รอบเช็ค (วินาที)"],
  "cleaner:countdown": ["countdownSec", 1, 120, "เวลานับถอยหลังล้างทั้งเซิร์ฟเวอร์ (วินาที)"],
  "cleaner:full": ["fullClearIntervalSec", 0, 86400, "รอบล้างทั้งเซิร์ฟเวอร์ (วินาที, 0 = ปิด)"],
  "cleaner:margin": ["warnMargin", 0, 512, "ระยะเตือนผู้เล่น (บล็อก)"],
};

function reply(ev, msg) {
  const target = ev.sourceEntity;
  if (target && target.typeId === "minecraft:player") target.sendMessage(msg);
  else world.sendMessage(msg);
}

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  const P = "§a[ล้างไอเทม] §f";

  if (ev.id === "cleaner:check") {
    return reply(ev, runCheck(false) ? `${P}ล้างพื้นที่ที่เกินเกณฑ์แล้ว` : `${P}ยังไม่มีพื้นที่ที่ไอเทมเกินเกณฑ์`);
  }

  if (ev.id === "cleaner:clearall") {
    return reply(ev, runCheck(true) ? `${P}เริ่มนับถอยหลังล้างทั้งเซิร์ฟเวอร์` : `${P}ไม่มีไอเทมให้ลบ หรือกำลังนับถอยหลังอยู่`);
  }

  if (ev.id === "cleaner:status") {
    const full = CONFIG.fullClearIntervalSec > 0 ? `${CONFIG.fullClearIntervalSec}s` : "ปิด";
    return reply(
      ev,
      `${P}เกิน=${CONFIG.threshold} ชิ้น, รอบเช็ค=${CONFIG.checkIntervalSec}s, นับถอยหลัง(ล้างทั้งเซิร์ฟเวอร์)=${CONFIG.countdownSec}s\n` +
        `§fล้างทั้งเซิร์ฟเวอร์=${full}, ระยะเตือน=${CONFIG.warnMargin} บล็อก §7| Script By Prakan`
    );
  }

  if (ev.id === "cleaner:stats") {
    const top = STATS.top
      ? `${STATS.top.dimId} X:${STATS.top.x} Z:${STATS.top.z} (${STATS.top.count} ชิ้น)`
      : "ยังไม่มีข้อมูล";
    return reply(
      ev,
      `${P}ลบไปแล้วรวม §e${STATS.totalRemoved} §fชิ้น ใน §e${STATS.clears} §fรอบ\n` +
        `§fรอบล่าสุดลบ §e${STATS.lastRemoved} §fชิ้น\n§fพื้นที่ที่เคยเยอะสุด: §e${top}`
    );
  }

  const setter = SETTERS[ev.id];
  if (!setter) return;
  const [key, min, max, label] = setter;
  const value = parseInt(ev.message, 10);
  if (Number.isNaN(value) || value < min || value > max) {
    return reply(ev, `§c[ล้างไอเทม] ใส่ตัวเลข ${min}-${max} สำหรับ ${label}`);
  }
  CONFIG[key] = value;
  saveConfig();
  if (key === "checkIntervalSec") scheduleChecks();
  if (key === "fullClearIntervalSec") scheduleFull();
  reply(ev, `${P}ตั้ง ${label} = §e${value}`);
});


// ================= เมนูแอดมิน (UI) =================
const MENU_NAME = "§e☰ เมนูล้างไอเทม";
const PFX = "§a[ล้างไอเทม] §f";

function isAdmin(p) {
  try {
    if (typeof p.isOp === "function" && p.isOp()) return true;
    if (p.isOp === true) return true;
  } catch (e) {}
  return p.hasTag("cleaner_admin");
}

const wait = (ticks) => new Promise((resolve) => system.runTimeout(resolve, ticks));

/** แสดงฟอร์ม และลองใหม่ถ้าผู้เล่นเปิดแชต/UI อื่นอยู่ */
async function showForm(form, player) {
  for (let i = 0; i < 30; i++) {
    const res = await form.show(player);
    if (res.canceled && res.cancelationReason === "UserBusy") {
      await wait(10);
      continue;
    }
    return res;
  }
  return null;
}

function snap(v, min, max, step) {
  const s = Math.round((v - min) / step) * step + min;
  return Math.min(max, Math.max(min, s));
}

function statusText() {
  const full = CONFIG.fullClearIntervalSec > 0 ? `ทุก ${CONFIG.fullClearIntervalSec} วินาที` : "ปิด";
  return (
    `§fเกณฑ์: เกิน §e${CONFIG.threshold} §fชิ้น/พื้นที่\n` +
    `§fรอบเช็ค: §e${CONFIG.checkIntervalSec} §fวินาที\n` +
    `§fนับถอยหลัง (ล้างทั้งเซิร์ฟเวอร์): §e${CONFIG.countdownSec} §fวินาที\n` +
    `§fล้างทั้งเซิร์ฟเวอร์: §e${full}\n` +
    `§fระยะเตือนผู้เล่น: §e${CONFIG.warnMargin} §fบล็อก\n\n§7Script By Prakan`
  );
}

function statsText() {
  const top = STATS.top
    ? `${STATS.top.dimId} X:${STATS.top.x} Z:${STATS.top.z} (${STATS.top.count} ชิ้น)`
    : "ยังไม่มีข้อมูล";
  return (
    `§fลบไปแล้วรวม: §e${STATS.totalRemoved} §fชิ้น\n` +
    `§fจำนวนรอบ: §e${STATS.clears}\n` +
    `§fรอบล่าสุดลบ: §e${STATS.lastRemoved} §fชิ้น\n` +
    `§fพื้นที่ที่เคยเยอะสุด: §e${top}`
  );
}

async function openSettings(player) {
  const form = new ModalFormData()
    .title("§lตั้งค่าล้างไอเทม")
    .slider("จำนวนไอเทมที่ต้องเกิน (ต่อพื้นที่)", 50, 1000, 10, snap(CONFIG.threshold, 50, 1000, 10))
    .slider("รอบเช็ค (วินาที)", 1, 60, 1, snap(CONFIG.checkIntervalSec, 1, 60, 1))
    .slider("เวลานับถอยหลังล้างทั้งเซิร์ฟเวอร์ (วินาที)", 3, 60, 1, snap(CONFIG.countdownSec, 3, 60, 1))
    .slider("รอบล้างทั้งเซิร์ฟเวอร์ (วินาที, 0 = ปิด)", 0, 3600, 30, snap(CONFIG.fullClearIntervalSec, 0, 3600, 30))
    .slider("ระยะเตือนผู้เล่น (บล็อก)", 0, 128, 8, snap(CONFIG.warnMargin, 0, 128, 8));

  const res = await showForm(form, player);
  if (!res || res.canceled) return;

  const [th, iv, cd, full, mg] = res.formValues;
  CONFIG.threshold = th;
  CONFIG.checkIntervalSec = iv;
  CONFIG.countdownSec = cd;
  CONFIG.fullClearIntervalSec = full;
  CONFIG.warnMargin = mg;
  saveConfig();
  scheduleChecks();
  scheduleFull();
  player.sendMessage(`${PFX}บันทึกการตั้งค่าแล้ว`);
}

async function openStats(player) {
  const form = new ActionFormData().title("§lสถิติ").body(statsText()).button("กลับ");
  await showForm(form, player);
}

async function openMenu(player) {
  try {
    while (true) {
      const form = new ActionFormData()
        .title("§lเมนูล้างไอเทม")
        .body(statusText())
        .button("ตั้งค่า")
        .button("สถิติ")
        .button("ล้างทันที (เฉพาะที่เกินเกณฑ์)")
        .button("ล้างทั้งเซิร์ฟเวอร์ทันที")
        .button("ปิด");

      const res = await showForm(form, player);
      if (!res || res.canceled) return;

      if (res.selection === 0) await openSettings(player);
      else if (res.selection === 1) await openStats(player);
      else if (res.selection === 2) {
        return player.sendMessage(runCheck(false) ? `${PFX}ล้างพื้นที่ที่เกินเกณฑ์แล้ว` : `${PFX}ยังไม่มีพื้นที่ที่เกินเกณฑ์`);
      } else if (res.selection === 3) {
        return player.sendMessage(runCheck(true) ? `${PFX}เริ่มนับถอยหลังล้างทั้งเซิร์ฟเวอร์` : `${PFX}ไม่มีไอเทมให้ลบ หรือกำลังนับถอยหลังอยู่`);
      } else return;
    }
  } catch (e) {
    console.warn(`[ล้างไอเทม] เปิดเมนูไม่สำเร็จ: ${e}`);
  }
}

// เปิดเมนู / รับไอเทมเมนูผ่านคำสั่ง
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  const p = ev.sourceEntity;
  if (!p || p.typeId !== "minecraft:player") return;

  if (ev.id === "cleaner:menu") {
    openMenu(p);
  } else if (ev.id === "cleaner:giveitem") {
    const item = new ItemStack("minecraft:clock", 1);
    item.nameTag = MENU_NAME;
    item.setLore(["§7คลิกขวาเพื่อเปิดเมนูตั้งค่า (แอดมินเท่านั้น)"]);
    p.getComponent("inventory").container.addItem(item);
    p.sendMessage(`${PFX}ได้รับนาฬิกาเมนูแล้ว`);
  }
});

// คลิกขวานาฬิกาเมนู
world.afterEvents.itemUse.subscribe((ev) => {
  const item = ev.itemStack;
  if (!item || item.typeId !== "minecraft:clock" || item.nameTag !== MENU_NAME) return;
  if (!isAdmin(ev.source)) {
    return ev.source.sendMessage("§c[ล้างไอเทม] เมนูนี้สำหรับแอดมินเท่านั้น");
  }
  openMenu(ev.source);
});
