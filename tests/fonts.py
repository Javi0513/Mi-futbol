# Sirve Barlow desde npm local cuando la pagina pide Google Fonts (la sandbox no llega a Google)
from playwright.sync_api import BrowserContext, Browser
import os
D=os.environ.get('FONTSOURCE_DIR','')
FILES={}
CSS=''
for fam,slug in [('Barlow Condensed','barlow-condensed'),('Barlow','barlow')]:
    for w in (400,500,600,700,800):
        import os
        f=f'{D}{slug}/files/{slug}-latin-{w}-normal.woff2'
        if os.path.exists(f):
            FILES[f'{slug}-{w}.woff2']=f
            CSS+=f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{w};font-display:swap;src:url(https://fonts.gstatic.com/local/{slug}-{w}.woff2) format('woff2')}}\n"
def css(r):r.fulfill(content_type='text/css',body=CSS)
def font(r):
    n=r.request.url.rsplit('/',1)[-1]
    if n in FILES:r.fulfill(content_type='font/woff2',body=open(FILES[n],'rb').read())
    else:r.abort()
def hook(self,*a,**k):
    pg=_o(self,*a,**k);pg.route('https://fonts.googleapis.com/**',css);pg.route('https://fonts.gstatic.com/**',font);return pg
if FILES:
    _o=BrowserContext.new_page;BrowserContext.new_page=hook
_o2=Browser.new_page
def hook2(self,*a,**k):
    pg=_o2(self,*a,**k);pg.route('https://fonts.googleapis.com/**',css);pg.route('https://fonts.gstatic.com/**',font);return pg
Browser.new_page=hook2
