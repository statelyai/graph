"""Pinned native reader/writer oracle. One JSON request on stdin; no graph emulation."""

import io
import json
import platform
import sys

import networkx as nx

EXPECTED_VERSION = "3.7"


def get_summary(graph):
    nodes = [{"id": node, "attributes": dict(attrs)} for node, attrs in graph.nodes(data=True)]
    if graph.is_multigraph():
        edges = [
            {"source": source, "target": target, "key": key, "attributes": dict(attrs)}
            for source, target, key, attrs in graph.edges(keys=True, data=True)
        ]
    else:
        edges = [
            {"source": source, "target": target, "attributes": dict(attrs)}
            for source, target, attrs in graph.edges(data=True)
        ]
    return {
        "directed": graph.is_directed(),
        "multigraph": graph.is_multigraph(),
        "graph": dict(graph.graph),
        "nodes": nodes,
        "edges": edges,
    }


def get_result(request):
    if nx.__version__ != EXPECTED_VERSION:
        raise RuntimeError(f"Oracle requires NetworkX {EXPECTED_VERSION}, found {nx.__version__}")
    result = {"oracle": "networkx", "version": nx.__version__, "python": platform.python_version()}
    operation = request.get("operation")
    if operation == "version":
        return result
    options = request.get("options", {})
    if operation == "node-link":
        # Pass only official 3.7 node-link keywords; errors remain native errors.
        names = {key: options[key] for key in ("source", "target", "name", "key", "edges", "nodes") if key in options}
        graph = nx.node_link_graph(request["data"], **names)
        native = nx.node_link_data(graph, **names)
    elif operation == "gml":
        graph = nx.parse_gml(request["source"], label=options.get("label", None))
        native = nx.node_link_data(graph)
    elif operation == "pajek":
        graph = nx.read_pajek(io.BytesIO(request["source"].encode("utf-8")), encoding="UTF-8")
        native = nx.node_link_data(graph)
    else:
        raise ValueError(f"Unsupported oracle operation: {operation}")
    result.update({"summary": get_summary(graph), "roundTrip": native})
    return result


def to_output():
    try:
        request = json.load(sys.stdin)
        if not isinstance(request, dict):
            raise ValueError("Oracle request must be an object")
        result = get_result(request)
        json.dump(result, sys.stdout, ensure_ascii=False, allow_nan=False)
        sys.stdout.write("\n")
    except Exception as error:
        json.dump({"oracle": "networkx", "version": nx.__version__, "error": type(error).__name__, "message": str(error)}, sys.stderr, ensure_ascii=False, allow_nan=False)
        sys.stderr.write("\n")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(to_output())
