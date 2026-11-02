export function maskPhone(phone) {
  if (!phone) return "";
  const s = String(phone);
  if (s.length < 7) return "***";
  return `${s.slice(0, 3)}****${s.slice(-4)}`;
}

export function maskAccount(accountNo) {
  if (!accountNo) return "";
  const s = String(accountNo).replaceAll(" ", "");
  if (s.length <= 4) return "****";
  return `**** ${s.slice(-4)}`;
}

export function maskPIIInText(text) {
  if (!text) return "";
  return String(text)
    .replaceAll(/(?<!\d)1[3-9]\d{9}(?!\d)/g, (m) => maskPhone(m))
    .replaceAll(/(?<!\d)\d{16,19}(?!\d)/g, (m) => maskAccount(m))
    .slice(0, 2000);
}
