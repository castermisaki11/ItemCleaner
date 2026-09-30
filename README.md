# Item Cleaner (Minecraft Bedrock Addon)

ลบไอเทมบนพื้นอัตโนมัติเมื่อรวมกันเยอะเกินไป พร้อมนับถอยหลังเตือนผู้เล่นบน action bar

- `manifest.json` — format_version 2 · script module (JavaScript) · `@minecraft/server` 1.15.0 · min_engine_version 1.21.0
- `scripts/main.js` — ตัว addon ทั้งหมด (ไม่มี dependency อื่น)

## หลักการ

1. ทุก ๆ `checkIntervalSec` วินาที สแกน item entity ทั้ง 3 มิติ (`overworld`, `nether`, `the_end`)
2. แบ่งพื้นที่เป็นเซลล์ขนาด `cellSize` × `cellSize` บล็อก แล้วนับไอเทมต่อเซลล์
3. เซลล์ไหนมีไอเทม `>= threshold` ชิ้น → เริ่มนับถอยหลัง `countdownSec` วินาที
4. ระหว่างนับถอยหลัง ผู้เล่นที่อยู่ใกล้เซลล์นั้น (ระยะ `warnMargin` บล็อก) เห็นข้อความบน action bar
5. หมดเวลา → `kill @e[type=item,...]` เฉพาะในเซลล์นั้น แล้วแจ้งในแชท

## ค่าตั้งต้น

| ค่า | ค่าเริ่มต้น | คำอธิบาย |
|---|---:|---|
| `checkIntervalSec` | 60 | เช็คทุกกี่วินาที |
| `threshold` | 100 | ไอเทมในพื้นที่ >= ค่านี้ ถือว่าเยอะ |
| `countdownSec` | 10 | นับถอยหลังก่อนลบ (วินาที) |
| `cellSize` | 64 | ขนาดเซลล์นับ (บล็อก) |
| `warnMargin` | 32 | เตือนผู้เล่นในพื้นที่ + ระยะขอบนี้ (บล็อก) |

ค่าที่แก้ผ่านคำสั่งในเกมถูกบันทึกด้วย dynamic property `cleaner:config` → **อยู่ข้าม session** (ค่า `cellSize`/`minY`/`height`/`dimensions` แก้ได้ในไฟล์เท่านั้น)

## คำสั่งในเกม (ต้องเป็น OP / เปิด cheats)

| คำสั่ง | ผล |
|---|---|
| `/scriptevent cleaner:check` | เช็คทันที |
| `/scriptevent cleaner:status` | ดูค่าปัจจุบัน |
| `/scriptevent cleaner:threshold 150` | จำนวนไอเทมขั้นต่ำ (1–10000) |
| `/scriptevent cleaner:interval 30` | รอบเช็ค วินาที (5–3600) |
| `/scriptevent cleaner:countdown 15` | เวลานับถอยหลัง วินาที (1–120) |
| `/scriptevent cleaner:margin 48` | ระยะเตือนผู้เล่น บล็อก (0–512) |

## ติดตั้ง

1. บีบอัดโฟลเดอร์นี้เป็น `.mcaddon` (หรือ zip) แล้วเปิดด้วย Minecraft
2. หรือแตกไฟล์ไปไว้ที่ `development_*_packs` / resource+behavior pack ของ world แล้วเปิดสคริปต์แพกใน world settings
3. ต้องเปิด **Beta APIs** ถ้าใช้เวอร์ชันเกมที่ยังบังคับอยู่

## โน้ต

- ตอน `busy` (กำลังนับถอยหลัง) จะไม่เริ่มรอบเช็คใหม่ซ้ำ
- คำสั่ง `kill` จำกัดด้วย `dx/dy/dz` จาก minY = -64 สูง 384 → ครอบคลุมทั้งคอลัมน์ในเซลล์
