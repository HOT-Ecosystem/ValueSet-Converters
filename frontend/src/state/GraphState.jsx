import React, {createContext, useContext, useReducer, useState} from "react";
import {get, once, sum, sortBy, uniq, flatten, intersection,
        difference, differenceWith, unionWith, intersectionWith, isEmpty} from "lodash";
import Graph from "graphology";
import {bidirectional} from 'graphology-shortest-path/unweighted';

export const makeGraph = (edges, concepts) => {
  const graph = new Graph({allowSelfLoops: false, multi: false, type: 'directed'});
  let nodes = {};
  // add each concept as a node in the graph, the concept properties become the node attributes
  for (let c of concepts) {
    let nodeId = c.concept_id;
    graph.addNode(nodeId);
    nodes[nodeId] = {...c};
  }
  for (let edge of edges) {
    graph.addDirectedEdge(edge[0], edge[1]);
  }
  return [graph, nodes];
};

const graphReducer = (gc, action) => {
  if (!(action && action.type)) return gc;
  // let { graph, nodes } = gc;
  let graph;
  switch (action.type) {
    case 'CREATE':
      gc = new GraphContainer(action.payload);
      break;
    case 'TOGGLE_NODE_EXPANDED':
      gc.toggleNodeExpanded(action.payload.nodeId);
      gc = new GraphContainer(null, gc);
      break;
    case 'TOGGLE_OPTION':
      const type = action.payload.type;
      gc.options.specialConceptTreatment[type] = ! gc.options.specialConceptTreatment[type];
      gc.statsOptions[type].specialTreatment = gc.options.specialConceptTreatment[type];
      gc = new GraphContainer(null, gc);
      break;
    default:
      throw new Error(`unexpected action.type ${action.type}`);
  }
  return gc;
};

export class GraphContainer {
  constructor(graphData, cloneThis) {
    if (cloneThis) {
      // shallow copy cloneThis's properties to this
      Object.assign(this, cloneThis);
      this.getVisibleRows();
      return;
    }
    let {concepts, specialConcepts, csmi, edges, concept_ids, filled_gaps, missing_from_graph,
      hidden_by_vocab, nonstandard_concepts_hidden} = graphData;
    Object.assign(this, {concept_ids, filled_gaps, missing_from_graph,
      hidden_by_vocab, nonstandard_concepts_hidden});
    let graphConceptIds = uniq(flatten(edges));
    // this.graphConcepts = concepts.filter(c => graphConceptIds.includes(c.concept_id));
    this.#makeGraph(edges, concepts);  // sets this.graph and this.nodes

    this.roots = this.graph.nodes().filter(n => !this.graph.inDegree(n));
    this.leaves = this.graph.nodes().filter(n => !this.graph.outDegree(n));
    this.unlinkedConcepts = intersection(this.roots, this.leaves);

    let unlinkedConceptsParent = {
      "concept_id": 'unlinked',
      "concept_name": "Concepts in set but not linked to others",
      "vocabulary_id": "--",
      "standard_concept": "",
      "total_cnt": 0,
      "distinct_person_cnt": "0",
      "status": ""
    };
    this.graph.addNode('unlinked');
    this.nodes['unlinked'] = unlinkedConceptsParent;
    for (let c of this.unlinkedConcepts) {
      this.graph.addDirectedEdge('unlinked', c);
    }
    this.roots = this.graph.nodes().filter(n => !this.graph.inDegree(n));
    this.leaves = this.graph.nodes().filter(n => !this.graph.outDegree(n));

    this.#computeAttributes();
    this.concepts = concepts;
    this.specialConcepts = specialConcepts;

    this.options = {
      specialConceptTreatment: {},
    };
    this.setStatsOptions({concepts, concept_ids, specialConcepts, csmi, });
    this.getVisibleRows();
  }
  toggleNodeExpanded(nodeId) {
    const node = this.nodes[nodeId];
    this.nodes = {...this.nodes, [nodeId]: {...node, expanded:!node.expanded}};
  }
  setStatsOptions({concepts, concept_ids, csmi,}) {
    const visibleConcepts = this.visibleRows || []; // first time through, don't have visible rows yet
    const visibleCids = visibleConcepts.map(r => r.concept_id);
    let displayOrder = 0;
    let rows = {
      visibleRows: {
        name: "Visible rows", displayOrder: displayOrder++,
        value: visibleConcepts.length,
      },
      concepts: {
        name: "Concepts", displayOrder: displayOrder++,
        value: concept_ids.length,
        hiddenConceptCnt: setOp('difference', concept_ids, visibleCids).length,
      },
      definitionConcepts: {
        name: "Definition concepts", displayOrder: displayOrder++,
        value: this.specialConcepts.definitionConcepts.length,
        hiddenConceptCnt: setOp('difference', this.specialConcepts.definitionConcepts, visibleCids).length,
        specialTreatmentDefault: false,
        specialTreatmentRule: 'show though collapsed',
      },
      added: {
        name: "Added", displayOrder: displayOrder++,
        value: get(this.specialConcepts, 'added.length', undefined),
        hiddenConceptCnt: setOp('difference', this.specialConcepts.added, visibleCids).length,
        specialTreatmentDefault: false,
        specialTreatmentRule: 'show though collapsed',
      },
      removed: {
        name: "Removed", displayOrder: displayOrder++,
        value: get(this.specialConcepts, 'removed.length', undefined),
        hiddenConceptCnt: setOp('difference', this.specialConcepts.removed, visibleCids).length,
        specialTreatmentDefault: false,
        specialTreatmentRule: 'show though collapsed',
      },
      expansion: {
        name: "Expansion concepts", displayOrder: displayOrder++,
        value: uniq(flatten(Object.values(csmi).map(Object.values))
                .filter(c => c.csm).map(c => c.concept_id)).length,
        hiddenConceptCnt: setOp('difference', concept_ids, visibleCids).length,
      },
      standard: {
        name: "Standard concepts", displayOrder: displayOrder++,
        value: concepts.filter(c => c.standard_concept === 'S').length,
      },
      classification: {
        name: "Classification concepts", displayOrder: displayOrder++,
        value: concepts.filter(c => c.standard_concept === 'C').length,
      },
      nonStandard: {
        name: "Non-standard", displayOrder: displayOrder++,
        value: this.specialConcepts.nonStandard.length,
        visibleConceptCnt: setOp('intersection', this.specialConcepts.nonStandard, visibleCids).length,
        hiddenConceptCnt:  setOp('intersection', this.specialConcepts.nonStandard, this.hideThoughExpanded).length,
        specialTreatmentDefault: false,
        specialTreatmentRule: 'hide though expanded',
      },
      zeroRecord: {
        name: "Zero records / patients", displayOrder: displayOrder++,
        value: this.specialConcepts.zeroRecord.length,
        visibleConceptCnt: setOp('intersection', this.specialConcepts.zeroRecord, visibleCids).length,
        hiddenConceptCnt: setOp('intersection', this.specialConcepts.zeroRecord, [...(this.hideThoughExpanded || [])]).length,
        specialTreatmentDefault: false,
        specialTreatmentRule: 'hide though expanded',
      },
    }
    for (let type in rows) {
      let row = {...get(this, ['statsOptions', type], {}), ...rows[type]};  // don't lose stuff previously set
      if (typeof(row.value) === 'undefined') {  // don't show rows that don't represent any concepts
        delete rows[type];
        continue;
      }
      row.type = type;
      if (isEmpty(this.statsOptions) && typeof(row.specialTreatmentDefault) !== 'undefined') {
        row.specialTreatment = row.specialTreatmentDefault;
      }
      if (type in this.specialConcepts) {
        this.options.specialConceptTreatment[type] = row.specialTreatment;
      }
      rows[type] = row;
    }
    this.statsOptions = rows;
  };
  getStatsOptions() {
    return sortBy(this.statsOptions, d => d.displayOrder);
  }

  /* adds the node to the list of visible nodes
      if it is set to be expanded, recurse and add its children to the list
      if it has descendants that are in showThoughCollapsed, show those descendants, but
        not it's other children/descendants
      if it is in hideThoughExpanded, don't display it BUT -- do display its
        descendants, either from being expanded or being in showThoughCollapsed
   */
  addNodeToVisible(nodeId, displayedRows, showThoughCollapsed, hideThoughExpanded, depth = 0) {
    const node = {...this.nodes[nodeId], depth};
    if (hideThoughExpanded.has(parseInt(nodeId))) {
      // TODO: not sure how to keep descendants with showThoughCollapsed, but not show this node
      // console.log(node);
    } else {
      displayedRows.push(node);
    }
    const childIds = this.graph.outNeighbors(nodeId); // Get outgoing neighbors (children)
    if (node.expanded) {
      childIds.forEach(childId => {
        this.addNodeToVisible(childId, displayedRows, showThoughCollapsed, hideThoughExpanded, depth + 1); // Recurse
      });
    } else {
      showThoughCollapsed.forEach(showThoughCollapsedId => {
        if (showThoughCollapsedId != nodeId) {
          try {
            let path = bidirectional(this.graph, nodeId, showThoughCollapsedId);
            // TODO: only show it if it's not a descendant of one of this node's descendants
            //    that is, make sure to put the path as low in the tree as possible
            if (path) {
              path.shift();
              const id = path.pop();
              console.assert(id == showThoughCollapsedId);
              const nd = {...this.nodes[id], depth: depth + 1, path};

              displayedRows.push(nd);
              showThoughCollapsed.delete(id);
              if (nd.expanded) {
                const childIds = this.graph.outNeighbors(id); // Get outgoing neighbors (children)
                sortBy(childIds, this.sortFunc).forEach(childId => {
                  this.addNodeToVisible(childId, displayedRows, showThoughCollapsed, hideThoughExpanded, depth + 2); // Recurse
                });
              }
              /*
              path.forEach((id, i) => {
                displayedRows.push({...this.nodes[id], depth: depth + 1 + i});
                showThoughCollapsed.delete(id);
              });
              */
            }
          } catch (e) {
            console.log(e);
          }
        } else {
          showThoughCollapsed.delete(showThoughCollapsedId);
        }
      })
    }
    // return displayedRows;
  }

  sortFunc = (d => {
    let n = this.nodes[d];
    let statusRank = n.isItem && 3 + n.added && 2 + n.removed && 1 || 0;
    // return - (n.drc || n.descendantCount || n.levelsBelow || n.status ? 1 : 0);
    return - (n.levelsBelow || n.descendantCount || n.status ? 1 : 0);
  })

  getVisibleRows(props) {
    // TODO: need to treat things to hide differently from things to always show.
    // let { specialConcepts = [] } = props;
    let showThoughCollapsed = new Set();
    let hideThoughExpanded = new Set();
    for (let type in this.options.specialConceptTreatment) {
      if (this.statsOptions[type].specialTreatmentRule === 'show though collapsed' && this.options.specialConceptTreatment[type]) {
        for (let id of this.specialConcepts[type] || []) {
          showThoughCollapsed.add(id);
        }
      }
    }

    // const {/*collapsedDescendantPaths, */ collapsePaths, hideZeroCounts, hideRxNormExtension, nested } = hierarchySettings;
    let displayedRows = [];

    for (let nodeId of sortBy(this.roots, this.sortFunc)) {
      this.addNodeToVisible(nodeId, displayedRows, showThoughCollapsed, hideThoughExpanded);
    }

    for (let type in this.options.specialConceptTreatment) {
      if (this.statsOptions[type].specialTreatmentRule === 'hide though expanded' && this.options.specialConceptTreatment[type]) {
        for (let id of setOp('intersection', this.specialConcepts[type], displayedRows.map(d => d.concept_id))) {
          hideThoughExpanded.add(id);
        }
      }
    }
    displayedRows = displayedRows.filter(row => ! hideThoughExpanded.has(row.concept_id));

    this.hideThoughExpanded = hideThoughExpanded;
    return this.visibleRows = displayedRows;
  }
  
  #makeGraph(edges, concepts) {
    const [graph, nodes] = makeGraph(edges, concepts);
    this.graph = graph;
    this.nodes = nodes;
  }
  #computeAttributes() {
    const graph = this.graph;
    let nodes = this.nodes;
    function computeAttributesFunc(nodeId, level) {
      let node = nodes[nodeId];
      // Check if the attributes have already been computed to avoid recomputation
      if (node.descendantCount !== undefined) {
        return node;
      }

      let levelsBelow = 0;


      const childIds = graph.outNeighbors(node.concept_id); // Get outgoing neighbors (children)
      let descendants = childIds;

      childIds.forEach(childId => {
        let child = computeAttributesFunc(childId, level + 1);

        levelsBelow = Math.max(levelsBelow, 1 + child.levelsBelow); // Update max depth if this path is deeper
        if (child.descendants) {
          descendants = descendants.concat(child.descendants);
        }
      });

      // nodes[nodeId] = node = {...node, descendantCount: descendants.length, levelsBelow, drc};
      nodes[nodeId] = node = {...node};
      // node.level = level; not sure why level isn't always correct;
      //  to see problem, try `gc.visibleRows.filter(d => d.depth != d.level)` from comparison renderer
      node.levelsBelow = levelsBelow;
      node.descendantCount = 0;
      node.childCount = 0;
      node.drc = node.total_cnt || 0;

      if (levelsBelow > 0) {
        node.expanded = false;  // TODO: deal with expanded differently for shown and hidden
        node.hasChildren = true;
        node.descendants = uniq(descendants); // Remove duplicates
        node.descendantCount = node.descendants.length;
        node.drc += sum(node.descendants.concat(nodeId).map(d => nodes[d].total_cnt || 0)); // Compute descendant counts
        node.children = childIds;
        node.childCount = childIds.length;
      }

      return node;
    }

    // Iterate over all nodes to compute and store attributes
    this.graph.nodes().forEach(node => {
      computeAttributesFunc(node, 0);
    });
    return nodes;
  }
  withAttributes(edges) {
    // this is temporary just to keep the indented stuff working a little while longer
    const graph = new Graph({allowSelfLoops: false, multi: false, type: 'directed'});
    // add each concept as a node in the graph, the concept properties become the node attributes
    Object.entries(this.nodes).forEach(([nodeId, node]) => {
      graph.addNode(nodeId, {...node});
    })
    for (let edge of edges) {
      graph.addDirectedEdge(edge[0], edge[1]);
    }
    return graph;
  }
}

const GraphContext = createContext(null);

export const GraphProvider = ({ children }) => {
  const [gc, gcDispatch] = useReducer(graphReducer, {});

  return (
    <GraphContext.Provider value={{ gc, gcDispatch }}>
      {children}
    </GraphContext.Provider>
  );
};

export const useGraphContainer = () => {
  const context = useContext(GraphContext);
  if (context === undefined) {
    throw new Error('useGraphContainer must be used within a GraphProvider');
  }
  return context;
};

function setOp(op, setA, setB) {
  const f = ({
    union: unionWith,
    difference: differenceWith,
    intersection: intersectionWith
  })[op];
  return f(setA, setB, (itemA, itemB) => itemA == itemB);
}
/* use like:
  const { {graph, nodes}, gcDispatch } = useGraphContainer();
  const toggleNodeAttribute = (nodeId) => {
    gcDispatch({
      type: 'TOGGLE_NODE_ATTRIBUTE',
      payload: { nodeId },
    });
  };
*/

// experiment, from https://chat.openai.com/share/8e817f4d-0581-4b07-aefe-acd5e7110de6
/*
function prepareDataForRendering(graph, startNodeId) {
  let result = [];
  let stack = [{ nodeId: startNodeId, depth: 0 }];
  let visited = new Set([startNodeId]);

  while (stack.length > 0) {
    const { nodeId, depth } = stack.pop();
    const nodeData = graph.getNodeAttributes(nodeId);

    result.push({
                  id: nodeId,
                  name: nodeData.label || nodeId, // Assuming nodes have a 'label' attribute
                  otherData: nodeData.otherData, // Add other node attributes as needed
                  depth,
                  visible: true, // Initially, all nodes are visible
                  hasChildren: graph.outDegree(nodeId) > 0,
                  expanded: false
                });

    // Reverse to maintain the correct order after pushing to stack
    const neighbors = [...graph.neighbors(nodeId)].reverse();
    neighbors.forEach(neighbor => {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        stack.push({ nodeId: neighbor, depth: depth + 1 });
      }
    });
  }

  return result;
}
*/