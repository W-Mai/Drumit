/**
 * Page 4 — 乐队练习曲《蓝莲花》(4/4, ♩=90)
 *
 * This transcription keeps the *structure* of the handwritten page rather
 * than inventing note-for-note content. Each section typically starts with
 * a repeat-open bar `[:`, shows one or two pattern bars, and fills the rest
 * of the phrase with slash-repeat variants `%`, `%.`, `%-`, `%,` before a
 * final fill bar ends the phrase.
 *
 * Key symbols present on the page:
 *   - ↓o / ↓2  at section starts: hanging crash (stickX) + open note
 *   - ∂∂ ∂∂ ∂∂ ∂∂ above the line: hi-hat / ride 8ths and 16ths
 *   - o x o x  on the drum row: kick + snare interlock
 *   - 2/4 insert measure at the end of [C] / [C']
 *   - 2x: annotation for second-ending variant fills
 */
export const lanLianHua = `title: 乐队练习曲《蓝莲花》
tempo: 90
meter: 4/4

# -------- [A] ----------
# Row 1: crash hits marking each beat
[A]
| cr: o / o / o / o |

# Row 2: main pattern, hi-hat on top, kick+snare below
| hh: xx / xx / xx / xx  bd: o / - / o / -  sn: - / o / - / o |
| % |
| %. |
| %, |
| %- |
| %, |
| %. |
| %- |

# -------- [B] ----------
[B]
| hh: xx / xx / xx / xx  bd: o / - / o / -  sn: - / o / - / o |
| % |
| %. |
| %, |
| %- |
| %, |
| %. |
| %- |

# -------- [C] ----------
[C]
| hh: xx / xx / xx / xx  bd: o / - / o / -  sn: - / o / - / o |
| % |
| %. |
| %, |
| %- |
| %. |
| %, |
| meter: 2/4 | cr: o / -  bd: o / -  sn: - / - |

# -------- [Solo] ----------
[Solo]
| cr: o / o / o / o |
| hh: xx / xx / xx / xx  bd: o / - / o / -  sn: - / o / - / o |
| %- |
| %- |
| %, |
| hh: xx / xx / xx / xx  bd: o / - / o / -  sn: - / o / - / xxx |  x2
| cr: o / - / - / -  bd: o / - / - / - |

# -------- [B'] ----------
[B']
| hh: xxxx / xxxx / xx / xxx  bd: o / - / o / -  sn: - / o / xox / - |
| % |
| %. |
| %- |
| hh: xx / xx / xx / xxxx  bd: o / - / o / -  sn: - / xox / xox / xxx |

# -------- [C'] ----------
[C']
| hh: xxxx / xxxx / xx / xxx  bd: o / - / o / -  sn: - / o / - / o |
| % |
| %. |
| %, |
| %- |
| %, |
| meter: 2/4 | cr: o / -  bd: o / -  sn: - / - |

# -------- [Solo'] ----------
[Solo']
| cr: o / o / o.xx / xx. |
| hh: xx / xx / xx / xxxx  bd: o / - / o / -  sn: - / xox / xox / xxx |  x2
| %- |
| %- |
| %, |
| %, |
| cr: o / - / - / - |
`;
