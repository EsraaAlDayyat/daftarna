// Records a short tutorial video of the demo build at phone size, with Arabic captions.
//
//   npm run build && npx vite preview --port 4173
//   node e2e/tutorial.mjs http://localhost:4173/ out-dir
//
// Captures frames over the DevTools screencast and joins them with the system ffmpeg
// into out-dir/tutorial.mp4.
import { chromium } from "@playwright/test";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const URL = process.argv[2] ?? "http://localhost:4173/";
const OUT = process.argv[3] ?? "e2e/video";
fs.mkdirSync(OUT, { recursive: true });

const W = 390, H = 844, BAND = 132;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: process.env.CHROMIUM_PATH ? ["--no-sandbox"] : [],
});
const ctx = await browser.newContext({
  viewport: { width: W, height: H + BAND }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ar-JO",
});
// Same as a real phone: after each entry the SMS app opens with the message ready.
// Chromium can't open sms: links, so the video shows a mock of that screen instead.
await ctx.addInitScript(() => { try { localStorage.setItem("daftarna-notify-via", "sms"); } catch { /* */ }
  // Keep the message for the SMS mock instead of leaving the app
  window.__daftarnaOpenSms = (_url, msg) => { top.__lastSms = msg; };
});

const p = await ctx.newPage();
const wait = (ms) => p.waitForTimeout(ms);

// ── Frame capture ──
const FR = path.join(OUT, "frames");
fs.rmSync(FR, { recursive: true, force: true });
fs.mkdirSync(FR, { recursive: true });
const frames = []; // [file, timestamp]
const cdp = await ctx.newCDPSession(p);
cdp.on("Page.screencastFrame", async (f) => {
  const file = path.join(FR, `f${String(frames.length).padStart(5, "0")}.jpg`);
  fs.writeFileSync(file, Buffer.from(f.data, "base64"));
  frames.push([file, f.metadata.timestamp]);
  try { await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch { /* closing */ }
});
const startCapture = () => cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: W * 2, maxHeight: (H + BAND) * 2, everyNthFrame: 1 });

// ── On-screen helpers: a caption bar and a tap ripple ──
await p.addInitScript(() => {
  const css = `
    html, body { margin: 0; background: #1f5c47; }
    #app { position: fixed; top: 0; left: 0; width: 390px; height: 844px; border: 0; display: block; background: #f3f6f3; }
    #tut-cap { position: fixed; left: 0; right: 0; top: 844px; height: 132px; z-index: 2147483647; pointer-events: none;
      display: flex; flex-direction: column; justify-content: center; box-sizing: border-box;
      background: #1f5c47; color: #fff; padding: 10px 20px; text-align: center;
      font: 600 21px/1.5 "IBM Plex Sans Arabic", system-ui, sans-serif; direction: rtl;
      transition: opacity .25s; opacity: 1; }
    #tut-cap small { display: block; font-weight: 400; font-size: 15.5px; opacity: .88; margin-top: 2px; }
    #tut-card { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; pointer-events: none;
      background: #1f5c47; color: #fff; text-align: center; direction: rtl; transition: opacity .4s;
      font-family: "IBM Plex Sans Arabic", system-ui, sans-serif; }
    #tut-card h1 { font-size: 44px; font-weight: 600; margin: 0 0 10px; color: #fff; }
    #tut-card p { font-size: 19px; margin: 0 24px; opacity: .9; line-height: 1.6; }
    .tut-dot { position: fixed; z-index: 2147483647; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
      background: rgba(31,92,71,.35); border: 3px solid rgba(31,92,71,.85); pointer-events: none;
      animation: tut-pop .6s ease-out forwards; }
    #tut-sms { position: fixed; top: 0; left: 0; width: 390px; height: 844px; z-index: 2147483646; background: #fff; direction: rtl;
      font-family: system-ui, "IBM Plex Sans Arabic", sans-serif; display: flex; flex-direction: column;
      transform: translateY(100%); transition: transform .35s ease; }
    #tut-sms.on { transform: none; }
    #tut-sms .hd { padding: 46px 20px 14px; text-align: center; border-bottom: 1px solid #eee; }
    #tut-sms .hd b { display: block; font-size: 20px; } #tut-sms .hd span { color: #888; font-size: 13px; }
    #tut-sms .bub { margin: auto 14px 14px; align-self: flex-end; max-width: 290px; background: #2f7cf6; color: #fff; border-radius: 20px 20px 6px 20px;
      padding: 12px 14px; font-size: 15.5px; line-height: 1.6; word-break: break-word; }
    #tut-sms .bar { display: flex; align-items: center; gap: 10px; margin: 0 12px 26px; padding: 10px 16px; border-radius: 24px; background: #f1f1f4; color: #999; }
    #tut-sms .bar span { flex: 1; } #tut-sms .bar i { font-style: normal; color: #2f7cf6; font-size: 20px; }
    @keyframes tut-pop { from { transform: scale(.4); opacity: 1; } to { transform: scale(1.4); opacity: 0; } }`;
  addEventListener("DOMContentLoaded", () => {
    const s = document.createElement("style");
    // Inside the app frame: only hide the demo strip
    s.textContent = window === top ? css : ".banner { display: none !important; }";
    document.head.appendChild(s);
  });
});
async function caption(title, sub = "") {
  await p.evaluate(([t, s]) => {
    let el = document.getElementById("tut-cap");
    if (!el) { el = document.createElement("div"); el.id = "tut-cap"; document.body.appendChild(el); }
    el.innerHTML = t ? `${t}${s ? `<small>${s}</small>` : ""}` : "";

  }, [title, sub]);
  await wait(300);
}
async function card(title, sub, ms) {
  await p.evaluate(([t, s]) => {
    const el = document.createElement("div"); el.id = "tut-card";
    el.innerHTML = `<div><h1>${t}</h1><p>${s}</p></div>`;
    document.body.appendChild(el);
  }, [title, sub]);
  await wait(ms);
  await p.evaluate(() => { const el = document.getElementById("tut-card"); el.style.opacity = "0"; setTimeout(() => el.remove(), 450); });
  await wait(450);
}
async function smsMock(to, html, ms) {
  await p.evaluate(([to, html]) => {
    const el = document.createElement("div"); el.id = "tut-sms";
    el.innerHTML = `<div class="hd"><b>${to}</b><span>رسالة نصية</span></div><div class="bub">${html}</div><div class="bar"><span>رسالة نصية</span><i>➤</i></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("on"));
  }, [to, html]);
  await wait(ms);
  await p.evaluate(() => { const el = document.getElementById("tut-sms"); el.classList.remove("on"); setTimeout(() => el.remove(), 400); });
  await wait(450);
}
async function tap(loc, pause = 500) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  if (b) {
    await p.evaluate(([x, y]) => {
      const d = document.createElement("div"); d.className = "tut-dot"; d.style.left = x + "px"; d.style.top = y + "px";
      document.body.appendChild(d); setTimeout(() => d.remove(), 700);
    }, [b.x + b.width / 2, b.y + b.height / 2]);
    await wait(250);
  }
  await loc.click();
  await wait(pause);
}
async function type(loc, text) {
  await tap(loc, 150);
  await loc.fill("");
  await loc.pressSequentially(text, { delay: 70 });
  await wait(250);
}
const tab = (name) => tap(a.getByRole("navigation").getByRole("button", { name }), 900);
const dialog = () => a.getByRole("dialog");
let a; // the app frame

// ───────── 0. Title ─────────
await p.goto(URL); // same origin, so the shell can load fonts and styles
await p.evaluate((u) => {
  document.body.innerHTML = `<iframe id="app" src="${u}"></iframe>`;
}, URL);
await wait(500);
a = p.frames().find((f) => f !== p.mainFrame());
await a.getByRole("button", { name: "إرسال رمز التأكيد" }).waitFor();
await startCapture();
await card("دفترنا 📒", "دفتر الدين للأصحاب والشلة<br>تعرّف عليه في دقيقتين", 3200);

// ───────── 1. Sign in ─────────
await caption("١. سجّل برقم هاتفك", "يصلك رمز تأكيد برسالة SMS");
await type(a.getByLabel("رقم الهاتف"), "0791111111");
await tap(a.getByRole("button", { name: "إرسال رمز التأكيد" }), 900);
await type(a.getByLabel("رمز التأكيد"), "123456");
await tap(a.getByRole("button", { name: "تأكيد" }), 900);
await caption("اكتب اسمك", "هكذا يراك أصحابك");
await type(a.getByLabel("الاسم", { exact: true }), "سارة");
await tap(a.getByRole("button", { name: "ابدأ الآن" }), 1200);

// ───────── 2. Add a friend ─────────
await caption("٢. أضف أصحابك", "من جهات الاتصال في هاتفك أو بكتابة الرقم");
await tab(/جهات الاتصال/);
for (const [name, phone] of [["أحمد", "0782222222"], ["لينا", "0773333333"]]) {
  if (name === "لينا") await caption("وأضف بقية أصحابك بالطريقة نفسها", "");
  await tap(a.getByRole("button", { name: "إضافة صديق" }), 700);
  await type(a.getByLabel("الاسم", { exact: true }), name);
  await type(a.getByLabel("رقم الهاتف", { exact: true }), phone);
  await tap(a.getByRole("button", { name: "حفظ", exact: true }), 1000);
  if (name === "لينا") break;

  // ───────── 3. Record a debt ─────────
  await caption("٣. سجّل دينًا بضغطة", "«لي عنده» إذا دفعت عنه، و«له عندي» إذا دفع عنك");
  await tap(a.getByRole("button", { name: /لي عنده/ }), 500);
  await type(a.getByLabel("المبلغ (د.أ)"), "10");
  await type(a.getByLabel("البيان"), "تكسي");
  await tap(a.getByRole("button", { name: "تسجيل", exact: true }), 900);
  await caption("تنفتح رسالة SMS جاهزة تلقائيًا", "فيعرف أحمد بالدين حتى لو لم يكن لديه التطبيق");
  const sms = await p.evaluate(() => window.__lastSms ?? "");
  await smsMock("أحمد", sms.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>"), 4200);
  await tap(a.getByRole("button", { name: "إغلاق" }), 700);
}
await tap(a.getByRole("button", { name: "إغلاق" }), 700);
await caption("رقم كل صديق في مكان واحد", "اضغط على الرقم للاتصال أو المراسلة");
await wait(2400);
await caption("📣 تذكير المدينين", "رسالة تذكير لكل من عليه مبلغ، بلطف ودون إحراج");
await tap(a.getByRole("button", { name: /📣/ }), 2600);
await tap(a.getByRole("button", { name: "إغلاق" }), 600);

// ───────── 4. Summary ─────────
await tab(/ملخص الحساب/);
await caption("٤. ملخص الحساب", "كم لك عند الآخرين وكم عليك، بنظرة واحدة");
await wait(3200);

// ───────── 5. Group and bill ─────────
await tab(/مجموعاتي/);
await caption("٥. أنشئ مجموعة للشلة", "");
await tap(a.locator(".gtile.new"), 700);
await type(a.getByLabel("اسم المجموعة"), "الشلة");
await tap(a.getByRole("radio", { name: "🍕" }), 300);
await tap(a.getByRole("button", { name: "إنشاء المجموعة" }), 1000);
for (const [name, phone] of [["أحمد", "0782222222"], ["لينا", "0773333333"]]) {
  await tap(a.getByRole("button", { name: "+ إضافة", exact: true }), 600);
  await type(a.getByLabel("الاسم", { exact: true }), name);
  await type(a.getByLabel("رقم الهاتف", { exact: true }), phone);
  await tap(a.getByRole("button", { name: "حفظ", exact: true }), 900);
}
await caption("٦. قسّم الفاتورة", "صوّر الفاتورة والتطبيق يقرأ الأصناف بنفسه");
await tap(dialog().getByRole("button", { name: "إضافة عملية" }), 900);
await caption("اختر نوع العملية", "فاتورة، هدية جماعية، طلعة أو رحلة، أو مصروف مشترك");
await wait(2200);
await tap(a.locator(".op-type", { hasText: "فاتورة" }), 900);
await caption("٦. قسّم الفاتورة", "صوّر الفاتورة والتطبيق يقرأ الأصناف بنفسه");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
await a.locator("input[type=file]").nth(1).setInputFiles({ name: "bill.png", mimeType: "image/png", buffer: png });
await a.getByRole("heading", { name: "الأصناف" }).waitFor();
await caption("راجع الأصناف والأسعار", "وأضف الضريبة أو الخدمة أو التوصيل إن وجدت");
await wait(2400);
await a.evaluate(() => document.querySelector(".sheet")?.scrollBy({ top: 600, behavior: "smooth" }));
await wait(1400);
await tap(a.getByRole("button", { name: "التالي: الحاضرون" }), 900);
await caption("من كان حاضرًا؟", "أعضاء المجموعة محددون تلقائيًا");
await wait(1800);
await tap(a.getByRole("button", { name: "التالي: من طلب ماذا" }), 900);
await caption("من طلب ماذا؟", "اضغط على الأسماء بجانب كل صنف، أو «الجميع» للمشترك");
const items = a.locator(".assign");
const n = await items.count();
const who = ["أنا", "أحمد", "لينا"];
for (let i = 0; i < n; i++) {
  const row = items.nth(i);
  if (i % 3 === 2) await tap(row.getByRole("button", { name: "الجميع" }), 250);
  else await tap(row.getByRole("button", { name: who[i % 3], exact: true }), 250);
}
await wait(500);
await tap(a.getByRole("button", { name: "التالي: حصة كل شخص" }), 900);
await caption("حصة كل شخص محسوبة بدقة", "الضريبة والخدمة حسب الطلب، والتوصيل بالتساوي");
await wait(3000);
await tap(a.getByRole("button", { name: "تأكيد وتسجيل" }), 1000);
await caption("أرسل لكل شخص حصته", "رسالة جاهزة بضغطة واحدة");
await wait(2800);
await tap(a.getByRole("button", { name: "عرض ملخص الحساب" }), 1500);

// ───────── 7. Outing ─────────
await caption("٧. طلعة مع الشلة؟", "كل شخص يكتب كم دفع، ويُقسم المجموع بالتساوي");
await tab(/مجموعاتي/);
await tap(a.locator(".gtile", { hasText: "الشلة" }), 900);
await tap(dialog().getByRole("button", { name: "إضافة عملية" }), 800);
await tap(a.locator(".op-type", { hasText: "طلعة أو رحلة" }), 800);
await tap(a.getByRole("button", { name: /دفع أكثر من شخص/ }), 900);
await type(a.getByLabel("اسم الطلعة"), "مزرعة دبين");
await type(a.getByLabel(/ما دفعه أنا/), "40 مزرعة + 20 لحمة");
await type(a.getByLabel("ما دفعه أحمد"), "15 بنزين");
await type(a.getByLabel("ما دفعه لينا"), "10 حلويات");
await a.getByLabel("ما دفعه لينا").blur();
await wait(1200);
await tap(a.getByRole("button", { name: /احسب الطلعة/ }), 1000);
await caption("التطبيق يحسب كل شيء", "حصتك، وكم لك، ومن يدفع لمن");
await wait(3400);
await tap(a.getByRole("button", { name: "اعتماد الحسبة" }), 1000);
await wait(1800);
await tap(a.getByRole("button", { name: "عرض ملخص الحساب" }), 800);
await tap(a.getByRole("button", { name: "إغلاق" }), 700);

// ───────── 8. Settle ─────────
await tab(/ملخص الحساب/);
await caption("٨. سدّد أو سجّل دفعة", "وعند التسوية يصبح الحساب صفرًا ✅");
await wait(3000);
await caption("");

// ───────── End ─────────
await card("جرّب دفترنا الآن", "daftarna-99fad.web.app<br>الصداقة أهم من المال 💚", 3800);

await wait(300);
await cdp.send("Page.stopScreencast");
await browser.close();

// Frames arrive only when the screen changes: hold each one until the next
const list = frames.map(([f, t], i) => {
  const next = frames[i + 1]?.[1] ?? t + 0.5;
  return `file '${path.resolve(f)}'\nduration ${Math.max(0.001, next - t).toFixed(3)}`;
}).join("\n") + `\nfile '${path.resolve(frames.at(-1)[0])}'\n`;
const listFile = path.join(OUT, "frames.txt");
fs.writeFileSync(listFile, list);
const mp4 = path.join(OUT, "tutorial.mp4");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile,
  "-vf", "scale=780:-2,fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-movflags", "+faststart", mp4]);
console.log("saved", mp4, `${frames.length} frames`);
