# Drumit

> 白天练，夜里扒，做梦都在找鼓点打。
> 一个鼓谱工具，给不想啃五线谱的人。

[English](./README.en.md) · 中文

[![Live demo](https://img.shields.io/badge/demo-W--Mai.github.io/Drumit-111?style=flat-square)](https://w-mai.github.io/Drumit/)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?style=flat-square)
![Vite](https://img.shields.io/badge/Vite-8-b73bfe?style=flat-square)

## 为什么写这个

学鼓的第一道坎不是手速，是谱。

五线谱摊在谱架上，五条线、三种符头、两个声部的符干各朝一边——
我每次都要先花十分钟"翻译"，才知道下一拍该打什么。
谱子越复杂，翻译越久，练鼓反而变成了练阅读理解。

后来在小米音乐社团跟董波老师学鼓，他给我们的手写谱完全不一样：
镲画上面一行，鼓画下面一行，音符下面划线标细分——一条线八分、两条线十六分，
只有装饰音才多画一笔，其余干干净净。拿起来就能打。

Drumit 就是想把那张手写谱变成一个工具：
写出来的 `.drumtab` 是纯文本，能 diff、能 PR；
画出来的谱面和手写一样直觉；
点一下还能听见声音。

## 长这样

**基础 8 分律动 · 动次打次**

![动次打次](./docs/samples/dong-ci-da-ci.svg)

**拍内混合细分 + 多声部**

![混合细分](./docs/samples/mixed-subdivisions.svg)

**三连音、六连音**

![三连音](./docs/samples/tuplets.svg)

**反复记号 + 一房、二房**

![反复与房](./docs/samples/repeats-endings.svg)

**带各种修饰的 fill**

![fill](./docs/samples/fill-articulations.svg)

## 跑起来

```bash
bun install
bun run dev      # http://localhost:5173
bun run test
bun run build    # → dist/
bun run samples:generate   # 重新渲染 README 里的这几张 svg
```

需要 [Bun](https://bun.sh) ≥ 1.3。

## `.drumtab` 怎么写

```drumtab
title: 动次打次
tempo: 100
meter: 4/4

[A]
| hh: oo / oo / oo / oo  bd: o- / -- / o- / --  sn: - / x- / - / x- |
```

| 写法 | 意思 |
|---|---|
| `\| ... \|` | 一个小节 |
| `hh: a / b / c / d` | 一条声部（踩镲），拍与拍之间用 `/` 隔开 |
| `oo` / `oooo` / `ooo` | 一拍内平均切分（8 分、16 分、三连音） |
| `o , x x` | 一拍内拼不同时值（8 分 + 两个 16 分） |
| `\|: ... :\| x3` | 反复 3 次 |
| `... \| [1]` / `... \| [2]` | 一房 / 二房 |
| `@segno` / `@dc al fine` | D.S./D.C./Coda/Fine 跳转 |
| `>o` / `(o)` / `fo` / `~o` / `o!` | 重音 / ghost / flam / 滚奏 / 闷音 |
| `o/R` / `o/L` | 右手 / 左手 |

完整规则写在 `src/notation/parser.ts`，更多范例看 `samples/*.drumtab`。

## 有啥能玩

- **可视化编辑器**：点格子输入、数字键切乐器、修饰键加 ghost/flam；每篇独立撤销/重做；也能直接改 `.drumtab` 原文
- **可视化渲染**：beam 跨声部自动合并、三连音数字嵌在 beam 中间、反复点、D.C./D.S./Fine/Coda 一应俱全
- **播放**：内置 Web Audio 合成鼓，或直连 Web MIDI；后台标签不掉速（调度跑在 Worker 里）；节拍器、循环、播放光标都有
- **导出**：SVG、PNG、PDF、静态 HTML、**可播 HTML**（内嵌 Play 按钮，离线也能响）、`.drumtab`、`.mid`
- **多谱子工作区**：侧栏切换，`.drumtab` 自由进出，localStorage 自动存档
- **手机上也能看**：布局响应到 320px，侧栏变抽屉、播放条沉底；编辑功能桌面独享
- **两种视图**：Drumit 紧凑谱（默认）/ Staff 五线谱（手写 SVG，零依赖）；预览顶部一键切换

更新记录在 [CHANGELOG.md](./CHANGELOG.md)。

## 用了啥

Bun + Vite + React 19 + TypeScript 6 + Tailwind v4 + Vitest。

## 鸣谢

**董波老师**——
我所有关于"谱应该长什么样"的直觉，都来自他在白板上随手画的那几张谱。
镲在上、鼓在下，下面划线分细分，圈和叉标乐器——
就这么简单的东西，让一个看不懂五线谱的人，第一次觉得鼓谱是给自己看的。
Drumit 做的所有事，不过是把那张白板谱接上了电。

内置的鼓采样来自
[Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums)
（CC0 1.0），由 Austin McMahon 在 Virtuosity Musical Instruments
录制，Versilian Studios 与 Karoryfer Samples 后期处理。

## 协议

[MIT](./LICENSE) © 2026 W-Mai
