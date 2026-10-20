"""Ejecuta todas las pruebas. Uso:  python tests/ejecutar_todo.py   (desde la carpeta del repositorio)"""
import subprocess, sys, os, re, time
T = os.path.dirname(os.path.abspath(__file__))
ORDEN = ['board','feat','dnd2','auth','modes','upd','sw','cap','vis','srch','eye','wl','pago','live','e2e']
ESPERADO = {'board':29,'feat':12,'dnd2':24,'auth':31,'modes':22,'upd':4,'sw':8,'cap':2,'vis':5,'srch':9,'eye':7,'wl':4,'pago':8,'live':27,'e2e':5}
malas = 0
for n in ORDEN:
    t = time.time()
    r = subprocess.run([sys.executable, os.path.join(T, n + '.py')], capture_output=True, text=True, encoding='utf-8', errors='replace')
    out = r.stdout + r.stderr
    ok = len(re.findall(r'^OK ', out, re.M)); fail = len(re.findall(r'^FALLA', out, re.M))
    bien = r.returncode == 0 and fail == 0 and ok >= ESPERADO[n]
    print(('✔' if bien else '✘'), n.ljust(6), f'{ok} ok, {fail} fallan  ({time.time()-t:.0f}s)')
    if not bien:
        malas += 1; print('\n'.join(l for l in out.splitlines() if l.startswith('FALLA') or 'Error' in l)[:1500])
print('\nTODO CORRECTO' if not malas else f'\n{malas} grupo(s) con problemas')
sys.exit(1 if malas else 0)
