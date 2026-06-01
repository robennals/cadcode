import type { Model, Node, EdgeSelector } from "@cadcode/protocol";

/** Opaque handle the user passes between API calls. Wraps a node id. */
export interface Handle {
  readonly __id: string;
}

export interface EdgeQuery {
  readonly all: EdgeSelector;
}

export interface Builder {
  rect(width: number, height: number): Handle;
  extrude(region: Handle, height: number): Handle;
  fillet(body: Handle, edges: EdgeSelector, radius: number): Handle;
  edges(body: Handle): EdgeQuery;
  getModel(): Model;
}

export function createBuilder(): Builder {
  const nodes: Record<string, Node> = {};
  const order: string[] = [];
  const alive = new Set<string>();
  let counter = 0;

  const nextId = (op: string) => `${op}_${counter++}`;

  const add = (node: Node, consumes: string[]): Handle => {
    nodes[node.id] = node;
    order.push(node.id);
    for (const c of consumes) alive.delete(c);
    // rects are regions, not bodies; only bodies are "alive" (renderable)
    if (node.op !== "rect") alive.add(node.id);
    return { __id: node.id };
  };

  return {
    rect(width, height) {
      return add({ id: nextId("rect"), op: "rect", width, height }, []);
    },
    extrude(region, height) {
      return add(
        {
          id: nextId("extrude"),
          op: "extrude",
          region: region.__id,
          height,
          sources: [region.__id],
        },
        [region.__id],
      );
    },
    fillet(body, edges, radius) {
      return add(
        {
          id: nextId("fillet"),
          op: "fillet",
          body: body.__id,
          edges,
          radius,
          sources: [body.__id],
        },
        [body.__id],
      );
    },
    edges(body) {
      return { all: { body: body.__id, kind: "all" } };
    },
    getModel() {
      return { nodes: { ...nodes }, order: [...order], alive: [...alive] };
    },
  };
}
