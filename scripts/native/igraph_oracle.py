"""Pinned igraph C-backed file reader oracle; one JSON request, private temporary file."""

import json
import platform
import sys
import tempfile
import warnings
from pathlib import Path

import igraph

EXPECTED_VERSION = "1.0.0"


def get_summary(graph):
    return {
        "directed": graph.is_directed(),
        "graph": {name: graph[name] for name in graph.attributes()},
        "nodes": [{"id": vertex.index, "attributes": vertex.attributes()} for vertex in graph.vs],
        "edges": [
            {"source": edge.source, "target": edge.target, "attributes": edge.attributes()}
            for edge in graph.es
        ],
    }


def get_result(request):
    if igraph.__version__ != EXPECTED_VERSION:
        raise RuntimeError(f"Oracle requires igraph {EXPECTED_VERSION}, found {igraph.__version__}")
    result = {"oracle": "igraph", "version": igraph.__version__, "python": platform.python_version()}
    if request.get("operation") == "version":
        return result
    if request.get("operation") != "pajek" or not isinstance(request.get("source"), str):
        raise ValueError("Only the native Pajek text reader operation is supported")
    # The C reader is file based. Keep its UTF-8 input private and remove it on exit.
    with tempfile.TemporaryDirectory(prefix="graph-native-igraph-") as directory:
        filename = Path(directory) / "fixture.net"
        filename.write_text(request["source"], encoding="utf-8")
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter("always")
            graph = igraph.Graph.Read_Pajek(str(filename))
        result.update({"summary": get_summary(graph), "warnings": [str(warning.message) for warning in captured]})
    return result


def to_output():
    try:
        request = json.load(sys.stdin)
        if not isinstance(request, dict):
            raise ValueError("Oracle request must be an object")
        json.dump(get_result(request), sys.stdout, ensure_ascii=False, allow_nan=False)
        sys.stdout.write("\n")
    except Exception as error:
        json.dump({"oracle": "igraph", "version": igraph.__version__, "error": type(error).__name__, "message": str(error)}, sys.stderr, ensure_ascii=False, allow_nan=False)
        sys.stderr.write("\n")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(to_output())
