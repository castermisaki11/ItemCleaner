# ระบบล้างไอเทมอัตโนมัติ (Item Cleaner)

Minecraft Bedrock addon — ลบไอเทมบนพื้นอัตโนมัติ + ล้างทั้งเซิร์ฟเวอร์ตามรอบ พร้อมเมนูแอดมิน (ฟอร์ม)

> **Script By Prakan** · เวอร์ชัน **1.1.0**

## ไฟล์

- `manifest.json` — format_version 2 · script module (JavaScript) · `@minecraft/server` 1.15.0 + `@minecraft/server-ui` 1.2.0 · min_engine_version 1.21.0
- `scripts/main.js` — ตัว addon ทั้งหมด (ไม่มี dependency อื่น)

## หลักการ

1. **เช็คพื้นที่** ทุก `checkIntervalSec` วินาที (ค่าตั้งต้น 2 วิ) — สแกน item entity ใน `overworld`, `nether`, `the_end` แล้วแบ่งเป็นเซลล์ `cellSize` × `cellSize` บล็อก (64×64)
2. **เกินเกณฑ์ = ลบทันที** — เซลล์ไหนมีไอเทม *มากกว่า* `threshold` ชิ้น (ตั้งต้น 250) → ลบเลย **ไม่นับถอยหลัง**
3. **ล้างทั้งเซิร์ฟเวอร์** ทุก `fullClearIntervalSec` วินาที (ตั้งต้น 600 · `0` = ปิด) → นับถอยหลัง `countdownSec` วินาทีก่อนล้างทุกพื้นที่
4. ระหว่างนับถอยหลัง ผู้เล่นในพื้นที่ (ระยะ `warnMargin` บล็อก) เห็น action bar + เสียง `note.pling` 3 วิสุดท้าย (แดงเมื่อเหลือ ≤ 3)
5. ล้างด้วย `kill @e[type=item,tag=!cleaner_keep,...]` เฉพาะในเซลล์ แล้วนับสถิติ

## ไอเทมที่**ไม่ลบ** (whitelist)

| เงื่อนไข | ค่า |
|---|---|
| `id` มีคำใน `keepIds` | `netherite`, `elytra`, `totem_of_undying`, `shulker_box`, `nether_star`, `enchanted_golden_apple`, `beacon`, `dragon_egg` |
| `keepNamed` | ไอเทมที่ตั้งชื่อ (nameTag) ไว้ |
| `keepLore` | ไอเทมที่มี lore |

ระหว่างสั่ง kill ไอเทมที่ต้องเก็บจะถูกติดแท็ก `cleaner_keep` ชั่วคราว (แล้วเอาออก) เพื่อกันโดนล้างมั่ว

**เป้าหมายที่ลบพร้อมกัน** ในพื้นที่ที่ล้าง: `minecraft:xp_orb`, `minecraft:arrow` (`extraTypes`)

## ค่าตั้งต้น

| ค่า | เริ่มต้น | คำอธิบาย | บันทึกข้าม session |
|---|---:|---|---|
| `checkIntervalSec` | 2 | เช็คพื้นที่ทุกกี่วินาที | ✓ |
| `threshold` | 250 | เกินค่านี้ → ลบเลย | ✓ |
| `countdownSec` | 10 | นับถอยหลังก่อนล้าง**ทั้งเซิร์ฟเวอร์** (วินาที) | ✓ |
| `fullClearIntervalSec` | 600 | รอบล้างทั้งเซิร์ฟเวอร์ (วินาที · 0 = ปิด) | ✓ |
| `warnMargin` | 32 | ระยะเตือนผู้เล่น (บล็อก) | ✓ |
| `cellSize` | 64 | ขนาดเซลล์นับ (บล็อก) | — |
| `minY` / `height` | -64 / 384 | ช่วงสูงที่สแกน/ลบ | — |

ค่าที่บันทึก = dynamic property `cleaner:config` · สถิติ = `cleaner:stats`

## คำสั่งในเกม (ต้องเป็น OP / เปิด cheats)

| คำสั่ง | ผล |
|---|---|
| `/scriptevent cleaner:check` | เช็ค+ล้างพื้นที่ที่เกินเกณฑ์ทันที |
| `/scriptevent cleaner:clearall` | เริ่มนับถอยหลังล้างทั้งเซิร์ฟเวอร์ |
| `/scriptevent cleaner:status` | ดูค่าปัจจุบัน |
| `/scriptevent cleaner:stats` | ดูสถิติ (ลบไปรวม/จำนวนรอบ/รอบล่าสุด/พื้นที่ที่เยอะสุด) |
| `/scriptevent cleaner:threshold 250` | จำนวนไอเทมที่ต้องเกิน (1–10000) |
| `/scriptevent cleaner:interval 30` | รอบเช็ค วินาที (1–3600) |
| `/scriptevent cleaner:countdown 15` | นับถอยหลังล้างทั้งเซิร์ฟเวอร์ วินาที (1–120) |
| `/scriptevent cleaner:full 600` | รอบล้างทั้งเซิร์ฟเวอร์ วินาที (0–86400 · 0 = ปิด) |
| `/scriptevent cleaner:margin 48` | ระยะเตือนผู้เล่น บล็อก (0–512) |
| `/scriptevent cleaner:menu` | เปิดเมนูแอดมิน (ฟอร์ม) |
| `/scriptevent cleaner:giveitem` | รับ **นาฬิกาเมนู** (คลิกขวาเพื่อเปิดเมนู) |

## เมนูแอดมิน (UI)

- `/scriptevent cleaner:giveitem` → ได้ `minecraft:clock` ชื่อ `§e☰ เมนูล้างไอเทม` · คลิกขวาเพื่อเปิดเมนู
- เมนูหลัก: ดูสถานะ · **ตั้งค่า** (slider: เกณฑ์ 50–1000 / รอบเช็ค 1–60 วิ / นับถอยหลัง 3–60 วิ / ล้างทั้งเซิร์ฟ 0–3600 วิ / ระยะเตือน 0–128 บล็อก) · **สถิติ** · ล้างทันที (เฉพาะที่เกินเกณฑ์) · ล้างทั้งเซิร์ฟเวอร์
- เมนูเปิดได้เฉพาะคนที่ **เป็น OP** หรือมีแท็ก **`cleaner_admin`** (`/tag <name> add cleaner_admin`) — คนอื่นคลิกจะขึ้น "เมนูนี้สำหรับแอดมินเท่านั้น"
- ฟอร์มจะ retry อัตโนมัติถ้าผู้เล่นเปิดแชต/UI อื่นอยู่ (`UserBusy`)

## ติดตั้ง

1. บีบอัดโฟลเดอร์นี้เป็น `.mcaddon` (หรือ zip) แล้วเปิดด้วย Minecraft
2. หรือแตกไฟล์ไปไว้ที่ `development_*_packs` / behavior pack ของ world แล้วเปิดสคริปต์แพกใน world settings
3. ต้องเปิด **Beta APIs** ถ้าใช้เวอร์ชันเกมที่ยังบังคับอยู่

## โน้ต

- ตอน `busy` (กำลังนับถอยหลัง) จะไม่เริ่มรอบใหม่ซ้ำ
- คำสั่ง `kill` จำกัดด้วย `dx/dy/dz` จาก minY = -64 สูง 384 → ครอบคลุมทั้งคอลัมน์ในเซลล์
- โหลดเสร็จจะ log ในคอนโซล: `[ล้างไอเทม] โหลดสำเร็จ | Script By Prakan`
