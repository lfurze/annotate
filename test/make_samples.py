#!/usr/bin/env python3
"""Generate sample PDF / DOCX / PNG for QA (stdlib only)."""
import os, struct, zlib, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "samples")
os.makedirs(OUT, exist_ok=True)


def make_png(path, w=900, h=600):
    def chunk(typ, data):
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter type none
        for x in range(w):
            r = int(60 + 180 * x / w)
            g = int(90 + 120 * y / h)
            b = int(200 - 120 * x / w)
            # draw a couple of reference boxes
            if 80 < x < 320 and 80 < y < 240:
                r, g, b = 245, 245, 250
            if 480 < x < 820 and 320 < y < 520:
                r, g, b = 30, 36, 48
            raw += bytes((r & 255, g & 255, b & 255))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))
    print("wrote", path)


def make_pdf(path):
    # minimal 2-page PDF with text
    objs = []

    def obj(s):
        objs.append(s)
        return len(objs)

    def stream(text):
        content = ("BT /F1 24 Tf 72 700 Td (%s) Tj ET\n"
                   "BT /F1 14 Tf 72 660 Td (The quick brown fox jumps over the lazy dog.) Tj ET\n"
                   "1 0 0 1 72 200 cm 0 0 m 400 300 l S" % text)
        return content

    # We'll assemble manually for correct xref offsets.
    pages_kids = "4 0 R 6 0 R"
    parts = []
    parts.append("1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n")
    parts.append("2 0 obj<</Type/Pages/Kids[%s]/Count 2>>endobj\n" % pages_kids)
    parts.append("3 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n")
    for i, (pageno, content) in enumerate([(4, stream("Sample PDF - Page 1")), (6, stream("Sample PDF - Page 2"))]):
        cobj = pageno + 1
        parts.append("%d 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 3 0 R>>>>/Contents %d 0 R>>endobj\n" % (pageno, cobj))
        parts.append("%d 0 obj<</Length %d>>stream\n%s\nendstream endobj\n" % (cobj, len(content) + 1, content))
    header = "%PDF-1.4\n"
    body = ""
    offsets = []
    pos = len(header)
    for p in parts:
        offsets.append(pos)
        body += p
        pos += len(p)
    xref_pos = len(header) + len(body)
    n = len(parts) + 1
    xref = "xref\n0 %d\n0000000000 65535 f \n" % n
    for off in offsets:
        xref += "%010d 00000 n \n" % off
    trailer = "trailer<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF" % (n, xref_pos)
    with open(path, "wb") as f:
        f.write((header + body + xref + trailer).encode("latin-1"))
    print("wrote", path)


def make_docx(path):
    doc = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Sample DOCX Document</w:t></w:r></w:p>
<w:p><w:r><w:t>This is a paragraph of body text used to verify DOCX rendering and annotation overlay. It should wrap across multiple lines so we can highlight and comment on it.</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>A subheading</w:t></w:r></w:p>
<w:p><w:r><w:t>Another paragraph with some </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r><w:r><w:t> and </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>italic</w:t></w:r><w:r><w:t> text for good measure.</w:t></w:r></w:p>
<w:p><w:r><w:t>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</w:t></w:r></w:p>
</w:body></w:document>'''
    styles = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
</w:styles>'''
    ctypes = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>'''
    rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''
    drels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>'''
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ctypes)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", doc)
        z.writestr("word/styles.xml", styles)
        z.writestr("word/_rels/document.xml.rels", drels)
    print("wrote", path)


if __name__ == "__main__":
    make_png(os.path.join(OUT, "sample-image.png"))
    make_pdf(os.path.join(OUT, "sample.pdf"))
    make_docx(os.path.join(OUT, "sample.docx"))
