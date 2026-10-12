import org.apache.tinkerpop.gremlin.structure.io.graphson.GraphSONMapper
import org.apache.tinkerpop.gremlin.structure.io.graphson.GraphSONVersion
import org.apache.tinkerpop.gremlin.structure.io.graphson.GraphSONXModuleV3
import org.apache.tinkerpop.gremlin.structure.io.graphson.TypeInfo
import org.apache.tinkerpop.gremlin.tinkergraph.structure.TinkerGraph
import org.apache.tinkerpop.gremlin.tinkergraph.structure.TinkerIoRegistryV3
import groovy.json.JsonOutput

def mapper=GraphSONMapper.build().version(GraphSONVersion.V3_0).addRegistry(TinkerIoRegistryV3.instance()).addCustomModule(GraphSONXModuleV3.build().create(false, TypeInfo.PARTIAL_TYPES)).create().createMapper()
def input=System.in.text
def graph=input.trim() == 'GENERATE_MODERN' ? org.apache.tinkerpop.gremlin.tinkergraph.structure.TinkerFactory.createModern() : mapper.readValue(input,TinkerGraph)
println JsonOutput.toJson([version:org.apache.tinkerpop.gremlin.util.Gremlin.version(),vertices:graph.vertices().collect{[id:it.id().toString(),type:it.id().getClass().name,label:it.label(),properties:it.properties().collect{p->[id:p.id().toString(),key:p.key(),value:mapper.writeValueAsString(p.value()),valueClass:p.value()?.getClass()?.name,meta:p.properties().collect{m->[key:m.key(),value:mapper.writeValueAsString(m.value())]}]}]},edges:graph.edges().collect{[id:it.id().toString(),type:it.id().getClass().name,label:it.label(),source:it.outVertex().id().toString(),target:it.inVertex().id().toString(),properties:it.properties().collect{p->[key:p.key(),value:mapper.writeValueAsString(p.value()),valueClass:p.value()?.getClass()?.name]}]},roundTrip:mapper.writeValueAsString(graph)])
