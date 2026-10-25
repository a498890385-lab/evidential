import pymupdf, os
p = r"F:\apps\bayes\test-export\示例：SaaS 项目能否盈利-20261024.pdf"
doc = pymupdf.open(p)
txt = "\n".join(page.get_text() for page in doc)
open(r"F:\apps\bayes\pdf-text.txt", "w", encoding="utf-8").write(txt)
pix = doc[0].get_pixmap(dpi=110)
pix.save(r"F:\apps\bayes\pdf-page1.png")
print("pages:", doc.page_count, "chars:", len(txt), "png:", os.path.getsize(r"F:\apps\bayes\pdf-page1.png"))
