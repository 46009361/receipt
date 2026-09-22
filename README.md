<p align="center">
  <img src="./assets/hack-club-2026.svg" alt="Hack Club" width="220" />
</p>

<h1 align="center">Receipt!</h1>

<p align="center">
  Write a sketch that draws itself.<br />
  We print it on a little thermal machine and post it to you.
</p>

<p align="center">
  <strong>Closes Thursday, September 24, 2026.</strong>
</p>

---

## What this is

You write a small generative-art sketch in p5.js. It renders to a 384 px-wide
black-and-white image. Submit it, and a real receipt gets printed and mailed to you. Maybe with
stickers ;)

## Make one

**1. Fork this repo** and clone your fork. Everything you need is in
[`editor/`](./editor/).

```sh
git clone https://github.com/<your-username>/receipt.git
cd receipt/editor
npm install
npm run dev
```

**2. Open the local URL** Usually, it is http://localhost:5173/

**3. Edit [`editor/sketch.js`](./editor/sketch.js)** in your normal code editor
and save. The preview redraws on every save. Two things matter:

```js
export const receipt = {
  height: 1080, // 240–2000 px. Width is fixed at 384 by the printer.
  seed: 67,
};

export function drawReceipt(p) {
  // your art goes here — p is a p5 instance
}
```

Draw with any [p5.js function](https://p5js.org/reference/) inside
`drawReceipt(p)`: `p.line()`, `p.rect()`, `p.text()`, `p.random()`, `p.noise()`,
and so on. The starter sketch is there to be deleted — `rm -rf` its contents and
see what you come up with.

**4. Pick a seed** with the seed box or the ↻ button. `p.random()` and
`p.noise()` are both seeded, so the same number always gives the same image.
When the status says **Ready to print**, hit **Export PNG**.

**5. Ship it.** Submit your repo link and that PNG. I print it and mail it to
you.

---

<p align="center">
  Run by <a href="https://cskartikey.dev/">@cskartikey</a> · made with ♥ by teenagers, for teenagers at
  <a href="https://hackclub.com/">Hack Club</a>
</p>
