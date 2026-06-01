// The user-facing modelling API. `createBuilder()` returns the functions a user
// script calls (rect/extrude/fillet/edges); each call records an immutable graph
// node and tracks which bodies are still "alive" (not consumed). Pure data — no
// geometry is computed here; that happens later in the kernel via the runtime.
import type {
  Model,
  Node,
  EdgeSelector,
  RenderDecl,
  PointDef,
  LineDef,
  ConstraintDef,
} from "@cadcode/protocol";

/** Opaque handle the user passes between API calls. Wraps a node id. */
export interface Handle {
  readonly __id: string;
}

export interface EdgeQuery {
  readonly all: EdgeSelector;
}

/** A sketch point handle. */
export interface Point {
  readonly __id: string;
}

/** A sketch line handle, exposing its two endpoint points. */
export interface Line {
  readonly __id: string;
  readonly start: Point;
  readonly end: Point;
}

export interface Builder {
  rect(width: number, height: number): Handle;
  extrude(region: Handle, height: number): Handle;
  fillet(body: Handle, edges: EdgeSelector, radius: number): Handle;
  edges(body: Handle): EdgeQuery;
  /** Declare what to render: the primary object plus named, viewable stages. */
  render(primary: Handle, stages?: Record<string, Handle>): void;
  // --- sketch constraints (M1) ---
  point(x?: number, y?: number): Point;
  lines(n: number): Line[];
  coincident(...pairs: [Point, Point][]): void;
  parallel(...groups: Line[][]): void;
  perpendicular(a: Line, b: Line): void;
  equal(lines: Line[]): void;
  horizontal(line: Line): void;
  vertical(line: Line): void;
  distance(a: Point, b: Point, value: number): void;
  sketch<T extends Record<string, Line>>(entities: T): T & Handle & { region: Handle };
  getModel(): Model;
}

/** Merge coincident points (union-find), then walk the line graph into a single
 *  ordered boundary cycle of representative point ids. */
function deriveLoop(
  points: PointDef[],
  lines: LineDef[],
  cons: ConstraintDef[],
): string[] {
  const parent = new Map(points.map((p) => [p.id, p.id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  for (const c of cons) if (c.kind === "coincident") union(c.p1, c.p2);

  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push(b);
  };
  for (const l of lines) {
    const a = find(l.p1);
    const b = find(l.p2);
    link(a, b);
    link(b, a);
  }

  const groups = [...adj.keys()];
  if (groups.length === 0) return [];
  const loop: string[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = groups[0];
  let prev = "";
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    loop.push(cur);
    const nexts: string[] = (adj.get(cur) ?? []).filter((n) => n !== prev);
    prev = cur;
    cur = nexts[0];
  }
  return loop;
}

export function createBuilder(): Builder {
  const nodes: Record<string, Node> = {};
  const order: string[] = [];
  const alive = new Set<string>();
  let renderDecl: RenderDecl | undefined;
  let counter = 0;

  const nextId = (op: string) => `${op}_${counter++}`;

  const add = (node: Node, consumes: string[]): Handle => {
    nodes[node.id] = node;
    order.push(node.id);
    for (const c of consumes) alive.delete(c);
    // rects and sketches are regions, not bodies; only bodies are "alive".
    if (node.op !== "rect" && node.op !== "sketch") alive.add(node.id);
    return { __id: node.id };
  };

  // --- sketch building state (M1). Entities accumulate until sketch() captures
  // them; supports one sketch built at a time (sequential). ---
  const spoints: PointDef[] = [];
  const slines: LineDef[] = [];
  const sconstraints: ConstraintDef[] = [];
  let pcount = 0;
  const nextPoint = (x: number, y: number): Point => {
    const id = `p${pcount++}`;
    spoints.push({ id, x, y, fixed: false });
    return { __id: id };
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
    render(primary, stages = {}) {
      renderDecl = {
        primary: primary.__id,
        stages: Object.entries(stages).map(([name, h]) => ({ name, id: h.__id })),
      };
    },
    point(x = 0, y = 0) {
      return nextPoint(x, y);
    },
    lines(n) {
      // Seed the n lines as consecutive edges of a regular n-gon, so the typical
      // closed-loop wiring (each line's end coincident with the next line's
      // start) starts well-conditioned for the solver.
      const R = 10;
      const vert = (k: number): [number, number] => {
        const a = (2 * Math.PI * k) / n + Math.PI / 4;
        return [Math.cos(a) * R, Math.sin(a) * R];
      };
      const out: Line[] = [];
      for (let i = 0; i < n; i++) {
        const [sx, sy] = vert(i);
        const [ex, ey] = vert((i + 1) % n);
        const start = nextPoint(sx, sy);
        const end = nextPoint(ex, ey);
        const id = `l${slines.length}`;
        slines.push({ id, p1: start.__id, p2: end.__id });
        out.push({ __id: id, start, end });
      }
      return out;
    },
    coincident(...pairs) {
      for (const [a, b] of pairs)
        sconstraints.push({ kind: "coincident", p1: a.__id, p2: b.__id });
    },
    parallel(...groups) {
      for (const g of groups)
        for (let i = 1; i < g.length; i++)
          sconstraints.push({ kind: "parallel", l1: g[0].__id, l2: g[i].__id });
    },
    perpendicular(a, b) {
      sconstraints.push({ kind: "perpendicular", l1: a.__id, l2: b.__id });
    },
    equal(lines) {
      for (let i = 1; i < lines.length; i++)
        sconstraints.push({ kind: "equalLength", l1: lines[0].__id, l2: lines[i].__id });
    },
    horizontal(line) {
      sconstraints.push({ kind: "horizontal", line: line.__id });
    },
    vertical(line) {
      sconstraints.push({ kind: "vertical", line: line.__id });
    },
    distance(a, b, value) {
      sconstraints.push({ kind: "distance", p1: a.__id, p2: b.__id, value });
    },
    sketch(entities) {
      // Pin the first point to remove the sketch's free translation.
      if (spoints[0]) spoints[0].fixed = true;
      const points = spoints.splice(0);
      const lines = slines.splice(0);
      const constraints = sconstraints.splice(0);
      const node: Node = {
        id: nextId("sketch"),
        op: "sketch",
        points,
        lines,
        constraints,
        loop: deriveLoop(points, lines, constraints),
        sources: [],
      };
      const handle = add(node, []);
      // The result IS a handle (so it can be a render target) and also exposes
      // `.region` (for extrude) plus the named entities.
      return { ...entities, __id: handle.__id, region: handle };
    },
    getModel() {
      // Fall back to the last alive body when the model didn't call render().
      const aliveList = [...alive];
      const render =
        renderDecl ??
        (aliveList.length
          ? { primary: aliveList[aliveList.length - 1], stages: [] }
          : undefined);
      return { nodes: { ...nodes }, order: [...order], alive: aliveList, render };
    },
  };
}
