import { pathToFileURL } from "node:url";
import { openDb, closeDb } from "./db.js";
import { config } from "../config.js";
import { Clock } from "../core/clock.js";

function isoAt(dateKey, time = "12:00:00") {
  return `${dateKey}T${time}+08:00`;
}

function shiftDays(clock, days) {
  const d = clock.now();
  d.setDate(d.getDate() + days);
  return clock.dateKey(d);
}

function shiftMonth(clock, months) {
  const d = clock.now();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return clock.dateKey(d);
}

export function seedDatabase(db, clock = new Clock(config.demoNow), { force = false } = {}) {
  const existing = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (existing > 0 && !force) return { seeded: false, users: existing };

  const now = clock.nowIso();
  const today = clock.todayKey();
  const lastMonth = shiftMonth(clock, -1);

  const insertUser = db.prepare(
    "INSERT INTO users(id, name, phone, role, totp_secret, daily_limit_cents, created_at) VALUES(?,?,?,?,?,?,?)",
  );
  insertUser.run("user_1001", "林晓", "13800001111", "customer", "JBSWY3DPEHPK3PXP", 5000000, now);
  insertUser.run("user_1002", "陈默", "13800002222", "customer", "GEZDGNBVGY3TQOJQ", 5000000, now);
  insertUser.run("ops_1", "运营安全员", "13800003333", "operator", "MFRGGZDFMZTWQ2LK", 0, now);

  const insertAccount = db.prepare(
    "INSERT INTO accounts(id, user_id, name, balance_cents, status, currency, created_at) VALUES(?,?,?,?,?,?,?)",
  );
  insertAccount.run("acc_1001", "user_1001", "活期账户", 2000000, "active", "CNY", now);
  insertAccount.run("acc_1002", "user_1002", "活期账户", 1500000, "active", "CNY", now);
  insertAccount.run("acc_settlement", "__bank__", "银行结算户", 0, "active", "CNY", now);

  const insertPayee = db.prepare(
    "INSERT INTO payees(id, user_id, name, phone, bank, account_no_masked, risk_level, status, created_at) VALUES(?,?,?,?,?,?,?,?,?)",
  );
  const old = isoAt(shiftDays(clock, -180), "12:00:00");
  const recent = isoAt(shiftDays(clock, -10), "12:00:00");
  insertPayee.run("payee_88", "user_1001", "张伟", "13900002222", "招商银行", "**** 6789", "low", "active", old);
  insertPayee.run("payee_89", "user_1001", "李娜", "13700003333", "工商银行", "**** 1234", "low", "active", old);
  insertPayee.run("payee_90", "user_1001", "妈妈", "13600004444", "建设银行", "**** 8888", "low", "active", old);
  insertPayee.run("payee_91", "user_1001", "王强", "13500005555", "农业银行", "**** 4321", "medium", "active", recent);
  insertPayee.run("payee_blocked", "user_1001", "可疑账户", "13000009999", "未知", "**** 0000", "high", "blocked", old);
  insertPayee.run("payee_92", "user_1002", "张伟", "13900002222", "招商银行", "**** 6789", "low", "active", old);

  const insertBill = db.prepare(
    "INSERT INTO bills(id, user_id, merchant, category, amount_cents, occurred_at, note) VALUES(?,?,?,?,?,?,?)",
  );
  const bills = [
    [3, "星巴克", "餐饮", 4200, "09:20", "早餐"],
    [4, "海底捞", "餐饮", 28600, "19:30", "朋友聚餐"],
    [5, "美团外卖", "餐饮", 3800, "12:10", ""],
    [6, "瑞幸咖啡", "餐饮", 1900, "08:40", ""],
    [7, "肯德基", "餐饮", 5600, "18:00", ""],
    [8, "盒马鲜生", "餐饮", 12800, "20:15", "家庭采购"],
    [9, "地铁", "交通", 600, "08:00", ""],
    [10, "滴滴出行", "交通", 3400, "22:10", ""],
    [11, "中石化", "交通", 30000, "17:00", "加油"],
    [12, "高铁票", "交通", 55300, "10:00", "出差"],
    [13, "京东", "购物", 89900, "21:30", "耳机"],
    [14, "优衣库", "购物", 39900, "15:20", "衣物"],
    [15, "淘宝", "购物", 66800, "23:40", "家居"],
    [16, "山姆会员店", "购物", 52000, "11:00", ""],
    [17, "房租", "居住", 300000, "09:00", "月租"],
    [18, "电影票", "娱乐", 9800, "20:00", ""],
    [19, "视频会员", "娱乐", 2500, "10:00", "自动续费"],
    [20, "健身房", "娱乐", 29900, "19:00", "月卡"],
    [21, "药店", "医疗", 6800, "16:30", ""],
    [22, "便利店", "餐饮", 2300, "23:50", ""],
    [23, "未知商户", "购物", 88800, "03:12", "凌晨大额"],
    [24, "某电商", "购物", 19900, "12:00", "重复扣款 A"],
    [24, "某电商", "购物", 19900, "12:00", "重复扣款 B"],
    [26, "咖啡店", "餐饮", 3200, "09:10", ""],
  ];
  let i = 0;
  for (const [day, merchant, category, amount, time, note] of bills) {
    i += 1;
    insertBill.run(`bill_${String(i).padStart(3, "0")}`, "user_1001", merchant, category, amount, isoAt(`${lastMonth.slice(0, 8)}${String(day).padStart(2, "0")}`, time), note);
  }

  // 本月两笔，便于“本月账单”
  insertBill.run("bill_101", "user_1001", "便利店", "餐饮", 1800, isoAt(today, "08:30"), "本月");
  insertBill.run("bill_102", "user_1001", "滴滴出行", "交通", 2600, isoAt(today, "09:10"), "本月");

  const insertCard = db.prepare(
    "INSERT INTO cards(id, user_id, name, status, limit_cents, created_at) VALUES(?,?,?,?,?,?)",
  );
  insertCard.run("card_1001", "user_1001", "磐石白金卡", "active", 500000, now);
  insertCard.run("card_1002", "user_1002", "磐石金卡", "active", 300000, now);

  const insertSub = db.prepare(
    "INSERT INTO subscriptions(id, user_id, merchant, amount_cents, next_charge_at, status) VALUES(?,?,?,?,?,?)",
  );
  insertSub.run("sub_01", "user_1001", "视频会员", 2500, isoAt(shiftDays(clock, 5), "10:00"), "active");
  insertSub.run("sub_02", "user_1001", "云存储", 1200, isoAt(shiftDays(clock, 8), "10:00"), "active");

  const insertCalendar = db.prepare(
    "INSERT INTO calendar_events(id, user_id, title, event_date, consent, created_at) VALUES(?,?,?,?,?,?)",
  );
  insertCalendar.run("evt_birthday", "user_1001", "爱人生日", shiftDays(clock, 8), 0, now);

  db.prepare(
    "INSERT INTO system_state(key, value, updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
  ).run("kill_switch", "false", now);

  return { seeded: true, users: 3 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reset = process.argv.includes("--reset");
  const db = openDb({ reset });
  const result = seedDatabase(db, new Clock(config.demoNow), { force: reset });
  console.log(JSON.stringify(result));
  closeDb();
}
