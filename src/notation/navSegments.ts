import type { NavigationMarker } from "./types";

export type NavSegment =
  | { kind: "text"; text: string }
  | { kind: "segno" }
  | { kind: "coda" };

export function navigationSegments(nav: NavigationMarker): NavSegment[] {
  switch (nav.kind) {
    case "segno":
      return [{ kind: "segno" }];
    case "coda":
      return [{ kind: "coda" }];
    case "toCoda":
      return [{ kind: "text", text: "To Coda " }, { kind: "coda" }];
    case "fine":
      return [{ kind: "text", text: "Fine" }];
    case "dc":
      if (nav.target === "fine")
        return [{ kind: "text", text: "D.C. al Fine" }];
      if (nav.target === "coda")
        return [{ kind: "text", text: "D.C. al " }, { kind: "coda" }];
      return [{ kind: "text", text: "D.C." }];
    case "ds":
      if (nav.target === "fine")
        return [{ kind: "text", text: "D.S. al Fine" }];
      if (nav.target === "coda")
        return [{ kind: "text", text: "D.S. al " }, { kind: "coda" }];
      return [{ kind: "text", text: "D.S." }];
  }
}
