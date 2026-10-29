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
// Keep the walkthrough on the page: offer WhatsApp/SMS in the panel instead of opening them
await ctx.addInitScript(() => { try { if (!localStorage.getItem("daftarna-notify-via")) localStorage.setItem("daftarna-notify-via", "ask"); } catch { /* */ } });

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
  await p.getByLabel("رقم الهاتف").fill(phone);
  await p.getByRole("button", { name: "إرسال رمز التأكيد" }).click();
  await p.getByLabel("رمز التأكيد").fill("123456");
  await p.getByRole("button", { name: "تأكيد" }).click();
  await p.getByLabel("الاسم", { exact: true }).fill(name);
  await p.getByRole("button", { name: "ابدأ الآن" }).click();
  await p.locator(".wrap").waitFor({ state: "attached" });
}

// ───────── Sara: sign in ─────────
const sara = await ctx.newPage();
watchErrors(sara, "sara");
await sara.goto(URL);
await sara.getByRole("button", { name: "إرسال رمز التأكيد" }).waitFor();
await shot(sara, "login");

await sara.getByLabel("رقم الهاتف").fill("123");
await sara.getByRole("button", { name: "إرسال رمز التأكيد" }).click();
check(await sara.getByText("الرقم غير صحيح").isVisible(), "rejects an invalid phone number");

await sara.getByLabel("رقم الهاتف").fill("0791111111");
await sara.getByRole("button", { name: "إرسال رمز التأكيد" }).click();
await sara.getByLabel("رمز التأكيد").fill("000000");
await sara.getByRole("button", { name: "تأكيد" }).click();
check(await sara.getByText("الرمز غير صحيح").isVisible(), "rejects a wrong code");

await sara.getByLabel("رمز التأكيد").fill("123456");
await sara.getByRole("button", { name: "تأكيد" }).click();
await sara.getByLabel("الاسم", { exact: true }).fill("سارة");
await shot(sara, "name");
await sara.getByRole("button", { name: "ابدأ الآن" }).click();
await sara.locator(".gtile.new").waitFor();
await shot(sara, "empty-home");
check(true, "sign-in flow");

// ───────── Add friends and a manual entry ─────────
const tab = (p, name) => p.getByRole("navigation").getByRole("button", { name }).click();
await tab(sara, /جهات الاتصال/);
for (const [name, phone] of [["أحمد", "0782222222"], ["لينا", "077 333 3333"]]) {
  await sara.getByRole("button", { name: "إضافة صديق" }).click();
  await sara.getByLabel("الاسم", { exact: true }).fill(name);
  await sara.getByLabel("رقم الهاتف", { exact: true }).fill(phone);
  if (name === "أحمد") await shot(sara, "add-friend");
  await sara.getByRole("button", { name: "حفظ", exact: true }).click();
  await sara.getByRole("dialog").getByRole("heading", { name }).waitFor();
  if (name === "لينا") break;

  await sara.getByRole("button", { name: /لي عنده/ }).click();
  await sara.getByLabel("المبلغ (د.أ)").fill("10");
  await sara.getByLabel("البيان").fill("تكسي");
  await sara.getByRole("button", { name: "تسجيل", exact: true }).click();
  await sara.getByText("ليس لديه التطبيق. هل تريد إبلاغه؟").waitFor();
  const href = await sara.getByRole("dialog").getByRole("link", { name: "إرسال عبر واتساب" }).getAttribute("href");
  check(href.startsWith("https://wa.me/962782222222?text="), "WhatsApp link uses the international number", `bad WhatsApp link: ${href}`);
  await shot(sara, "friend-after-entry");
  await sara.getByRole("button", { name: "حسنًا" }).click();
  await sara.getByRole("button", { name: /💬 إضافة تعليق/ }).first().click();
  await sara.getByLabel(/اكتب تعليق/).fill("رجّعهم الخميس 🙏");
  await sara.getByRole("button", { name: "إرسال", exact: true }).click();
  await sara.locator(".bubble.mine", { hasText: "رجّعهم الخميس" }).waitFor();
  await shot(sara, "comment");
  check(true, "can comment on an entry");
  await sara.getByRole("button", { name: "إغلاق" }).click();
}
await sara.getByRole("button", { name: "إغلاق" }).click();
await shot(sara, "home-two-friends");
const friendRow = await text(sara, ".frow:has-text('أحمد') .cmeta");
check(friendRow.includes("078 222 2222"), "contacts list shows Ahmad's number", `row: ${friendRow}`);
check((await sara.locator(".frow:has-text('لينا')").count()) === 1, "friends tab lists Lina too");
await tab(sara, /ملخص الحساب/);
const ahmadRow = await text(sara, ".acc.in .row:has-text('أحمد') .bal");
check(ahmadRow.includes("١٠ د.أ"), "Ahmad is under 'owed to me' with his amount", `Ahmad's row: ${ahmadRow}`);
check((await text(sara, ".acc.in .acc-sum")).includes("١٠"), "total owed to me");
await tab(sara, /مجموعاتي/);

// ───────── Create a group and add both friends ─────────
await sara.locator(".gtile.new").click();
await sara.getByLabel("اسم المجموعة").fill("الشلة");
await sara.getByRole("radio", { name: "🍕" }).click();
await shot(sara, "new-group");
await sara.getByRole("button", { name: "إنشاء المجموعة" }).click();
await sara.getByRole("dialog").getByRole("heading", { name: "الشلة" }).waitFor();
check(await sara.getByRole("button", { name: "أضف شخصًا لتقسيم الفاتورة" }).isDisabled(), "can't split in a group with nobody else");
const inviteUrl = "http://" + (await text(sara, ".invite-link"));
check(/[?&]join=/.test(inviteUrl), "group has an invite link", `invite link: ${inviteUrl}`);
for (const [name, phone] of [["أحمد", "0782222222"], ["لينا", "0773333333"]]) {
  await sara.getByRole("button", { name: "+ إضافة", exact: true }).click();
  await sara.getByLabel("الاسم", { exact: true }).fill(name);
  await sara.getByLabel("رقم الهاتف", { exact: true }).fill(phone);
  await sara.getByRole("button", { name: "حفظ", exact: true }).click();
  await sara.getByRole("dialog").getByRole("heading", { name: "الشلة" }).waitFor();
}
await shot(sara, "group");
check((await sara.getByRole("dialog").locator(".row").count()) === 3, "group lists me and the two friends");

// ───────── Split a bill inside the group ─────────
await sara.getByRole("dialog").getByRole("button", { name: "إضافة عملية" }).click();
await shot(sara, "operation-types");
check((await sara.locator(".op-type").count()) === 4, "four operation types: bill, gift, trip, shared expense");
await sara.locator(".op-type", { hasText: "فاتورة" }).click();
await shot(sara, "split-source");
await noHorizontalScroll(sara, "split source");
const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
await sara.locator("input[type=file]").nth(1).setInputFiles({ name: "bill.png", mimeType: "image/png", buffer: onePixelPng });
await sara.getByText("جارٍ قراءة الفاتورة").first().waitFor();
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

await sara.getByRole("button", { name: "التالي: الحاضرون" }).click();
check(await sara.getByRole("button", { name: "أحمد", exact: true }).getAttribute("aria-pressed") === "true", "group members start as present");
await sara.getByRole("button", { name: "+ شخص جديد" }).click();
await sara.getByLabel("الاسم", { exact: true }).fill("عمر");
await sara.getByLabel("رقم الهاتف", { exact: true }).fill("0794444444");
await sara.getByRole("button", { name: "إضافة", exact: true }).click();
await shot(sara, "split-people");
await sara.getByRole("button", { name: "التالي: من طلب ماذا" }).click();
await shot(sara, "split-assign-empty");

const item = (n) => sara.locator(".assign", { hasText: n });
await item("شاورما").getByRole("button", { name: "أنا" }).click();
await item("شاورما").getByRole("button", { name: "أحمد" }).click();
await item("Fattoush").getByRole("button", { name: "الجميع" }).click();
await item("حمص").getByRole("button", { name: "لينا" }).click();
await item("حمص").getByRole("button", { name: "عمر" }).click();
await sara.getByRole("button", { name: /متبقٍّ/ }).click();
check((await sara.locator(".assign.missing").count()) === 2, "highlights unassigned items");
await item("Mixed Grill").getByRole("button", { name: "عمر" }).click();
await item("ليمون").getByRole("button", { name: "الجميع" }).click();
await shot(sara, "split-assign");
await noHorizontalScroll(sara, "who had what");

await sara.getByRole("button", { name: "التالي: حصة كل شخص" }).click();
await shot(sara, "split-summary");
const shares = await sara.locator(".share-row .amt").allInnerTexts();
const sum = shares.map(toFils).reduce((a, b) => a + b, 0);
check(sum === 32857, `on-screen shares add up to the bill (${shares.join(" + ")})`, `shares sum to ${sum}, expected 32857`);
await sara.getByRole("button", { name: "تأكيد وتسجيل" }).click();
await sara.getByRole("heading", { name: "تم التسجيل ✓" }).waitFor();
await shot(sara, "split-done");
const waButtons = await sara.getByRole("link", { name: /إرسال واتساب إلى/ }).count();
check(waButtons === 3, "WhatsApp button for each of the three", `WhatsApp buttons: ${waButtons}`);
await sara.getByRole("button", { name: "عرض ملخص الحساب" }).click();
await sara.locator(".acc.in .row").first().waitFor();
const owedRows = await sara.locator(".acc.in .row").allInnerTexts();
check(["أحمد", "لينا", "عمر"].every((n) => owedRows.some((r) => r.includes(n))), "after the split, the accounts tab lists everyone who owes me", `rows: ${owedRows.join(" | ")}`);

// ───────── Group order: write who wants what, then the bill assigns itself ─────────
await tab(sara, /مجموعاتي/);
await sara.locator(".gtile", { hasText: "الشلة" }).click();
await sara.getByRole("button", { name: /^🛒 طلب$/ }).click();
await sara.getByLabel(/طلب أنا/).fill("شاورما");
await sara.getByLabel("طلب أحمد").fill("شاورما وليمون");
await sara.getByLabel("طلب لينا").fill("فتوش وحمص ومشاوي");
await sara.getByLabel("طلب لينا").blur();
await sara.waitForTimeout(300);
await shot(sara, "order");
await sara.getByRole("button", { name: /رفع الفاتورة/ }).click();
await sara.locator("input[type=file]").nth(1).setInputFiles({ name: "bill.png", mimeType: "image/png", buffer: onePixelPng });
await sara.getByRole("heading", { name: "الأصناف" }).waitFor();
check(await sara.getByText("طابقنا الأصناف مع الطلبات").isVisible(), "says the items were matched to the order");
await sara.getByRole("button", { name: "التالي: الحاضرون" }).click();
check((await sara.locator(".people .pchip[aria-pressed=true]").count()) === 3, "everyone who ordered starts as present");
await sara.getByRole("button", { name: "التالي: من طلب ماذا" }).click();
await shot(sara, "order-assign");
const pressed = async (item, who) => (await sara.locator(".assign", { hasText: item }).getByRole("button", { name: who, exact: true }).getAttribute("aria-pressed")) === "true";
check(await pressed("شاورما", "أنا") && await pressed("شاورما", "أحمد") && await pressed("Mixed Grill", "لينا") && await pressed("ليمون", "أحمد"),
  "each item is already assigned to whoever ordered it");
check((await sara.getByRole("button", { name: /متبقٍّ/ }).count()) === 0, "nothing left to assign");
await sara.getByRole("button", { name: "التالي: حصة كل شخص" }).click();
await sara.getByRole("button", { name: "تأكيد وتسجيل" }).click();
await sara.getByRole("button", { name: "عرض ملخص الحساب" }).click();
await tab(sara, /مجموعاتي/);
await sara.locator(".gtile", { hasText: "الشلة" }).click();
check((await sara.getByRole("dialog").locator(".orders .row").count()) === 0, "the order closes once its bill is recorded");

// ───────── Outing: everyone writes what they paid, split equally among those who came ─────────
await shot(sara, "group-foot");
await sara.getByRole("button", { name: "إضافة عملية" }).click();
await sara.locator(".op-type", { hasText: "طلعة أو رحلة" }).click();
await sara.getByRole("button", { name: /دفع أكثر من شخص/ }).click();
await sara.getByLabel("اسم الطلعة").fill("مزرعة دبين");
await sara.getByLabel("اسم الطلعة").blur();
await sara.getByLabel(/ما دفعه أنا/).fill("40 مزرعة + 20 لحمة");
check(await sara.getByText("المجموع: ٦٠").first().isVisible(), "itemized amounts are added up as you type");
await sara.getByLabel("ما دفعه أحمد").fill("30");
await sara.getByLabel("ما دفعه أحمد").blur();
await sara.locator(".paid-line", { hasText: "لينا" }).getByRole("button", { name: "لم يحضر" }).click();
await sara.waitForTimeout(300);
check(await sara.locator(".paid-line.off", { hasText: "لينا" }).isVisible(), "someone can be marked as not coming");
await shot(sara, "outing");
await sara.getByRole("button", { name: /احسب الطلعة/ }).click();
check((await sara.locator(".outing-row input:checked").count()) === 2, "only people who wrote an amount start as present");
const ahmadRel = await sara.locator(".outing-row", { hasText: "أحمد" }).locator(".rel").innerText();
check(/يدفع لك ١٥/.test(ahmadRel), "90 split on two: Ahmad owes me 15", ahmadRel);
check(/لك ١٥/.test(await sara.locator(".my-outing").innerText()), "my own share card shows I get 15 back");
check(await sara.getByRole("heading", { name: "احسب الطلعة" }).isVisible(), "calc step is open");
await shot(sara, "outing-calc");
await sara.getByRole("button", { name: "اعتماد الحسبة" }).click();
await sara.getByText("سُجّلت المبالغ في ملخص الحساب").waitFor();
check((await sara.locator(".share-row").count()) === 1, "a message for each other attendee");
check((await sara.locator(".share-row a").first().getAttribute("href")).includes(encodeURIComponent("مزرعة دبين")), "the message uses the outing's new name");
await sara.getByRole("button", { name: "عرض ملخص الحساب" }).click();
await sara.getByRole("dialog", { name: "الشلة" }).waitFor();
await sara.waitForTimeout(300);
check((await sara.getByRole("dialog").locator(".orders .row").count()) === 0, "the outing closes once it's calculated");

// ───────── Group gift: one payer, the recipient doesn't contribute ─────────
await sara.getByRole("button", { name: "إضافة عملية" }).click();
await sara.locator(".op-type", { hasText: "هدية جماعية" }).click();
await sara.getByLabel("اسم العملية").fill("عيد ميلاد");
await sara.getByLabel(/المبلغ الكلي/).fill("10.001");
await sara.getByRole("button", { name: "التالي", exact: true }).click();
check(await sara.locator(".pchip[aria-pressed=true]", { hasText: "أنا" }).isVisible(), "I'm the payer by default");
await sara.getByRole("button", { name: "التالي", exact: true }).click();
await sara.locator(".pchip", { hasText: "لينا" }).click();
await sara.getByRole("button", { name: "التالي", exact: true }).click();
check(await sara.getByRole("button", { name: "التالي", exact: true }).isDisabled(), "nobody is selected until I choose");
check((await sara.locator(".pchip", { hasText: "لينا" }).count()) === 0, "the gift's recipient isn't offered as a contributor");
await sara.getByRole("button", { name: "تحديد الكل" }).click();
await shot(sara, "gift-people");
await sara.getByRole("button", { name: "التالي", exact: true }).click();
check(await sara.getByText(/فرق التقريب: ١ فلس/).isVisible(), "shows the 1 fils rounding difference");
await sara.getByRole("button", { name: /تحديد مبلغ لكل شخص/ }).click();
await sara.getByLabel("حصة أحمد").fill("4");
check(await sara.locator(".warn", { hasText: "بقي" }).isVisible(), "custom amounts must add up to the total");
await sara.getByLabel("حصة أنا").fill("6.001");
await sara.getByRole("button", { name: "مراجعة العملية" }).click();
check(/لك ٤ د\.أ/.test(await sara.locator(".my-outing").innerText()), "review shows how my balance changes");
check(await sara.getByText(/الهدية إلى: لينا/).isVisible(), "review names the recipient");
await shot(sara, "gift-review");
await sara.getByRole("button", { name: "حفظ العملية" }).click();
await sara.getByText("تم تسجيل العملية بنجاح").first().waitFor();
check((await sara.locator(".share-row").count()) === 1, "only Ahmad owes for the gift");
check((await sara.locator(".share-row a").first().getAttribute("href")).includes(encodeURIComponent("هدية إلى لينا")), "the message says it's a gift for Lina");
await sara.getByRole("button", { name: "عرض ملخص الحساب" }).click();
await sara.getByRole("navigation").waitFor();
await tab(sara, /مجموعاتي/);
await sara.locator(".gtile", { hasText: "الشلة" }).click();
await sara.getByRole("button", { name: "إغلاق" }).click();
await tab(sara, /ملخص الحساب/);
await shot(sara, "home-after-split");
check((await sara.getByRole("button", { name: /تذكير/ }).count()) === 0, "no reminder button on the summary tab");
await tab(sara, /جهات الاتصال/);
await sara.getByRole("button", { name: /📣/ }).click();
check(await sara.getByRole("dialog").getByText("أحمد").first().isVisible(), "reminders live on the contacts tab");
await shot(sara, "remind");
await sara.getByRole("button", { name: "إغلاق" }).click();
await shot(sara, "contacts-tab");
await tab(sara, /ملخص الحساب/);
await noHorizontalScroll(sara, "home");

// ───────── Ahmad, in a second tab ─────────
const ahmad = await ctx.newPage();
watchErrors(ahmad, "ahmad");
await ahmad.goto(URL);
await ahmad.locator(".wrap").waitFor();
await ahmad.getByRole("button", { name: "الإعدادات" }).click();
await ahmad.getByRole("button", { name: "تسجيل الخروج" }).click();
await signIn(ahmad, "+962 78 222 2222", "أحمد");
await shot(ahmad, "ahmad-home");
await tab(ahmad, /مجموعاتي/);
check((await ahmad.locator(".gtile", { hasText: "الشلة" }).count()) === 1, "Ahmad sees the group he was added to");
await tab(ahmad, /ملخص الحساب/);
await ahmad.locator(".acc.out .acc-more").click();
await shot(ahmad, "ahmad-accounts");
const saraForAhmad = await text(ahmad, ".acc.out .row:has-text('سارة')").catch(() => "");
check(saraForAhmad.length > 0, "Ahmad sees Sara under 'I owe'", `Ahmad sees: ${saraForAhmad}`);
check((await ahmad.locator(".acc .row .who b", { hasText: /^لينا$/ }).count()) === 0, "Ahmad sees Lina from the group, but not her entries with Sara");

await ahmad.locator(".row:has-text('سارة')").click();
await shot(ahmad, "ahmad-friend");
await ahmad.getByRole("button", { name: /💬 تعليق/ }).first().click();
check(await ahmad.locator(".bubble", { hasText: "رجّعهم الخميس" }).isVisible(), "the other side sees the comment");
await ahmad.getByLabel(/اكتب تعليق/).fill("أكيد");
await ahmad.getByRole("button", { name: "إرسال", exact: true }).click();
await ahmad.locator(".bubble.mine", { hasText: "أكيد" }).waitFor();
await ahmad.getByRole("button", { name: /تسوية الحساب/ }).click();
await ahmad.getByRole("button", { name: "نعم، سوِّ الحساب" }).click();
await ahmad.locator(".big-bal .amt.zero").waitFor();
await shot(ahmad, "ahmad-settled");

await sara.bringToFront();
const notified = await sara.locator(".toast.push").first().waitFor({ timeout: 4000 }).then(() => true, () => false);
check(notified, "Sara gets a notification when Ahmad settles");
await shot(sara, "sara-notified");
await tab(sara, /ملخص الحساب/);
check((await sara.locator(".acc .row:has-text('أحمد')").count()) === 0, "once settled, Ahmad leaves Sara's owed lists");

// ───────── Reverse an entry ─────────
await sara.locator(".row:has-text('لينا')").click();
const before = await text(sara, ".big-bal");
await sara.getByRole("button", { name: "إلغاء" }).first().click();
await sara.getByRole("button", { name: "نعم، ألغِها" }).click();
await sara.waitForTimeout(400);
check((await sara.locator(".entry.void").count()) === 1, "a reversed entry stays in history, struck through");
await shot(sara, "sara-lina-reversal");
check((await text(sara, ".big-bal")) !== before, "balance updates after the reversal");
await sara.getByRole("button", { name: "إغلاق" }).click();

// ───────── Dark mode and a small screen ─────────
await sara.emulateMedia({ colorScheme: "dark" });
await shot(sara, "dark-home");
await sara.locator(".row").first().click();
await shot(sara, "dark-friend");
await sara.getByRole("button", { name: "إغلاق" }).click();
await tab(sara, /مجموعاتي/);
await sara.locator(".gtile", { hasText: "الشلة" }).click();
await shot(sara, "dark-group");

await sara.setViewportSize({ width: 320, height: 640 });
await sara.getByRole("button", { name: "إغلاق" }).click();
await sara.emulateMedia({ colorScheme: "light" });
await shot(sara, "small-home");
await noHorizontalScroll(sara, "320px screen");

// ───────── Join a group from the invite link ─────────
const rana = await ctx.newPage();
watchErrors(rana, "rana");
await rana.goto(URL);
await rana.getByRole("button", { name: "الإعدادات" }).click();
await rana.getByRole("button", { name: "تسجيل الخروج" }).click();
await rana.goto(inviteUrl);
check(await rana.getByText("تمت دعوتك إلى مجموعة").isVisible(), "invite link mentions the group on the sign-in screen");
await signIn(rana, "0795555555", "رنا");
await rana.getByRole("dialog").getByRole("heading", { name: "الشلة" }).waitFor();
await shot(rana, "join");
await rana.getByRole("button", { name: "الانضمام إلى المجموعة" }).click();
await rana.getByRole("dialog").locator(".row", { hasText: "أحمد" }).waitFor();
check((await rana.getByRole("dialog").locator(".row").count()) === 4, "after joining, Rana sees all 4 members");
await shot(rana, "joined");

check(errors.length === 0, "no console errors", `console errors:\n${errors.join("\n")}`);
await browser.close();
