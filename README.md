# Drumit

> 一个紧凑的鼓谱编辑器。
> 为**边看边打**而设计，不是为了出版乐谱。

[English](./README.en.md) · 中文

[![Live demo](https://img.shields.io/badge/demo-W--Mai.github.io/Drumit-111?style=flat-square)](https://w-mai.github.io/Drumit/)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?style=flat-square)
![Vite](https://img.shields.io/badge/Vite-8-b73bfe?style=flat-square)

## 为什么做这个

MuseScore 和 Guitar Pro 这类记谱软件会把鼓点画在五线谱上，带符干、符尾、加线 ——
适合出版，但用来做练习单就太重了。Drumit 用两行布局：镲片类在上，鼓类在下，
只有多个声部冲突才会自动扩展多行，而且完全不画符干。出来的效果像是演出前夜
鼓手自己涂在纸上的那种记号。

源文件是纯文本的 `.drumtab` 格式 —— 可以 diff、可以复制粘贴，在编辑器和文本之间
无损往返。

## 几个样例

**基础 8 分律动 (动次打次):**

![动次打次](./docs/samples/dong-ci-da-ci.svg)

**拍内混合细分 + 多声部叠加:**

![Mixed subdivisions](./docs/samples/mixed-subdivisions.svg)

**三连音与六连音:**

![Tuplets](./docs/samples/tuplets.svg)

**反复记号 + 1st/2nd ending:**

![Repeats and endings](./docs/samples/repeats-endings.svg)

**带切分、flam、ghost、accent 的 fill:**

![Fill](./docs/samples/fill-articulations.svg)

## 快速开始

```bash
bun install
bun run dev      # http://localhost:5173
bun run test
bun run build    # → dist/
bun run samples:generate   # 重新渲染 README 里的 svg
```

需要 [Bun](https://bun.sh) ≥ 1.3。

## `.drumtab` 语法

```drumtab
title: 动次打次
tempo: 100
meter: 4/4

[A]
| hh: oo / oo / oo / oo  bd: o- / -- / o- / --  sn: - / x- / - / x- |
```

| 写法 | 含义 |
|---|---|
| `\| ... \|` | 一个小节 |
| `hh: a / b / c / d` | 一条声部（hi-hat），4 拍 |
| `oo` `oooo` `ooo` | 拍内细分（8 分、16 分、三连音） |
| `o , x x` | 拍内混合细分（8 分 + 两个 16 分） |
| `\|: ... :\| x3` | 反复 3 次 |
| `... \| [1]` / `... \| [2]` | First / second ending |
| `@segno` `@dc al fine` | 跳转记号 |
| `>o` `(o)` `fo` `~o` `o!` | 重音 / ghost / flam / roll / choke |
| `o/R` `o/L` | 右手 / 左手 sticking |

完整语法见 `src/notation/parser.ts`，更多样例见 `src/notation/samples/`。

## 能做什么

- **编辑器** — 点击编辑网格、数字键放乐器、修饰键加装饰音、per-doc 撤销/重做、
  Source 模式直接改 `.drumtab` 原文
- **渲染** — 跨声部自动合并 beam、tuplet 数字嵌入 beam 中心、反复点、
  D.C. / D.S. / Fine / Coda 文字标记
- **播放** — Web Audio 合成器引擎 + Web MIDI 引擎（调度器跑在 Worker 里，
  后台标签页不会跑偏），节拍器、循环、播放光标
- **导出** — `.drumtab` 纯文本 + 标准 MIDI 文件（Type 0，通道 10）
- **多文档** — 侧栏切换、`.drumtab` 导入导出、localStorage 自动保存

完整更新日志见 [CHANGELOG.md](./CHANGELOG.md)。

## 技术栈

Bun + Vite + React 19 + TypeScript 6 + Tailwind v4 + Vitest。

## License

[MIT](./LICENSE) © 2026 W-Mai
