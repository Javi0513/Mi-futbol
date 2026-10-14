# Rutas comunes de las pruebas. Funciona en Windows, Mac y Linux.
import os, shutil, tempfile
TESTS = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(TESTS)
OUT = os.path.join(TESTS, '_salida'); os.makedirs(OUT, exist_ok=True)
_SKIP = {'tests', '.git', 'node_modules', '__pycache__', 'config.js', '.github'}

def fresh_copy():
    """Copia limpia de la web (carpeta raiz del repo) + config.js de prueba. Nunca toca tus archivos."""
    d = tempfile.mkdtemp(prefix='jv32_')
    for n in os.listdir(REPO):
        if n in _SKIP: continue
        s = os.path.join(REPO, n)
        if os.path.isfile(s): shutil.copy(s, d)
    shutil.copy(os.path.join(TESTS, 'test-config.js'), os.path.join(d, 'config.js'))
    return d

APP = fresh_copy()
APP2 = APP  # e2e usa su propia copia (ver e2e.py)
