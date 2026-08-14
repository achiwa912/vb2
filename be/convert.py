import json
from datetime import datetime
from .schemas import BookSchema, WordSchema, ExportResp

with open("/vocabull.json", "r") as f:
    old_data = json.load(f)

books = []
words = []
bix = 1
wix = 1
for book_name in old_data.keys():
    b = BookSchema(
        id=bix,
        name=book_name,
        last_edited=datetime.now(),
        wd_last_practiced=None,
        dw_last_practiced=None,
        user_id=1,
    )
    books.append(b)
    for word in old_data[book_name]:
        w = WordSchema(
            id=wix,
            word=word[0] if word[0] else f"dummy{wix}",
            definition=word[1] if len(word) > 1 else "",
            sample=word[2] if len(word) > 2 else "",
            last_edited=datetime.now(),
            book_id=bix,
        )
        words.append(w)
        wix += 1
    bix += 1

exprt = ExportResp(books=books, words=words, practices=[]).model_dump(mode="json")
with open("output.json", "w") as f:
    json.dump(exprt, f, indent=2)
