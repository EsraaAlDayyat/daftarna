// End-to-end check of the demo build at phone size (390×844), with screenshots.
//
//   npm run build && npx vite preview --port 4173
//   npm run test:e2e -- http://localhost:4173/ e2e/shots
//
// Uses Playwright's Chromium. Set CHROMIUM_PATH to use a different binary.
// UI selectors are in Arabic because they match the app's labels.
import { chromium } from "@playwright/test";
import fs from "fs";

const URL = process.argv[2] ?? "http://localhost:4173/";
const OUT = process.argv[3] ?? "e2e/shots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: process.env.CHROMIUM_PATH ? ["--no-sandbox"] : [],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ar-JO",
});

const errors = [];
let step = 0;
function check(cond, okMsg, failMsg = okMsg) {
  if (cond) console.log(`✓ ${okMsg}`);
  else { console.error(`✗ ${failMsg}`); process.exitCode = 1; }
}
const shot = async (p, name) => {
  await p.waitForTimeout(350);
  await p.screenshot({ path: `${OUT}/${String(++step).padStart(2, "0")}-${name}.png` });
};
const noHorizontalScroll = async (p, where) => {
  const extra = await p.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll(".sheet")].map((s) => s.scrollWidth)) - innerWidth);
  check(extra <= 1, `no horizontal scroll: ${where}`, `horizontal scroll (${extra}px): ${where}`);
};
const watchErrors = (p, who) => {
  p.on("pageerror", (e) => errors.push(`${who}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error") errors.push(`${who}: ${m.text()}`); });
};
const text = (p, sel) => p.locator(sel).innerText();
const toFils = (s) => Math.round(parseFloat(
  s.replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660).replace("٫", ".").replace(/[^\d.]/g, "")) * 1000);

async function signIn(p, phone, name) {
  await p.getByLabel("رقم تلفونك").fill(phone);
  await p.getByRole("button", { name: "ابعتلي كود" }).click();
  await p.getByLabel("الكود").fill("123456");
  await p.getByRole("button", { name: "تأكيد" }).click();
  await p.getByLabel("اسمك").fill(name);
  await p.getByRole("button", { name: "يلا نبلش" }).click();
  await p.getByRole("heading", { name: "دفترنا" }).waitFor();
}

// ───────── Sara: sign in ─────────
const sara = await ctx.newPage();
watchErrors(sara, "sara");
await sara.goto(URL);
await sara.getByRole("button", { name: "ابعتلي كود" }).waitFor();
await shot(sara, "login");

await sara.getByLabel("رقم تلفونك").fill("123");
await sara.getByRole("button", { name: "ابعتلي كود" }).click();
check(await sara.getByText("الرقم مش مزبوط").isVisible(), "rejects an invalid phone number");

await sara.getByLabel("رقم تلفونك").fill("0791111111");
await sara.getByRole("button", { name: "ابعتلي كود" }).click();
await sara.getByLabel("الكود").fill("000000");
await sara.getByRole("button", { name: "تأكيد" }).click();
check(await sara.getByText("الكود غلط").isVisible(), "rejects a wrong code");

await sara.getByLabel("الكود").fill("123456");
await sara.getByRole("button", { name: "تأكيد" }).click();
await sara.getByLabel("اسمك").fill("سارة");
await shot(sara, "name");
await sara.getByRole("button", { name: "يلا نبلش" }).click();
await sara.getByText("الدفتر فاضي").waitFor();
await shot(sara, "empty-home");
check(true, "sign-in flow");

// ───────── Add friends and a manual entry ─────────
for (const [name, phone] of [["أحمد", "0782222222"], ["لينا", "077 333 3333"]]) {
  await sara.getByRole("button", { name: "صاحب", exact: true }).first().click();
  await sara.getByLabel("الاسم").fill(name);
  await sara.getByLabel("رقم التلفون").fill(phone);
  if (name === "أحمد") await shot(sara, "add-friend");
  await sara.getByRole("button", { name: "احفظ" }).click();
  await sara.getByRole("dialog").getByRole("heading", { name }).waitFor();
  if (name === "لينا") break;

  await sara.getByRole("button", { name: /أعطيته دين/ }).click();
  await sara.getByLabel("المبلغ (د.أ)").fill("10");
  await sara.getByLabel("ملاحظة").fill("تكسي");
  await sara.getByRole("button", { name: "سجّل: أعطيته دين" }).click();
  await sara.getByText("ما عنده التطبيق. بلّغه واتساب؟").waitFor();
  const href = await sara.getByRole("dialog").getByRole("link", { name: "ابعت واتساب" }).getAttribute("href");
  check(href.startsWith("https://wa.me/962782222222?text="), "WhatsApp link uses the international number", `bad WhatsApp link: ${href}`);
  await shot(sara, "friend-after-entry");
  await sara.getByRole("button", { name: "سكّر" }).click();
}
await sara.getByRole("button", { name: "سكّر" }).click();
await shot(sara, "home-two-friends");
const ahmadRow = await text(sara, ".row:has-text('أحمد') .bal");
check(ahmadRow.includes("١٠ د.أ") && ahmadRow.includes("إلك عنده"), "Ahmad's balance on the home list", `Ahmad's row: ${ahmadRow}`);

// ───────── Split a bill ─────────
await sara.getByRole("button", { name: "قسّم فاتورة" }).click();
await shot(sara, "split-source");
await noHorizontalScroll(sara, "split source");
const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
await sara.locator("input[type=file]").nth(1).setInputFiles({ name: "bill.png", mimeType: "image/png", buffer: onePixelPng });
await sara.getByText("عم نقرأ الأصناف").waitFor();
await shot(sara, "split-reading");
await sara.getByRole("heading", { name: "الأصناف" }).waitFor();
await shot(sara, "split-items");
await noHorizontalScroll(sara, "split items");
const total = await text(sara, ".sumline.total");
check(total.includes("٣٢٫٨٥٧"), "sample receipt total is 32.857", `total: ${total}`);

await sara.getByLabel("سعر حمص بيروتي").fill("2");
check(await sara.locator(".warn").isVisible(), "warns when items don't add up to the printed total");
await sara.getByLabel("سعر حمص بيروتي").fill("1.750");
check((await sara.locator(".warn").count()) === 0, "warning clears after the fix");

await sara.getByRole("button", { name: "التالي: مين كان موجود" }).click();
await sara.getByRole("button", { name: "أحمد", exact: true }).click();
await sara.getByRole("button", { name: "لينا", exact: true }).click();
await sara.getByRole("button", { name: "+ حد جديد" }).click();
await sara.getByLabel("الاسم").fill("عمر");
await sara.getByLabel("رقم التلفون").fill("0794444444");
await sara.getByRole("button", { name: "ضيفه" }).click();
await shot(sara, "split-people");
await sara.getByRole("button", { name: "التالي: مين أكل شو" }).click();
await shot(sara, "split-assign-empty");

const item = (n) => sara.locator(".assign", { hasText: n });
await item("شاورما").getByRole("button", { name: "أنا" }).click();
await item("شاورما").getByRole("button", { name: "أحمد" }).click();
await item("Fattoush").getByRole("button", { name: "الكل" }).click();
await item("حمص").getByRole("button", { name: "لينا" }).click();
await item("حمص").getByRole("button", { name: "عمر" }).click();
await sara.getByRole("button", { name: /ضايل/ }).click();
check((await sara.locator(".assign.missing").count()) === 2, "highlights unassigned items");
await item("Mixed Grill").getByRole("button", { name: "عمر" }).click();
await item("ليمون").getByRole("button", { name: "الكل" }).click();
await shot(sara, "split-assign");
await noHorizontalScroll(sara, "who had what");

await sara.getByRole("button", { name: "التالي: الملخص" }).click();
await shot(sara, "split-summary");
const shares = await sara.locator(".share-row .amt").allInnerTexts();
const sum = shares.map(toFils).reduce((a, b) => a + b, 0);
check(sum === 32857, `on-screen shares add up to the bill (${shares.join(" + ")})`, `shares sum to ${sum}, expected 32857`);
await sara.getByRole("button", { name: "أكّد وسجّل بالدفاتر" }).click();
await sara.getByRole("heading", { name: "انسجّلت ✓" }).waitFor();
await shot(sara, "split-done");
const waButtons = await sara.getByRole("link", { name: /ابعت واتساب لـ/ }).count();
check(waButtons === 3, "WhatsApp button for each of the three", `WhatsApp buttons: ${waButtons}`);
await sara.getByRole("button", { name: "تمام" }).click();
await shot(sara, "home-after-split");
await noHorizontalScroll(sara, "home");

// ───────── Ahmad, in a second tab ─────────
const ahmad = await ctx.newPage();
watchErrors(ahmad, "ahmad");
await ahmad.goto(URL);
await ahmad.getByRole("heading", { name: "دفترنا" }).waitFor();
await ahmad.getByRole("button", { name: "الإعدادات" }).click();
await ahmad.getByRole("button", { name: "سجّل خروج" }).click();
await signIn(ahmad, "+962 78 222 2222", "أحمد");
await shot(ahmad, "ahmad-home");
const saraForAhmad = await text(ahmad, ".row").catch(() => "");
check(saraForAhmad.includes("عليك إله"), "Ahmad sees the same entries from his side", `Ahmad sees: ${saraForAhmad}`);
const ahmadPage = await ahmad.evaluate(() => document.body.innerText);
check(!ahmadPage.includes("لينا") && !ahmadPage.includes("عمر"), "Ahmad can't see entries between other people");

await ahmad.locator(".row").first().click();
await shot(ahmad, "ahmad-friend");
await ahmad.getByRole("button", { name: /صفّي الحساب/ }).click();
await ahmad.getByRole("button", { name: "آه، صفّي" }).click();
await ahmad.getByText("خالص ✓").first().waitFor();
await shot(ahmad, "ahmad-settled");

await sara.bringToFront();
const notified = await sara.locator(".toast.push").first().waitFor({ timeout: 4000 }).then(() => true, () => false);
check(notified, "Sara gets a notification when Ahmad settles");
await shot(sara, "sara-notified");
check((await text(sara, ".row:has-text('أحمد') .bal")).includes("خالص"), "Ahmad's balance shows as settled for Sara");

// ───────── Reverse an entry ─────────
await sara.locator(".row:has-text('لينا')").click();
const before = await text(sara, ".big-bal");
await sara.getByRole("button", { name: "إلغاء" }).first().click();
await sara.getByRole("button", { name: "ألغيها" }).click();
await sara.waitForTimeout(400);
check((await sara.locator(".entry.void").count()) === 1, "a reversed entry stays in history, struck through");
await shot(sara, "sara-lina-reversal");
check((await text(sara, ".big-bal")) !== before, "balance updates after the reversal");
await sara.getByRole("button", { name: "سكّر" }).click();

// ───────── Dark mode and a small screen ─────────
await sara.emulateMedia({ colorScheme: "dark" });
await shot(sara, "dark-home");
await sara.locator(".row").first().click();
await shot(sara, "dark-friend");
await sara.getByRole("button", { name: "سكّر" }).click();
await sara.getByRole("button", { name: "قسّم فاتورة" }).click();
await shot(sara, "dark-split");

await sara.setViewportSize({ width: 320, height: 640 });
await sara.getByRole("button", { name: "سكّر" }).click();
await sara.emulateMedia({ colorScheme: "light" });
await shot(sara, "small-home");
await noHorizontalScroll(sara, "320px screen");

check(errors.length === 0, "no console errors", `console errors:\n${errors.join("\n")}`);
await browser.close();
