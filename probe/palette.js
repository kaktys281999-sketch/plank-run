// Colours of the look probe. Every value is sampled from a pack file (rule Ц1: no palette of
// our own while a source exists), the comment names the file and the pixel or SVG fill.
// Sky colours are temporary: spec-visual-v2 §7 takes them from the owner's sky backdrop later.

export const COLORS = {
  grass: 0x7cbb3e, // forest_texture.png, pixel (64, 30), top of the leaf gradient
  sand: 0xe2bc8d, // knight_texture.png, pixel (192, 64), leather column
  sandLine: 0xdaae7d, // knight_texture.png, pixel (192, 128)
  sandEdge: 0xcb935f, // knight_texture.png, pixel (192, 250)
  skyTop: 0x5ca2e0, // Kenney panel_grey_blue.svg, fill #5CA2E0
  skyBottom: 0xa2c0d9, // Kenney panel_grey_blue.svg, fill #A2C0D9
  // Sunlight. The gold of the atlas tinted the knight's blue-grey steel olive, so the light is the
  // pack's warm cream instead.
  sun: 0xfff1d2, // Kenney panel_brown.svg, fill #FFF1D2
  shade: 0x515f6b, // Kenney button_grey.svg, fill #515F6B
};
