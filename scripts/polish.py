from pathlib import Path

root = Path(__file__).resolve().parent.parent / 'public'
intro = '<div id="brand-intro" class="brand-intro" aria-hidden="true"><div class="brand-intro-mark"><img class="brand-intro-base" src="/assets/beeldmerk.png" alt="" width="54" height="94"><img class="brand-intro-flame" src="/assets/beeldmerk.png" alt="" width="54" height="94"></div></div>'
for path in [*root.glob('*.html'), *root.glob('fr/*.html'), *root.glob('en/*.html')]:
    source = path.read_text()
    if 'assets/site-polish.css' not in source:
        source = source.replace('</head>', '<link rel="stylesheet" href="/assets/site-polish.css"><script src="/assets/brand-intro.js"></script></head>')
        source = source.replace('<body>', '<body>' + intro, 1)
        path.write_text(source)
print('Titels en introductie toegevoegd aan 60 pagina’s.')
