import { expect, it } from "vitest";
import { hexToHsv, hsvToHex } from "./color";

it.each([
  "#F0509A",
  "#4FA3F7",
  "#5BE36A",
  "#000000",
  "#FFFFFF",
  "#FF0000",
  "#00FFFF",
])("preserves %s when opening and using the picker", (color) => {
  expect(hsvToHex(...hexToHsv(color))).toBe(color);
});
it("can select white, black and full saturation independently", () => {
  expect(hsvToHex(180, 0, 1)).toBe("#FFFFFF");
  expect(hsvToHex(180, 1, 0)).toBe("#000000");
  expect(hsvToHex(180, 1, 1)).toBe("#00FFFF");
});
