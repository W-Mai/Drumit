/**
 * Page 4 — 乐队练习曲《蓝莲花》(d=90, 4/4)
 * Song form: A / B / C / Solo / B' / C' / Solo'
 *
 * Bars are mostly repeat-slash placeholders; key written-out fills:
 * - B→C transition fill with 16th snare run
 * - Solo fill with 2x repeat bracket
 * - 2/4 inserted bar (handled by meter override)
 */
export const lanLianHua = `title: 乐队练习曲《蓝莲花》
tempo: 90
meter: 4/4

[Intro]
| hh: x / x / x / x   sn: x / o / o / o |
| % |
| % |
| % |

[A]
| hh: x / x / x / x   bd: o / - / o / -  sn: - / o / - / o |
| % |
| % |
| % |
| % |
| % |
| % |
| % |

[B]
| hh: x / x / x / x   bd: o / - / o / -  sn: - / o / - / o |
| % |
| % |
| % |
| % |
| % |
| % |
| % |

[C]
| hh: x / x / x / x   bd: o / - / o / -  sn: - / o / - / o |
| % |
| % |
| % |
| % |
| % |
| % |
| meter: 2/4 | hh: x / x   bd: - / -  sn: - / - |
| meter: 4/4 | hh: - / - / - / - |

[Solo]
| hh: x / x / x / x   bd: o / - / o / -  sn: - / o / - / o |
| % |
| % |
| % |
| % |
| hh: x / x / x / xx  bd: o / - / o / -  sn: - / o / xox | x2
| % |
| % |
| % |

[B']
| hh: x / x / x / xx  bd: o / - / o / -  sn: - / o / o / - |
| % |
| % |
| % |
| hh: x / x / x / xx  bd: o / - / o / -  sn: - / o / oxx |
| % |
| % |
| % |

[C']
| hh: x / x / x / x   bd: o / - / o / -  sn: - / o / - / o |
| % |
| % |
| % |
| % |
| % |
| meter: 2/4 | hh: x / x   bd: - / -  sn: - / - |
| meter: 4/4 | hh: - / - / - / - |

[Solo']
| hh: x / x / x / x   bd: o / - / o / -  sn: - / o / - / o |
| hh: x / xxx / xx / xx  bd: - / o / - / -  sn: - / o / oxx | x2
| % |
| % |
| % |
| % |
| % |
| % |
| % |
| % |
`;
