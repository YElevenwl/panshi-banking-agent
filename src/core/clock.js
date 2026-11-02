const TZ = "Asia/Shanghai";

export class Clock {
  constructor(demoNowIso = null) {
    this.offsetMs = 0;
    this.realStart = Date.now();
    if (demoNowIso) {
      const target = new Date(demoNowIso).getTime();
      if (Number.isFinite(target)) this.offsetMs = target - this.realStart;
    }
  }

  now() {
    return new Date(Date.now() + this.offsetMs);
  }

  nowMs() {
    return this.now().getTime();
  }

  nowIso() {
    return this.now().toISOString();
  }

  todayKey() {
    return Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(this.now());
  }

  dateKey(dateLike) {
    return Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(dateLike));
  }

  advance(ms) {
    this.offsetMs += ms;
    return this.nowIso();
  }

  reset() {
    this.offsetMs = 0;
    this.realStart = Date.now();
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
