"""Build a dependency-free, offline HTML role-portal visualization."""
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parent
LEGACY_DIR=ROOT/'legacy'

def read_utf8(path):
    return path.read_text(encoding='utf-8')

def safe_json(text):
    return text.replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')

def build():
    LEGACY_DIR.mkdir(exist_ok=True)
    css=read_utf8(ROOT/'styles.css')+'\n'+read_utf8(ROOT/'roles.css')
    app=read_utf8(ROOT/'base-app.js')+'\n'+read_utf8(ROOT/'role-views.js')
    for content in [read_utf8(ROOT/'roles.json'),read_utf8(ROOT/'permissions.json'),read_utf8(ROOT/'source.json')]:json.loads(content)
    html='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="AuditSphere 14-role interactive prototype. Synthetic data only. No backend or real authorization."><title>AuditSphere · Role Portals v2</title><style>'''+css+'''</style></head><body><div id="app"></div><div id="modal-root"></div><div class="toast-stack" id="toasts" aria-live="polite"></div><input type="file" id="document-picker" class="hidden" accept=".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg"><input type="file" id="tb-picker" class="hidden" accept=".csv,text/csv"><noscript>JavaScript is needed for this local demonstration. No actual authentication or provider operations are implemented.</noscript>'''
    for id,f in [('prd-data','source.json'),('role-data','roles.json'),('permission-data','permissions.json')]:
        html+=f'<script type="application/json" id="{id}">'+safe_json(read_utf8(ROOT/f))+'</script>'
    html+='<script>\n'+app.replace('</script','<\\/script')+'\n</script></body></html>'
    # The Vite entrypoint owns the root index.html now. Keep the original
    # dependency-free artifact available as a generated compatibility build.
    (LEGACY_DIR/'index.html').write_text(html, encoding='utf-8')
    (ROOT/'app.bundle.js').write_text(app, encoding='utf-8')
    print(f'Built legacy/index.html ({len(html.encode()):,} bytes).')
if __name__=='__main__':build()
