"""Build the bundled 66-book WEB text from eBible's public-domain USFX archive.
Usage: python3 scripts/build-bible.py /path/to/eng-web_usfx.zip
The archive is downloaded separately from https://ebible.org/Scriptures/eng-web_usfx.zip.
"""
import sys, json, re, zipfile, hashlib
from pathlib import Path
from xml.etree import ElementTree as ET
BOOKS = [('GEN','Genesis'),('EXO','Exodus'),('LEV','Leviticus'),('NUM','Numbers'),('DEU','Deuteronomy'),('JOS','Joshua'),('JDG','Judges'),('RUT','Ruth'),('1SA','1 Samuel'),('2SA','2 Samuel'),('1KI','1 Kings'),('2KI','2 Kings'),('1CH','1 Chronicles'),('2CH','2 Chronicles'),('EZR','Ezra'),('NEH','Nehemiah'),('EST','Esther'),('JOB','Job'),('PSA','Psalms'),('PRO','Proverbs'),('ECC','Ecclesiastes'),('SNG','Song of Solomon'),('ISA','Isaiah'),('JER','Jeremiah'),('LAM','Lamentations'),('EZK','Ezekiel'),('DAN','Daniel'),('HOS','Hosea'),('JOL','Joel'),('AMO','Amos'),('OBA','Obadiah'),('JON','Jonah'),('MIC','Micah'),('NAM','Nahum'),('HAB','Habakkuk'),('ZEP','Zephaniah'),('HAG','Haggai'),('ZEC','Zechariah'),('MAL','Malachi'),('MAT','Matthew'),('MRK','Mark'),('LUK','Luke'),('JHN','John'),('ACT','Acts'),('ROM','Romans'),('1CO','1 Corinthians'),('2CO','2 Corinthians'),('GAL','Galatians'),('EPH','Ephesians'),('PHP','Philippians'),('COL','Colossians'),('1TH','1 Thessalonians'),('2TH','2 Thessalonians'),('1TI','1 Timothy'),('2TI','2 Timothy'),('TIT','Titus'),('PHM','Philemon'),('HEB','Hebrews'),('JAS','James'),('1PE','1 Peter'),('2PE','2 Peter'),('1JN','1 John'),('2JN','2 John'),('3JN','3 John'),('JUD','Jude'),('REV','Revelation')]
archive=Path(sys.argv[1]); raw=zipfile.ZipFile(archive).read('eng-web_usfx.xml'); tree=ET.fromstring(raw); rows=[]
for index,(code,name) in enumerate(BOOKS):
 book=tree.find(f"book[@id='{code}']")
 assert book is not None, code
 state={'chapter':0,'verse':None,'parts':[]}
 def flush():
  if state['verse'] is not None:
   text=re.sub(r'\s+',' ',''.join(state['parts'])).strip()
   if text: rows.append([index,state['chapter'],state['verse'],text])
  state['verse']=None;state['parts']=[]
 def walk(node):
  if node.tag in ('f','x','fig','va','ca'):return
  if node.tag=='c': flush();state['chapter']=int(node.attrib['id'])
  elif node.tag=='v': flush();state['verse']=int(node.attrib['id'])
  elif node.tag=='ve':flush()
  if state['verse'] is not None and node.text:state['parts'].append(node.text)
  for child in node:
   walk(child)
   if state['verse'] is not None and child.tail:state['parts'].append(child.tail)
 walk(book);flush()
assert len(rows)>31000,len(rows)
assert len({tuple(r[:3]) for r in rows})==len(rows)
for book,ch,v,text in rows:
 if (book,ch,v)==(42,3,16): print('John 3:16:',text)
 if (book,ch,v)==(18,23,1): print('Psalm 23:1:',text)
result={'translation':'WEB','name':'World English Bible Classic','source':'https://ebible.org/eng-web/','sourceSha256':hashlib.sha256(raw).hexdigest(),'books':[name for _,name in BOOKS],'verses':rows}
output=Path(__file__).resolve().parent.parent/'public/bible/web.json';output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
print(f'Wrote {len(rows)} verses to {output}')
