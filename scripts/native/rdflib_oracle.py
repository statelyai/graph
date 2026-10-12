"""Pinned actual RDFLib parser and isomorphism oracle; no adapter grammar emulation."""
import json
import platform
import sys
from unittest.mock import patch

import rdflib
from rdflib import BNode, Dataset, Graph, ConjunctiveGraph, Literal, URIRef
from rdflib.compare import isomorphic
from rdflib.plugins.parsers.notation3 import RDFSink

EXPECTED_VERSION = '7.6.0'
XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string'
LANG_STRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString'
DEFAULT = URIRef('urn:x-rdflib:default')
rdflib.NORMALIZE_LITERALS = False


def get_term(term, default=False):
    if default:
        return {'termType': 'DefaultGraph', 'value': ''}
    if isinstance(term, URIRef):
        return {'termType': 'NamedNode', 'value': str(term)}
    if isinstance(term, BNode):
        return {'termType': 'BlankNode', 'value': str(term), 'scope': 'native'}
    if isinstance(term, Literal):
        return {'termType': 'Literal', 'value': str(term), 'language': term.language or '',
                'datatype': {'termType': 'NamedNode', 'value': str(term.datatype or (LANG_STRING if term.language else XSD_STRING))}}
    raise ValueError(f'Unsupported native RDF term {type(term).__name__}')


def get_quad(subject, predicate, obj, graph):
    return {'subject': get_term(subject), 'predicate': get_term(predicate), 'object': get_term(obj),
            'graph': get_term(graph, graph == DEFAULT)}


def get_unique(values):
    return list({json.dumps(value, sort_keys=True): value for value in values}.values())


def get_parse(source, syntax, base=None):
    dataset = Dataset()
    statements, graph_events = [], []
    original_graph, original_add, original_conj_add = RDFSink.newGraph, Graph.add, ConjunctiveGraph.add

    def get_graph(sink, identifier):
        graph_events.append(identifier)
        return original_graph(sink, identifier)

    def add_statement(graph, triple):
        # Actual readers normalize their own terms before the public Graph.add call.
        # Observe the statement before the unmodified store performs set deduplication.
        subject, predicate, obj = triple
        statements.append(get_quad(subject, predicate, obj, graph.identifier))
        return original_add(graph, triple)

    def add_conj_statement(graph, triple):
        subject, predicate, obj = triple
        statements.append(get_quad(subject, predicate, obj, graph.default_context.identifier))
        return original_conj_add(graph, triple)

    with patch.object(RDFSink, 'newGraph', get_graph), patch.object(Graph, 'add', add_statement), patch.object(ConjunctiveGraph, 'add', add_conj_statement):
        if syntax in ('nt', 'turtle'):
            dataset.default_graph.parse(data=source, format=syntax, publicID=base)
        else:
            dataset.parse(data=source, format=syntax, publicID=base)
    stored = [get_quad(s, p, o, g) for s, p, o, g in dataset.quads()]
    names = [get_term(graph.identifier) for graph in dataset.graphs() if graph.identifier != DEFAULT]
    names.extend(get_term(identifier) for identifier in graph_events if identifier != DEFAULT)
    return {'version': '1.1', 'quads': get_unique(statements), 'namedGraphs': get_unique(names)}, {
        'quadCount': len(stored), 'namedGraphCount': len([graph for graph in dataset.graphs() if graph.identifier != DEFAULT]),
        'observer': 'actual RDFSink.newGraph events for TriG plus public Graph/ConjunctiveGraph.add before unmodified store deduplication for all syntaxes'}


def get_isomorphism_graph(dataset):
    """Encode dataset roles/names as one RDF graph, retaining shared blank identity."""
    graph, blanks = Graph(), {}
    marker = 'urn:stately:native-oracle:rdf:'

    def get_native(term):
        kind = term['termType']
        if kind == 'NamedNode':
            return URIRef(term['value'])
        if kind == 'BlankNode':
            key = (term.get('scope', ''), term['value'])
            if key not in blanks:
                blanks[key] = BNode()
            return blanks[key]
        if kind == 'Literal':
            # Preserve exact lexical/datatype/tag fields before RDFLib's language equality.
            fields = [term['value'], term['datatype']['value'], term['language']]
            return Literal(json.dumps(fields, ensure_ascii=True), datatype=URIRef(marker + 'literal'))
        if kind == 'DefaultGraph':
            return URIRef(marker + 'default-graph')
        raise ValueError('Unsupported expected term')

    # A synthetic typed default node avoids conflating a user IRI with default identity.
    default = BNode()
    graph.add((default, URIRef(marker + 'role'), URIRef(marker + 'default')))
    names = list(dataset.get('namedGraphs', []))
    for quad in get_unique(dataset['quads']):
        statement = BNode()
        for role in ('subject', 'predicate', 'object', 'graph'):
            term = quad[role]
            graph.add((statement, URIRef(marker + role), default if term['termType'] == 'DefaultGraph' else get_native(term)))
        if quad['graph']['termType'] != 'DefaultGraph':
            names.append(quad['graph'])
    for name in get_unique(names):
        graph.add((get_native(name), URIRef(marker + 'role'), URIRef(marker + 'named-graph')))
    return graph


def get_result(request):
    if rdflib.__version__ != EXPECTED_VERSION:
        raise RuntimeError(f'Oracle requires RDFLib {EXPECTED_VERSION}, found {rdflib.__version__}')
    result = {'oracle': 'rdflib', 'version': rdflib.__version__, 'python': platform.python_version()}
    if request.get('operation') == 'version':
        return result
    syntax = {'N-Triples': 'nt', 'N-Quads': 'nquads', 'Turtle': 'turtle', 'TriG': 'trig'}[request['format']]
    dataset, store = get_parse(request['source'], syntax, request.get('baseIRI'))
    result.update({'dataset': dataset, 'store': store})
    if 'expected' in request:
        result['isomorphic'] = isomorphic(get_isomorphism_graph(dataset), get_isomorphism_graph(request['expected']))
    return result


try:
    print(json.dumps(get_result(json.load(sys.stdin)), ensure_ascii=True))
except Exception as error:
    print(str(error), file=sys.stderr)
    sys.exit(1)
