# MotionPlay

MotionPlay turns a phone into a wireless controller for a table-tennis game running in a laptop browser. The phone opens a normal web page. Nothing is installed.

The player on the laptop owns the table, the score, and the simulation. The phone only sends a normalized racket position.

## Architecture

```text
apps/web        Next.js lobby, Phaser table, and mobile controller
apps/server     Express + Socket.IO room server
packages/shared Event names, payload types, and motion math
```

Rooms live in memory. `InMemoryRoomManager` implements the `RoomStore` interface used by the socket handlers, so a later Redis store can replace the class without changing the event flow.

```text
phone motion or touch
  -> normalize to -1..1
  -> Socket.IO CONTROLLER_INPUT
  -> server validates, rate-limits, and relays PLAYER_INPUT
  -> laptop writes a small input store
  -> Phaser update loop moves the near racket
```

React does not re-render on animation frames. The Phaser scene reads the input store directly and publishes score changes only when a point is scored, the rally starts, or the match pauses.

The near racket is yours. Tilt or drag left and the racket moves left. The far racket is a simple opponent. First to 7 wins. Arrow keys on the laptop move the same racket when a phone is not connected.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- A laptop and a phone on the same Wi-Fi for real pairing

## Installation

```bash
npm install
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Builds the shared package, then runs the server and the website together |
| `npm run build` | Production build of shared, server, and web |
| `npm run start` | Runs the production server and website |
| `npm run test` | Room, validation, motion, and Socket.IO session tests |
| `npm run typecheck` | TypeScript across all packages |
| `npm run lint` | Next.js ESLint plus TypeScript checks |

## Environment

Copy the examples if you want to override the defaults. The app runs locally without either file.

`apps/server/.env.example`

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Socket and HTTP API port |
| `HOST` | `0.0.0.0` | Bind address. `0.0.0.0` is required for a phone on the LAN |
| `CORS_ORIGIN` | `*` | Use a comma-separated origin list in production |
| `ROOM_TTL_MS` | `900000` | Room lifetime since the last activity |
| `HOST_GRACE_MS` | `60000` | How long a room waits for the laptop to reconnect |
| `CONTROLLER_GRACE_MS` | `15000` | How long a room keeps a phone's seat after a drop |
| `DISCONNECT_GRACE_MS` | `1500` | Delay before a dropped socket gives up its seat |
| `TLS_KEY_PATH` / `TLS_CERT_PATH` | unset | Optional HTTPS for the socket server |

`apps/web/.env.example`

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SOCKET_URL` | Absolute socket origin. Example: `https://play.example.com` |
| `NEXT_PUBLIC_SOCKET_PORT` | Used only when `NEXT_PUBLIC_SOCKET_URL` is empty. Default `4000` |
| `NEXT_PUBLIC_PUBLIC_ORIGIN` | Origin encoded in the QR code. Set this in production. Do not use `localhost` there |

When `NEXT_PUBLIC_PUBLIC_ORIGIN` is empty, a page opened at `http://192.168.1.20:3000` puts that origin in the QR code. A page opened at `localhost` asks the server for a LAN address and encodes that instead, because a phone cannot open the laptop's `localhost`.

## Local development

```bash
npm run dev
```

- Website: `http://localhost:3000`
- Server health: `http://localhost:4000/health`

Open the website, choose **Start game**, and use **Practice with keyboard** to play immediately. Left and right arrows, or A and D, move the near racket. Space pauses. R restarts.

## LAN testing and QR pairing

1. Run `npm run dev`.
2. On the laptop, open the site through the LAN address printed by the server, or stay on localhost and let the lobby rewrite the QR target.
3. Both devices must be on the same Wi-Fi. Guest networks that isolate clients will fail.
4. Allow incoming connections on ports **3000** and **4000** if the operating system asks.
5. Start a game. Scan the QR code with the phone camera.
6. The phone opens `/controller/<roomId>`.
7. When the laptop says **Controller connected**, start the match.

The controller link is also printed under the code. Open it manually on another device if the camera cannot scan.

A second phone that scans the same code is rejected while the first controller is connected or still inside its reconnect window. Refreshing the controller page keeps the same seat through a session token stored in `sessionStorage`. Closing the laptop room, waiting for the room to expire, or scanning an old code shows an explicit error instead of a blank page.

## Motion permissions

Motion is requested from a button tap. It is not assumed.

- iPhone: the page calls `DeviceOrientationEvent.requestPermission()` from that tap. If it is denied, use Settings → Safari → Motion & Orientation Access, or the drag pad.
- The first reading becomes the center. **Set center** captures a new neutral grip.
- Tilt is `currentGamma - baselineGamma`, scaled by the sensitivity slider, smoothed, and clamped to `-1..1`.
- Samples are sent at about 30–60 Hz, with a heartbeat so a still phone does not look disconnected.
- The drag pad stays available. While a finger is down, it overrides motion.

Phone motion sensors require a secure context. `http://192.168.x.x:3000` is not one, so iOS and current Chrome will not provide tilt on a plain LAN URL. The drag pad still plays the full game over HTTP.

For a real motion test on a local network, serve both the website and the socket server over HTTPS with a certificate the phone trusts (for example [mkcert](https://github.com/FiloSottile/mkcert)):

1. Generate a cert that includes the laptop's LAN IP.
2. Set `TLS_KEY_PATH` and `TLS_CERT_PATH` for the server.
3. Run the website with `next dev --experimental-https` and a trusted certificate, or put both behind one HTTPS reverse proxy.
4. Set `NEXT_PUBLIC_PUBLIC_ORIGIN` and `NEXT_PUBLIC_SOCKET_URL` to that HTTPS origin.

`localhost` on the phone is the phone itself, not the laptop.

This repository implements the motion pipeline. It has not been verified here on a physical phone browser. Confirm tilt on a real device before treating motion as done.

## Keyboard practice

On the game screen, the arrow keys or A and D move the near racket without a phone. The phone wins while it is sending input, and the keyboard wins while a key is held. If the phone drops, the rally continues and the racket eases back to center instead of freezing.

## Deployment

Rooms are in memory. A process restart clears them. Plan for one Node process until a shared store exists.

1. Set `NEXT_PUBLIC_PUBLIC_ORIGIN` to the public site origin, for example `https://play.example.com`.
2. Set `NEXT_PUBLIC_SOCKET_URL` to the public socket origin. If a reverse proxy serves both on one host, this can be the same origin.
3. Set `CORS_ORIGIN` to the website origin.
4. Terminate TLS in front of both processes. Phone motion will not work over plain HTTP on the public internet.
5. Build and start:

```bash
npm run build
npm run start
```

The website listens on port 3000 and the server on port 4000. A proxy can route `/socket.io` and `/health` to the server and everything else to Next.js. Point `NEXT_PUBLIC_SOCKET_URL` at the public origin the browser should use, not an internal port.

Example proxy shape:

```text
https://play.example.com/            -> 127.0.0.1:3000
https://play.example.com/socket.io/  -> 127.0.0.1:4000
https://play.example.com/health      -> 127.0.0.1:4000
https://play.example.com/rooms/      -> 127.0.0.1:4000
https://play.example.com/network     -> 127.0.0.1:4000
```

`GET /health` returns `{ "ok": true }`.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| Lobby says server offline | `npm run dev` is running and port 4000 is free |
| Phone cannot open the QR link | The code must not contain `localhost`. Use the LAN URL and allow ports 3000 and 4000 |
| Phone opens the page but never connects | The socket URL host must be reachable. It follows the page hostname and port 4000 unless `NEXT_PUBLIC_SOCKET_URL` is set |
| Motion button does nothing useful | The page must be HTTPS (or localhost). Use the drag pad on HTTP LAN |
| iPhone never prompts | The prompt only runs from the button tap, and only in Safari on a secure page |
| Second phone is rejected | One controller per room. Close the first controller or wait for it to disconnect |
| Old QR shows an error | The room expired or the laptop closed it. Start a new game |
| Refreshing the laptop resets the score | The simulation runs on the laptop. The controller reconnects; the rally starts again |
| Racket sticks after the phone locks | It should release toward center after about a second without input. If the page is still heartbeating, the last position is intentional |
