import sys
from fontTools.ttLib import TTFont, newTable
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

src, dst = sys.argv[1], sys.argv[2]
font = TTFont(src)
glyph_order = font.getGlyphOrder()
glyph_set = font.getGlyphSet()
glyf = newTable("glyf"); glyf.glyphOrder = glyph_order; glyf.glyphs = {}
for name in glyph_order:
    pen = TTGlyphPen(glyph_set)
    glyph_set[name].draw(Cu2QuPen(pen, max_err=1.0, reverse_direction=True))
    glyf.glyphs[name] = pen.glyph()
font["glyf"] = glyf
font["loca"] = newTable("loca")
del font["CFF "]
if "VORG" in font: del font["VORG"]
maxp = font["maxp"]; maxp.tableVersion = 0x00010000
for a in ("maxZones","maxTwilightPoints","maxStorage","maxFunctionDefs","maxInstructionDefs","maxStackElements","maxSizeOfInstructions","maxComponentElements"):
    setattr(maxp, a, 0)
maxp.maxZones = 1
post = font["post"]; post.formatType = 2.0; post.extraNames = []; post.mapping = {}; post.glyphOrder = glyph_order
font["head"].indexToLocFormat = 0
font.sfntVersion = "\x00\x01\x00\x00"
font.save(dst)
