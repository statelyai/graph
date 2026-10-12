"""Pinned, independent Matrix Market reader/writer. JSON stdin/stdout only."""
import io
import json
import sys
import scipy
import numpy as np
from scipy.io import mmread, mmwrite
from scipy.sparse import issparse, coo_array

request = json.load(sys.stdin)
if scipy.__version__ != '1.18.1' or np.__version__ != '2.5.4':
    raise RuntimeError('SciPy/NumPy native oracle version mismatch')
source = request['source']
value = mmread(io.BytesIO(source.encode('utf-8')))
rows, cols = value.shape
if issparse(value):
    coordinates = value.tocoo()
    entries = [{'row': int(r), 'col': int(c), 'value': float(v)} for r, c, v in zip(coordinates.row, coordinates.col, coordinates.data)]
    stored_zeros = int(np.count_nonzero(coordinates.data == 0))
else:
    entries = [{'row': int(r), 'col': int(c), 'value': float(value[r, c])} for r in range(rows) for c in range(cols) if value[r, c] != 0]
    stored_zeros = None
result = {'oracle': 'scipy', 'scipy': scipy.__version__, 'numpy': np.__version__, 'shape': [rows, cols], 'sparse': bool(issparse(value)), 'entries': entries, 'storedZeros': stored_zeros}
if rows * cols <= request.get('maxDenseCells', 10000):
    result['dense'] = (value.toarray() if issparse(value) else value).tolist()
output = io.BytesIO()
options = request.get('options', {})
mmwrite(output, value, **options)
result['roundTrip'] = output.getvalue().decode('utf-8')
json.dump(result, sys.stdout, allow_nan=False)
