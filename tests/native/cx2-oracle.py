"""Development-only independent NDEx CX2 reader; bounded by the caller."""
import json
import sys
from importlib.metadata import version
from ndex2.cx2 import CX2Network

if version('ndex2') != '3.12.0':
    raise RuntimeError('Expected ndex2==3.12.0')
source = json.load(sys.stdin)
network = CX2Network()
network.create_from_raw_cx2(source)
json.dump({'oracle': 'ndex2', 'version': version('ndex2'),
           'nodes': list(network.get_nodes().values()),
           'edges': list(network.get_edges().values()),
           'attributes': network.get_network_attributes(),
           'declarations': network.get_attribute_declarations(),
           'opaque': network.get_opaque_aspects(),
           'status': network.get_status()}, sys.stdout, allow_nan=False)
