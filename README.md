# Daftarna · دفترنا

A shared IOU ledger for friends and coworkers, with photo-based bill splitting. Built for Arabic speakers in Jordan: right-to-left, Jordanian dinars, and local receipts.

> **Status:** early version, live at [daftarna-99fad.web.app](https://daftarna-99fad.web.app). Try the [demo](https://daftarna-99fad.web.app/?demo) with any Jordanian number and the code `123456`.

## The problem

Among friends, small debts pile up: "you paid for my coffee," "I covered the taxi," "split the lunch bill." People track them in their heads, in notes apps, or in a WhatsApp chat. Then they forget, or each person remembers a different number.

Splitting a restaurant bill is the worst part. Someone has to read the receipt, work out who ordered what, share the 16% sales tax and 10% service charge fairly, and handle the leftover fils that never divide evenly.

Daftarna keeps one ledger that both people see. When someone records "I paid for you," it appears on the other person's side too, with the sign flipped. Take a photo of a receipt, tap who had each dish, and everyone's exact share goes into their ledger.

## Features

- **Groups.** Make a group for your friends, your office or your flat. Invite people with a link you can send over WhatsApp, Teams or email, or add them by phone number. Split a bill inside the group and everyone in it starts out selected.
- **Shared ledger.** Each entry is stored once and shown to both people, each from their own side. The home screen shows totals for *owed to me* and *I owe*, plus a running balance per friend.
- **Bill splitting from a photo.** An AI model reads the items, prices, tax and service charge from a receipt photo. You review and fix them, choose who was there and who had what, and confirm. Manual entry is always available.
- **Fair, exact shares.** Shared dishes are split evenly among the people who had them. Tax, service, delivery and discounts are allocated in proportion to each person's order. Shares always add up to the bill, to the fils.
- **Three everyday actions:** *I paid for them*, *they paid me*, *I lent them*. Plus *settle up*, which brings a balance to zero in one tap.
- **Append-only history.** Entries are never edited or deleted. Cancelling one adds a reversal, and the original stays visible, struck through, to both people.
- **Notifications and WhatsApp.** Friends who have the app get a push notification. Friends who don't get a prefilled WhatsApp message instead. You can also send a reminder or a full statement over WhatsApp.
- **Sign in with your phone number.** You verify it with an SMS code. Friends are added by phone number, and entries link up automatically when they join.
- **Installable PWA** with offline app shell, light and dark themes, and a layout built for phones.

## Screenshots

<!-- Add images to docs/screenshots/ and replace the placeholders below. -->

| Home | Friend ledger | Split: who had what | Split: summary |
| :--: | :--: | :--: | :--: |
| _coming soon_ | _coming soon_ | _coming soon_ | _coming soon_ |

## Tech stack

| Area | Choice |
| --- | --- |
| Front end | React 19, TypeScript, Vite |
| App delivery | Progressive Web App (manifest and service worker) |
| Auth | Firebase Authentication (phone number + SMS code) |
| Database | Cloud Firestore, with security rules as the privacy boundary |
| Server | Cloud Functions for Firebase (2nd gen, Node 22) |
| Push | Firebase Cloud Messaging (web push) |
| Receipt reading | Claude API (vision + JSON-schema structured output), called only from a Cloud Function |
| Tests | Vitest (logic and functions), `@firebase/rules-unit-testing` (security rules), Playwright (end-to-end at phone size) |
| CI | GitHub Actions |

## Getting started

### Prerequisites

- Node.js 22 or newer
- Java 21 (only for the security-rules tests, which run on the Firestore emulator)

### Run the demo locally

The demo runs entirely in the browser. It needs no Firebase project and no API keys.

```bash
git clone https://github.com/EsraaAlDayyat/daftarna.git
cd daftarna
npm install
npm install --prefix functions
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

1. Sign in with any Jordanian mobile number (for example `0791111111`) and the code `123456`.
2. Tap **أو عبّي بيانات تجريبية** to load sample friends and entries, or add your own.
3. To see the other side of the ledger, open a second tab, sign out from the menu, and sign in as `0782222222`.

Demo data is saved in your browser only.

### Run against Firebase

1. Create a Firebase project on the **Blaze** plan (Cloud Functions and SMS sign-in require it).
2. Enable **Authentication → Sign-in method → Phone**, and create a **Firestore** database.
3. Copy `.env.example` to `.env.local` and fill in your web app config.
4. Store the Anthropic API key as a Functions secret:
   ```bash
   npx firebase use --add
   npx firebase functions:secrets:set ANTHROPIC_API_KEY
   ```
5. Deploy:
   ```bash
   npm run build
   npx firebase deploy
   ```

Add `?demo` to any URL to switch back to the demo backend.

### Tests

```bash
npm test             # app logic + Cloud Functions (Vitest)
npm run test:rules   # Firestore security rules on the emulator (needs Java)
npm run typecheck

# End-to-end at 390×844, with screenshots saved to e2e/shots/
npm run build && npx vite preview --port 4173
npm run test:e2e -- http://localhost:4173/ e2e/shots
```

All of these except the end-to-end run also run on every push in GitHub Actions.

## Project structure

```
src/
  core/        Pure logic with no UI: money, phone numbers, ledger, bill splitting, message text
  data/        Backend interface, plus Firebase and in-browser demo implementations
  ui/          Screens and components
functions/     Cloud Functions: receipt reading and push notifications
firestore.rules       Who can read and write what
rules-tests/          Tests for the security rules
e2e/                  End-to-end check at phone size
public/               PWA manifest, icons, service worker
```

## Key technical decisions

**Money is stored as integer fils.** The dinar has three decimal places (1 JOD = 1000 fils). Floating-point dinars produce errors like 0.1 + 0.2 ≠ 0.3, so every amount is an integer number of fils, and formatting happens only at display time.

**One shared entry per transaction.** Each entry is stored once with a `creditor`, a `debtor`, and `parties: [creditor, debtor]`. Each person's view is computed from that single record, so the two sides can't drift apart. The `parties` array is what queries and security rules filter on.

**Append-only ledger.** Entries can't be updated or deleted, and the security rules enforce this. A mistake is undone with a reversal entry, so both people always see the same full history. A marker document in the same batch ensures an entry can be reversed only once.

**Exact bill splitting.** Each person's share is computed with exact fractions (BigInt), then rounded down. The payer takes the remainder, so the shares always sum to the exact total and the payer absorbs any leftover fils. A test runs 1,000 random bills to check this.

**Phone sign-in with SMS codes.** Privacy depends on knowing each user's real phone number, because entries are matched by number. Typing a number without verifying it would let anyone read another person's ledger. SMS verification costs a few cents per sign-in, and users sign in rarely.

**Security rules are the privacy boundary.** The client never filters other people's data. Firestore rules allow reading an entry only when you are one of its parties. They also check that bill shares match the bill written in the same batch, and that timestamps come from the server. The demo backend applies the same filter, so it behaves the same way.

**AI runs on the server, with structured output.** The receipt photo goes to a Cloud Function, which calls the Claude API with a JSON schema. The API key never reaches the browser. Each user is limited to 30 reads per day. The model's output is always shown for review before anything is saved. If the computed total doesn't match the printed total, the app warns you.

**PWA instead of app-store apps.** One codebase, no store fees, and instant updates. On iPhone, web push requires iOS 16.4 or later and the app added to the home screen, so the app explains that step. WhatsApp messages cover anyone without notifications.

**Invite links are the group ID.** Each group gets a random Firestore ID, and the invite link is just that ID. Anyone signed in who has the link can read the group and add themselves, and nothing else; members can add others. Balances stay per person, across all groups, so a group is a way to organise people rather than a separate ledger.

**Swappable backend.** The UI talks to a small `Backend` interface. The Firebase version and the in-browser demo both implement it. That makes the app easy to try without any setup, and lets the end-to-end test run without a server.

## License

[MIT](LICENSE)
