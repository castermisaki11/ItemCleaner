import { world, system } from "@minecraft/server";

// ================= ตั้งค่าเริ่มต้น =================
const CONFIG = {
  checkIntervalSec: 60,   // เช็คทุกกี่วินาที
  threshold: 100,         // ไอเทมในพื้นที่ >= ค่านี้ ถือว่าเยอะ
  countdownSec: 10,       // นับถอยหลังก่อนลบ
  cellSize: 64,           // ขนาดพื้นที่ (บล็อก) ที่ใช้แบ่งนับ
  warnMargin: 32,         // เตือนผู้เล่นที่อยู่ในพื้นที่ + ระยะขอบนี้ (บล็อก)
  minY: -64,
  height: 384,
  dimensions: ["overworld", "nether", "the_end"],
};
// ==================================================

const SAVE_KEY = "cleaner:config";
const SAVED_FIELDS = ["checkIntervalSec", "threshold", "countdownSec", "warnMargin"];

// โหลดค่าที่เคยปรับไว้ในเกม
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

let busy = false;
let checkRunId = null;

/** หาพื้นที่ (cell) ที่มีไอเทมเยอะ */
function findHotCells() {
  const hot = [];
  const size = CONFIG.cellSize;

  for (const dimId of CONFIG.dimensions) {
    const dim = world.getDimension(dimId);
    const cells = new Map();

    for (const item of dim.getEntities({ type: "minecraft:item" })) {
      if (!item.isValid()) continue;
      const cx = Math.floor(item.location.x / size) * size;
      const cz = Math.floor(item.location.z / size) * size;
      const key = `${cx},${cz}`;
      cells.set(key, (cells.get(key) ?? 0) + 1);
    }

    for (const [key, count] of cells) {
      if (count >= CONFIG.threshold) {
        const [x, z] = key.split(",").map(Number);
        hot.push({ dimId, x, z, count });
      }
    }
  }
  return hot;
}

/** ผู้เล่นอยู่ใกล้พื้นที่นี้ไหม (อยู่ในพื้นที่ + ระยะขอบ) */
function isNear(player, cell) {
  if (player.dimension.id.replace("minecraft:", "") !== cell.dimId) return false;
  const m = CONFIG.warnMargin;
  const { x, z } = player.location;
  return (
    x >= cell.x - m && x < cell.x + CONFIG.cellSize + m &&
    z >= cell.z - m && z < cell.z + CONFIG.cellSize + m
  );
}

/** ลบไอเทมในพื้นที่ด้วย kill @e[type=item] แบบกำหนดขอบเขต */
function clearCell(cell) {
  const dim = world.getDimension(cell.dimId);
  const d = CONFIG.cellSize - 1;
  try {
    dim.runCommand(
      `kill @e[type=item,x=${cell.x},y=${CONFIG.minY},z=${cell.z},dx=${d},dy=${CONFIG.height},dz=${d}]`
    );
  } catch (e) {}
}

function startCountdown(hotCells) {
  busy = true;
  let remaining = CONFIG.countdownSec;
  const total = hotCells.reduce((s, c) => s + c.count, 0);

  const id = system.runInterval(() => {
    if (remaining > 0) {
      for (const p of world.getAllPlayers()) {
        const nearby = hotCells.filter((c) => isNear(p, c));
        if (nearby.length === 0) continue;
        const n = nearby.reduce((s, c) => s + c.count, 0);
        p.onScreenDisplay.setActionBar(
          `§e⚠ ไอเทมบนพื้นเยอะ (§c${n}§e ชิ้น) §fจะถูกลบใน §c${remaining} §fวินาที`
        );
      }
      remaining--;
      return;
    }

    system.clearRun(id);
    for (const cell of hotCells) clearCell(cell);
    world.sendMessage(`§a[Item Cleaner] §fลบไอเทมบนพื้นแล้ว §7(~${total} ชิ้น)`);
    busy = false;
  }, 20);
}

function runCheck() {
  if (busy) return;
  const hot = findHotCells();
  if (hot.length > 0) startCountdown(hot);
}

function scheduleChecks() {
  if (checkRunId !== null) system.clearRun(checkRunId);
  checkRunId = system.runInterval(runCheck, CONFIG.checkIntervalSec * 20);
}
scheduleChecks();

// ===== คำสั่งในเกม (ต้องเป็น OP / เปิด cheats) =====
// /scriptevent cleaner:check              เช็คทันที
// /scriptevent cleaner:status             ดูค่าปัจจุบัน
// /scriptevent cleaner:threshold 150      ปรับจำนวนไอเทมขั้นต่ำ
// /scriptevent cleaner:interval 30        ปรับรอบเช็ค (วินาที)
// /scriptevent cleaner:countdown 15       ปรับเวลานับถอยหลัง (วินาที)
// /scriptevent cleaner:margin 48          ปรับระยะเตือนผู้เล่น (บล็อก)
const SETTERS = {
  "cleaner:threshold": ["threshold", 1, 10000, "จำนวนไอเทมขั้นต่ำ"],
  "cleaner:interval": ["checkIntervalSec", 5, 3600, "รอบเช็ค (วินาที)"],
  "cleaner:countdown": ["countdownSec", 1, 120, "เวลานับถอยหลัง (วินาที)"],
  "cleaner:margin": ["warnMargin", 0, 512, "ระยะเตือนผู้เล่น (บล็อก)"],
};

function reply(ev, msg) {
  const target = ev.sourceEntity;
  if (target && target.typeId === "minecraft:player") target.sendMessage(msg);
  else world.sendMessage(msg);
}

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id === "cleaner:check") {
    runCheck();
    return reply(ev, "§a[Item Cleaner] §fเริ่มเช็คแล้ว");
  }

  if (ev.id === "cleaner:status") {
    return reply(
      ev,
      `§a[Item Cleaner] §fthreshold=${CONFIG.threshold}, รอบเช็ค=${CONFIG.checkIntervalSec}s, นับถอยหลัง=${CONFIG.countdownSec}s, ระยะเตือน=${CONFIG.warnMargin} บล็อก`
    );
  }

  const setter = SETTERS[ev.id];
  if (!setter) return;
  const [key, min, max, label] = setter;
  const value = parseInt(ev.message, 10);
  if (Number.isNaN(value) || value < min || value > max) {
    return reply(ev, `§c[Item Cleaner] ใส่ตัวเลข ${min}-${max} สำหรับ ${label}`);
  }
  CONFIG[key] = value;
  saveConfig();
  if (key === "checkIntervalSec") scheduleChecks();
  reply(ev, `§a[Item Cleaner] §fตั้ง ${label} = §e${value}`);
});
