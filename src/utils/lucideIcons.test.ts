import { describe, expect, it } from "vitest";
import { Icons } from "./lucideIcons";

describe("Icons", () => {
  it("renders all icon SVGs", () => {
    const icons = [
      Icons.settings,
      Icons.play,
      Icons.rotateCcw,
      Icons.refresh,
      Icons.arrowLeft,
      Icons.x,
      Icons.check,
      Icons.bot,
      Icons.arrowUp,
      Icons.arrowDown,
      Icons.arrowUpDown,
      Icons.trash,
    ];

    for (const renderIcon of icons) {
      const svg = renderIcon(20, "#fff");
      expect(svg).toContain("<svg");
      expect(svg).toContain('width="20"');
      expect(svg).toContain('stroke="#fff"');
    }
  });
});
