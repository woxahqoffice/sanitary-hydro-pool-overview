#!/bin/bash
# ดับเบิลคลิกเพื่อเปิดเว็บไซต์ระบบน้ำ 2 อาคาร (ปิดหน้าต่าง Terminal เพื่อหยุด)
cd "$(dirname "$0")"
PORT=8765
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT+1)); done
( sleep 1; open "http://localhost:$PORT/index.html" ) &
echo "เว็บไซต์ทำงานที่ http://localhost:$PORT  (กด Ctrl+C เพื่อหยุด)"
python3 -m http.server $PORT
