# ApplyQueue

A weekday commercial queue for one UK specialist subcontractor. Four roles on one page: Dates, Evidence, Draft, and Hold.

It prepares the firm’s own application figures from the rate card and the evidence already on the card. It does not chase invoices, read a contract, build a PDF pack, or register anyone.

ApplyQueue is not legal advice. It does not certify a payment. It does not interpret a contract. Empty fields stay empty. Nothing on the page is sent.

## Open it

Static files, no build:

- Path: `/workspace/applyqueue/index.html`
- Served copy: [http://127.0.0.1:8934/](http://127.0.0.1:8934/)

The server is `python3 -m http.server 8934` in this folder. Use the served address if you can. The queue is stored in that browser only (`localStorage`). The file URL and the served URL do not share storage.

To start the server again:

```bash
python3 -m http.server 8934 --bind 127.0.0.1 --directory /workspace/applyqueue
```

## What you see first

Two illustration packages for **Example Electrical**, which is not a real firm. Riverside switchroom is dated inside the next 10 working days, so it rises. Harbour lighting is dated later, so it sits below. Working days are Monday to Friday. Bank holidays are not removed. No application date is invented.

The rate card is an illustration. One code, BW-OPEN, has no price on purpose.

## Price

£829 a month. Up to 4 live packages. Month to month.

Checkout is not open. No payment is taken on this page.

## Checks

```bash
node logic.test.js
```
