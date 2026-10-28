# Privacy: what leaves the browser

This page says what a Scene Rooms site sends over the network and what it keeps, so you can describe it honestly to your visitors. In short: it collects nothing about visitors by itself.

## What the site does not do

- It sets no cookies and stores nothing in the browser.
- It has no analytics, tracking or advertising.
- It does not ask for the camera, microphone or location.

## What it loads

| What | From where | Can you change it? |
| --- | --- | --- |
| The app itself, scene files, pictures and videos | the server hosting your site | Yes. A picture or video given as a full `https://…` address is loaded from that other site instead. |
| Fonts | Google Fonts (`fonts.googleapis.com`), unless the scene says otherwise | Yes. Set `"fontsUrl": ""` in the scene's `theme` to load no web fonts. The text then uses the visitor's own monospace font. Google sees the visitor's address when fonts load. |

## What visitors send

Only the contact form sends anything, and only when the visitor presses its button **and** the form has an `action` address. The answers go to that address only. Without an `action` the form sends nothing.

The address bar shows which stop the visitor is at (`#contact`). It stays in their browser history like any other address.

> **Warning.** If your form has an `action`, the people running that address receive names, e-mail addresses and messages. Mention this next to the form, and tell visitors what you do with their message.
