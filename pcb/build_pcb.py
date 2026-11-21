"""Place, route and save the AquaFarm carrier with KiCad 9's pcbnew API."""

from dataclasses import dataclass
from heapq import heappop, heappush
from itertools import pairwise
from math import ceil, floor, hypot, sqrt
from pathlib import Path
from shutil import copyfile
import sys
from tempfile import TemporaryDirectory

import pcbnew

sys.dont_write_bytecode = True
import design as d


LIBRARIES = Path("/usr/share/kicad/footprints")
POWER_GROUND = "power return"
LOGIC_GROUND = "logic return"
EDGE_CLEARANCE = 0.5
COPPER_PAREAS = ("SOIL_AOUT", "RAIN_A", "US_ECHO_", "LCD_")
STEPS = ((1, 0, 10), (0, 1, 10), (-1, 0, 10), (0, -1, 10),
         (1, 1, 14), (-1, 1, 14), (-1, -1, 14), (1, -1, 14))


@dataclass(frozen=True)
class Pad:
    pin: str
    point: tuple
    half_size: tuple
    circular: bool
    owners: tuple


@dataclass(frozen=True)
class Route:
    net: str
    group: str
    width: float
    pins: tuple
    points: tuple


def vector(x, y):
    return pcbnew.VECTOR2I(pcbnew.FromMM(x), pcbnew.FromMM(y))


def location(point):
    return vector(point[0] + d.OFFSET[0], point[1] + d.OFFSET[1])


def local_point(point):
    return (round(pcbnew.ToMM(point.x) - d.OFFSET[0], 6),
            round(pcbnew.ToMM(point.y) - d.OFFSET[1], 6))


def inside_board(x, y, margin):
    width, height = d.SIZE
    if not (margin <= x <= width - margin and margin <= y <= height - margin):
        return False
    radius = d.CORNER_RADIUS
    dx = max(radius - x, x - (width - radius), 0)
    dy = max(radius - y, y - (height - radius), 0)
    return dx * dx + dy * dy <= (radius - margin) ** 2


def add_outline(board):
    width, height = d.SIZE
    radius = d.CORNER_RADIUS
    # Four true quarter arcs meet the straight sections at identical endpoints.
    inset = radius * (1 - 1 / sqrt(2))
    corners = ((radius, 0), (width - radius, 0), (width, radius), (width, height - radius),
               (width - radius, height), (radius, height), (0, height - radius), (0, radius))
    midpoints = ((width - inset, inset), (width - inset, height - inset),
                 (inset, height - inset), (inset, inset))
    for index, start in enumerate(corners):
        end = corners[(index + 1) % len(corners)]
        if index % 2:
            edge = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_ARC)
            edge.SetArcGeometry(location(start), location(midpoints[index // 2]), location(end))
        else:
            edge = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_SEGMENT)
            edge.SetStart(location(start))
            edge.SetEnd(location(end))
        edge.SetLayer(pcbnew.Edge_Cuts)
        edge.SetWidth(pcbnew.FromMM(0.05))
        board.Add(edge)


def bounds(item):
    box = item.GetBoundingBox()
    left, top = local_point(box.GetOrigin())
    return left, top, left + pcbnew.ToMM(box.GetWidth()), top + pcbnew.ToMM(box.GetHeight())


def pad_owners(pin):
    net = d.PIN_NETS.get(pin)
    if pin == d.STAR_GROUND:
        return POWER_GROUND, LOGIC_GROUND
    if net == "GND":
        return (POWER_GROUND,) if pin in d.POWER_RETURNS else (LOGIC_GROUND,)
    return (net,)


def load_footprints(board, nets):
    index = set((d.DIRECTORY / "FOOTPRINT-INDEX.txt").read_text(encoding="utf-8").splitlines())
    footprints, pads = {}, {}
    for ref, component in d.COMPONENTS.items():
        if component.footprint not in index:
            raise ValueError(f"{ref} footprint {component.footprint} missing from footprint index")
        library, name = d.library_id(component)
        directory = LIBRARIES / f"{library}.pretty"
        footprint = pcbnew.FootprintLoad(str(directory), name)
        if footprint is None:
            raise ValueError(f"{ref} footprint {directory / (name + '.kicad_mod')} could not be loaded")
        footprint.SetFPID(pcbnew.LIB_ID(library, name))
        footprint.SetReference(ref)
        footprint.SetValue(component.value)
        footprint.SetPath(pcbnew.KIID_PATH(f"/{d.SHEET_UUID}/{d.component_uuid(ref)}"))
        board.Add(footprint)
        x, y, angle = component.placement
        footprint.SetPosition(location((x, y)))
        footprint.SetOrientationDegrees(angle)
        footprints[ref] = footprint

        assigned = {pin.split(".")[1] for pin in (*d.PIN_NETS, *d.NO_CONNECT) if pin.startswith(ref + ".")}
        for number in sorted(assigned, key=int):
            pin = f"{ref}.{number}"
            pad = footprint.FindPadByNumber(number)
            if pad is None:
                raise ValueError(f"{ref} footprint {name} is missing pad {number}")
            if pin in d.PIN_NETS:
                pad.SetNet(nets[d.PIN_NETS[pin]])
        for pad in footprint.Pads():
            number = pad.GetNumber()
            if number not in assigned and not (component.footprint == d.HOLE and not number):
                raise ValueError(f"{ref} footprint {name} has unexpected pad {number!r}")
            pin = f"{ref}.{number}"
            if pin in pads:
                raise ValueError(f"duplicate footprint pad {pin}")
            left, top, right, bottom = bounds(pad)
            size = ((right - left) / 2, (bottom - top) / 2)
            pads[pin] = Pad(pin, local_point(pad.GetPosition()), size,
                            pad.GetShape() == pcbnew.PAD_SHAPE_CIRCLE, pad_owners(pin))
    return footprints, pads


def route_domain(x, y, radius, group):
    if not inside_board(x, y, EDGE_CLEARANCE + radius):
        return False
    left, top, right, bottom = d.ANTENNA
    if left - radius <= x <= right + radius and top - radius <= y <= bottom + radius:
        return False
    if group == POWER_GROUND:
        return x >= d.POWER_GROUND_EDGE and y <= 55.0
    if group == LOGIC_GROUND:
        # At the right edge the only link through the moat approaches J1.2
        # from below. Elsewhere logic ground stays out of the power plane.
        gate = x >= 91 and y >= 54.8 + 0.65 * abs(x - d.COMPONENTS["J1"].placement[0])
        return x <= d.LOGIC_GROUND_EDGE or y >= d.LOGIC_GROUND_TOP or gate
    if group in d.POWER_CORRIDOR_NETS:
        return x >= d.LOGIC_GROUND_EDGE
    if group.startswith(COPPER_PAREAS):
        return x <= d.LOGIC_GROUND_EDGE
    return True


def point_segment_distance(x, y, start, end):
    ax, ay = start
    bx, by = end
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return hypot(x - ax, y - ay)
    t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / length_sq))
    return hypot(x - (ax + t * dx), y - (ay + t * dy))


def escape(point, node):
    """Connect an off-grid pad centre with an exact 45-degree/orthogonal stub."""
    dx, dy = node[0] - point[0], node[1] - point[1]
    diagonal = min(abs(dx), abs(dy))
    bend = (round(point[0] + (diagonal if dx > 0 else -diagonal), 6),
            round(point[1] + (diagonal if dy > 0 else -diagonal), 6), node[2])
    return tuple(dict.fromkeys(((*point, node[2]), bend, node)))


def compact(points):
    output = []
    for point in points:
        if output and output[-1] == point:
            continue
        if len(output) >= 2 and output[-2][2] == output[-1][2] == point[2]:
            a, b = output[-2], output[-1]
            dx, dy = b[0] - a[0], b[1] - a[1]
            ex, ey = point[0] - b[0], point[1] - b[1]
            if abs(dx * ey - dy * ex) < 1e-8 and dx * ex + dy * ey > 0:
                output[-1] = point
                continue
        output.append(point)
    return tuple(output)


class RoutingGrid:
    """Octilinear A* over both copper layers, with clearance-expanded obstacles."""

    def __init__(self, grid, group, width, pads, routes, bottom_only=False):
        self.grid = grid
        self.nx, self.ny = (round(size / grid) + 1 for size in d.SIZE)
        self.plane = self.nx * self.ny
        self.bottom_only = bottom_only
        self.layers = (1,) if bottom_only else (0, 1)
        self.blocked = [bytearray(self.plane), bytearray(self.plane)]
        self.via_blocked = bytearray(self.plane)
        # Half a grid diagonal protects the entire segment between two nodes.
        self.trace_margin = width / 2 + d.CLEARANCE + grid / sqrt(2) + 0.015
        self.via_margin = d.VIA_DIAMETER / 2 + d.CLEARANCE + 0.03
        for y in range(self.ny):
            for x in range(self.nx):
                index = y * self.nx + x
                mx, my = x * grid, y * grid
                if not route_domain(mx, my, width / 2, group):
                    self.blocked[0][index] = self.blocked[1][index] = 1
                if not route_domain(mx, my, d.VIA_DIAMETER / 2, group):
                    self.via_blocked[index] = 1
        for pad in pads.values():
            if group not in pad.owners:
                self.mark_pad(pad, self.trace_margin, self.blocked)
            self.mark_pad(pad, self.via_margin, (self.via_blocked,))
        for route in routes:
            if group == route.group:
                self.reserve_via_holes(route.points)
                continue
            for start, end in pairwise(route.points):
                if start[2] == end[2]:
                    layer = start[2]
                    # Only the J1.2 annulus is common to the two return paths.
                    star = pads[d.STAR_GROUND].point if route.net == "GND" and group == LOGIC_GROUND else None
                    self.mark_segment(start[:2], end[:2], route.width / 2 + self.trace_margin,
                                      (self.blocked[layer],), star)
                    self.mark_segment(start[:2], end[:2], route.width / 2 + self.via_margin,
                                      (self.via_blocked,))
                else:
                    self.mark_segment(start[:2], end[:2], d.VIA_DIAMETER / 2 + self.trace_margin,
                                      self.blocked)
                    self.mark_segment(start[:2], end[:2], d.VIA_DIAMETER + d.CLEARANCE + 0.03,
                                      (self.via_blocked,))

    def stamp(self, bounds, contains, masks):
        left, top, right, bottom = bounds
        for y in range(max(0, ceil(top / self.grid)), min(self.ny, floor(bottom / self.grid) + 1)):
            for x in range(max(0, ceil(left / self.grid)), min(self.nx, floor(right / self.grid) + 1)):
                if contains(x * self.grid, y * self.grid):
                    index = y * self.nx + x
                    for mask in masks:
                        mask[index] = 1

    def mark_pad(self, pad, margin, masks):
        x, y = pad.point
        hx, hy = pad.half_size
        if pad.circular:
            self.mark_segment(pad.point, pad.point, max(hx, hy) + margin, masks)
            return
        box = (x - hx - margin, y - hy - margin, x + hx + margin, y + hy + margin)
        self.stamp(box, lambda px, py: hypot(max(abs(px - x) - hx, 0), max(abs(py - y) - hy, 0)) <= margin, masks)

    def mark_segment(self, start, end, radius, masks, common_terminal=None):
        x1, y1 = start
        x2, y2 = end
        box = (min(x1, x2) - radius, min(y1, y2) - radius, max(x1, x2) + radius, max(y1, y2) + radius)
        def contains(x, y):
            if common_terminal and hypot(x - common_terminal[0], y - common_terminal[1]) <= 1.5:
                return False
            return point_segment_distance(x, y, start, end) <= radius

        self.stamp(box, contains, masks)

    def reserve_via_holes(self, points):
        for a, b in pairwise(points):
            if a[2] != b[2]:
                self.mark_segment(a[:2], b[:2], d.VIA_DRILL + 0.25, (self.via_blocked,))

    def access_nodes(self, point):
        px, py = (coordinate / self.grid for coordinate in point)
        nodes = []
        for y in sorted({floor(py + 1e-7), ceil(py - 1e-7)}):
            for x in sorted({floor(px + 1e-7), ceil(px - 1e-7)}):
                index = y * self.nx + x
                for layer in self.layers:
                    if not self.blocked[layer][index]:
                        length = round(10 * hypot(px - x, py - y))
                        nodes.append((layer * self.plane + index, length))
        return nodes

    def find(self, source, target):
        starts = self.access_nodes(source)
        goals = dict(self.access_nodes(target))
        if not starts or not goals:
            return None
        tx, ty = (coordinate / self.grid for coordinate in target)

        def heuristic(x, y):
            dx, dy = abs(x - tx), abs(y - ty)
            return max(0, round(10 * max(dx, dy) + 4 * min(dx, dy)) - 12)

        queue, costs, previous = [], {}, {}
        for start, cost in starts:
            costs[start] = cost
            y, x = divmod(start % self.plane, self.nx)
            estimate = heuristic(x, y)
            heappush(queue, (cost + estimate, estimate, cost, start))
        while queue:
            _, _, cost, state = heappop(queue)
            if costs[state] != cost:
                continue
            if state in goals:
                return self.unpack(previous, state, source, target)
            layer, index = divmod(state, self.plane)
            y, x = divmod(index, self.nx)
            candidates = []
            for dx, dy, step_cost in STEPS:
                nx, ny = x + dx, y + dy
                if 0 <= nx < self.nx and 0 <= ny < self.ny:
                    adjacent = ny * self.nx + nx
                    if not self.blocked[layer][adjacent]:
                        candidates.append((layer * self.plane + adjacent, nx, ny, step_cost))
            other = 1 - layer
            if not (self.bottom_only or self.via_blocked[index] or self.blocked[other][index]):
                candidates.append((other * self.plane + index, x, y, 90))
            for adjacent, nx, ny, step_cost in candidates:
                next_cost = cost + step_cost
                if next_cost < costs.get(adjacent, float("inf")):
                    costs[adjacent] = next_cost
                    previous[adjacent] = state
                    estimate = heuristic(nx, ny)
                    heappush(queue, (next_cost + estimate, estimate, next_cost, adjacent))
        return None

    def unpack(self, previous, state, source, target):
        points = []
        while True:
            layer, index = divmod(state, self.plane)
            y, x = divmod(index, self.nx)
            points.append((round(x * self.grid, 6), round(y * self.grid, 6), layer))
            if state not in previous:
                break
            state = previous[state]
        points.reverse()
        return compact((*escape(source, points[0]), *points[1:-1], *reversed(escape(target, points[-1]))))


def shortest_tree(pins, pads):
    """Grow a minimum-length tree of pad pairs before detouring around copper."""
    tree, remaining = [pins[0]], list(pins[1:])
    pairs = []
    while remaining:
        _, source, target = min((hypot(pads[a].point[0] - pads[b].point[0],
                                       pads[a].point[1] - pads[b].point[1]), a, b)
                                for a in tree for b in remaining)
        pairs.append((source, target))
        tree.append(target)
        remaining.remove(target)
    return pairs


def routing_tasks(pads):
    # Reserve the bottom-layer power returns and the single logic connection
    # first. Subsequent logic branches cannot use the star pad as a shortcut.
    logic_root = "J7.6"
    power_pairs = [(d.STAR_GROUND, pin) for pin in ("J2.2", "Q1.3")]
    power_pairs += shortest_tree(("J2.2", *[pin for pin in d.POWER_RETURNS if pin not in ("J2.2", "Q1.3")]), pads)
    yield "GND", POWER_GROUND, d.POWER_WIDTH, power_pairs, True
    yield "GND", LOGIC_GROUND, d.POWER_WIDTH, [(d.STAR_GROUND, logic_root)], True

    first = ("+5V_IN", "PUMP_SW", "Q1_COLL", "Q1_BASE", "Q2_BASE", "+5V",
             "SOIL_AOUT", "RAIN_A", "US_ECHO_3V3", "US_ECHO_5V")
    order = (*first, *(net for net in d.NETS if net not in (*first, "GND")))
    for net in order:
        width = d.POWER_WIDTH if net in d.POWER_NETS else d.SIGNAL_WIDTH
        yield net, net, width, shortest_tree(d.NETS[net], pads), False

    logic_pins = (logic_root, *[pin for pin in d.NETS["GND"]
                              if pin not in (d.STAR_GROUND, logic_root, *d.POWER_RETURNS)])
    yield "GND", LOGIC_GROUND, d.POWER_WIDTH, shortest_tree(logic_pins, pads), False


def plan_routes(pads, grid):
    routes, problems = [], []
    for net, group, width, pairs, bottom_only in routing_tasks(pads):
        search = RoutingGrid(grid, group, width, pads, routes, bottom_only)
        for source, target in pairs:
            points = search.find(pads[source].point, pads[target].point)
            if points is None:
                problems.append((net, source, target, "no clearance-safe path"))
            else:
                routes.append(Route(net, group, width, (source, target), points))
                search.reserve_via_holes(points)
    return routes, problems


def stitch_ground(pads, routes, grid):
    """Add local ground vias with a short track to a plated ground terminal."""
    pins = ("J2.2", "Q1.3", "J10.2", "J3.2", "J7.6", "J8.6")
    for pin in pins:
        pad = pads[pin]
        group = pad.owners[0]
        search = RoutingGrid(grid, group, d.SIGNAL_WIDTH, pads, routes, bottom_only=True)
        x, y = pad.point
        cx, cy = round(x / grid), round(y / grid)
        radius = ceil(4 / grid)
        candidates = []
        for iy in range(max(0, cy - radius), min(search.ny, cy + radius + 1)):
            for ix in range(max(0, cx - radius), min(search.nx, cx + radius + 1)):
                start = (round(ix * grid, 6), round(iy * grid, 6))
                distance = hypot(start[0] - x, start[1] - y)
                index = iy * search.nx + ix
                if 1.6 <= distance <= 4 and not search.via_blocked[index] and not search.blocked[1][index]:
                    if start[0] >= d.LOGIC_GROUND_EDGE and d.POWER_GROUND_BOTTOM - 0.8 < start[1] < d.LOGIC_GROUND_TOP + 0.8:
                        continue
                    candidates.append((distance, start))
        for _, point in sorted(candidates):
            path = search.find(pad.point, point)
            if path and sum(hypot(b[0] - a[0], b[1] - a[1]) for a, b in pairwise(path)) <= 5:
                routes.append(Route("GND", group, d.SIGNAL_WIDTH, (pin, "stitch via"), (*path, (*point, 0))))
                break


def push_routes(board, routes, nets, problems):
    layers = (pcbnew.F_Cu, pcbnew.B_Cu)
    segments, vias = set(), set()
    for route in routes:
        pending, new_segments, new_vias, added = [], set(), set(), []
        try:
            for a, b in pairwise(route.points):
                if a[2] != b[2]:
                    key = (route.net, a[:2])
                    if key in vias or key in new_vias:
                        continue
                    item = pcbnew.PCB_VIA(board)
                    item.SetPosition(location(a))
                    item.SetViaType(pcbnew.VIATYPE_THROUGH)
                    item.SetLayerPair(*layers)
                    for copper in layers:
                        item.SetWidth(copper, pcbnew.FromMM(d.VIA_DIAMETER))
                    item.SetDrill(pcbnew.FromMM(d.VIA_DRILL))
                    new_vias.add(key)
                else:
                    key = (route.net, tuple(sorted((a, b))), route.width)
                    if key in segments or key in new_segments:
                        continue
                    item = pcbnew.PCB_TRACK(board)
                    item.SetStart(location(a))
                    item.SetEnd(location(b))
                    item.SetLayer(layers[a[2]])
                    item.SetWidth(pcbnew.FromMM(route.width))
                    new_segments.add(key)
                item.SetNet(nets[route.net])
                pending.append(item)
            for item in pending:
                if board.Add(item) is False:
                    raise RuntimeError("board rejected copper item")
                added.append(item)
        except (RuntimeError, TypeError, ValueError) as error:
            for item in reversed(added):
                board.Remove(item)
            problems.append((route.net, *route.pins, str(error)))
        else:
            segments.update(new_segments)
            vias.update(new_vias)
    return len(segments), len(vias)


def rectangle(left, top, right, bottom):
    return ((left, top), (right, top), (right, bottom), (left, bottom))


def zone_outline(board, name, points):
    zone = pcbnew.ZONE(board)
    zone.SetZoneName(name)
    zone.SetLayerSet(pcbnew.LSET.AllCuMask(2))
    outline = zone.Outline()
    outline.NewOutline()
    for point in points:
        pos = location(point)
        outline.Append(pos.x, pos.y)
    return zone


def add_zones(board, ground):
    keepout = zone_outline(board, "ESP32 antenna", rectangle(*d.ANTENNA))
    keepout.SetIsRuleArea(True)
    keepout.SetDoNotAllowTracks(True)
    keepout.SetDoNotAllowVias(True)
    keepout.SetDoNotAllowPads(True)
    keepout.SetDoNotAllowCopperPour(True)
    board.Add(keepout)

    lx, px = d.LOGIC_GROUND_EDGE, d.POWER_GROUND_EDGE
    py, ly = d.POWER_GROUND_BOTTOM, d.LOGIC_GROUND_TOP
    width, height = d.SIZE
    # The rule area opens the pours on both layers around the power-return
    # island. Its flat right-hand section includes the J1.2 star junction.
    moat = zone_outline(board, "Ground return isolation", ((lx, 0), (px, 0), (px, py),
                         (width, py), (width, ly), (lx, ly)))
    moat.SetIsRuleArea(True)
    moat.SetDoNotAllowCopperPour(True)
    moat.SetDoNotAllowTracks(False)
    moat.SetDoNotAllowVias(False)
    moat.SetDoNotAllowPads(False)
    moat.SetDoNotAllowFootprints(False)
    board.Add(moat)

    plane = zone_outline(board, "Ground planes", rectangle(0, 0, width, height))
    plane.SetNet(ground)
    plane.SetLocalClearance(pcbnew.FromMM(0.3))
    plane.SetMinThickness(pcbnew.FromMM(0.5))
    plane.SetPadConnection(pcbnew.ZONE_CONNECTION_THT_THERMAL)
    plane.SetThermalReliefGap(pcbnew.FromMM(0.3))
    plane.SetThermalReliefSpokeWidth(pcbnew.FromMM(0.5))
    board.Add(plane)


def write_fp_lib_table(libraries):
    """Project-local fp-lib-table so kicad-cli resolves footprint libraries headless."""
    rows = "".join(f'  (lib (name "{name}")(type "KiCad")(uri "${{KICAD9_FOOTPRINT_DIR}}/{name}.pretty")'
                   f'(options "")(descr ""))\n' for name in sorted(libraries))
    (d.DIRECTORY / "fp-lib-table").write_text(f"(fp_lib_table\n  (version 7)\n{rows})\n", encoding="utf-8")


def save_filled_board(board, output):
    # Loading the staged board initializes KiCad 9's DRC engine, which the
    # zone filler needs and CreateEmptyBoard does not initialize.
    with TemporaryDirectory(prefix="aquafarm-kicad-") as directory:
        staged = Path(directory) / output.name
        project = output.with_suffix(".kicad_pro")
        copyfile(project, staged.with_suffix(".kicad_pro"))
        copyfile(d.DIRECTORY / "fp-lib-table", Path(directory) / "fp-lib-table")
        if not pcbnew.SaveBoard(str(staged), board, True):
            raise ValueError("could not stage PCB for zone fill")
        loaded = pcbnew.LoadBoard(str(staged))
        if loaded is None:
            raise ValueError("could not reload staged PCB for zone fill")
        if pcbnew.ZONE_FILLER(loaded).Fill(loaded.Zones()) is False:
            raise ValueError("ground zone fill failed")
        loaded.SetFileName(str(output))
        # Skip writing settings so the source project JSON stays intact.
        if not pcbnew.SaveBoard(str(output), loaded, True):
            raise ValueError(f"could not save {output}")


def boxes_overlap(a, b, gap=0.0):
    return (a[0] < b[2] + gap and b[0] < a[2] + gap
            and a[1] < b[3] + gap and b[1] < a[3] + gap)


def silk_candidates(anchor, radius, axis=None):
    steps = round(radius / 0.5)
    horizontal = range(-steps, steps + 1) if axis != "y" else (0,)
    vertical = range(-steps, steps + 1) if axis != "x" else (0,)
    offsets = sorted((dx * dx + dy * dy, dx, dy) for dx in horizontal for dy in vertical)
    return [(anchor[0] + dx * 0.5, anchor[1] + dy * 0.5) for _, dx, dy in offsets]


def place_silk(text, anchor, angle, blockers, radius=4, axis=None, pad_boxes=()):
    """Place a label; never raises. Order of preference:
    1. clear of every blocker and inside the board,
    2. inside the board and off pads (may touch other silk),
    3. anchored on the target (clamped inside the board),
    4. None -> caller drops the label with a warning."""
    text.SetLayer(pcbnew.F_SilkS)
    text.SetTextSize(vector(0.8, 0.8))
    text.SetTextThickness(pcbnew.FromMM(0.12))
    text.SetTextAngle(pcbnew.EDA_ANGLE(angle, pcbnew.DEGREES_T))
    pad_boxes = pad_boxes or ()
    fallback_pads = None
    candidates = silk_candidates(anchor, radius, axis)
    if axis is not None:
        candidates += silk_candidates(anchor, radius + 4)
    for position in candidates:
        text.SetPosition(location(position))
        box = bounds(text)
        if not all(inside_board(x, y, 0.35) for x in (box[0], box[2]) for y in (box[1], box[3])):
            continue
        if not any(boxes_overlap(box, obstacle, 0.16) for obstacle in blockers):
            blockers.append(box)
            return position
        if fallback_pads is None and not any(boxes_overlap(box, p, 0.05) for p in pad_boxes):
            fallback_pads = position
    if fallback_pads is not None:
        text.SetPosition(location(fallback_pads))
        blockers.append(bounds(text))
        return fallback_pads
    # Last resort: the anchor itself, pulled toward the board centre until inside.
    for step in range(0, 21):
        t = step * 0.05
        position = (anchor[0] + (d.SIZE[0] / 2 - anchor[0]) * t * 0.2,
                    anchor[1] + (d.SIZE[1] / 2 - anchor[1]) * t * 0.2)
        text.SetPosition(location(position))
        box = bounds(text)
        if all(inside_board(x, y, 0.35) for x in (box[0], box[2]) for y in (box[1], box[3])):
            blockers.append(box)
            print(f"WARNING: silkscreen {text.GetText()!r} anchored on target {anchor}; may overlap")
            return position
    print(f"WARNING: dropped silkscreen {text.GetText()!r} near {anchor}: no room inside board")
    return None


def add_silkscreen(board, footprints, pads):
    pad_boxes = [(x - hx, y - hy, x + hx, y + hy) for pad in pads.values()
                 for (x, y), (hx, hy) in ((pad.point, pad.half_size),)]
    blockers = list(pad_boxes)
    blockers.extend(bounds(item) for footprint in footprints.values() for item in footprint.GraphicalItems()
                    if item.GetLayer() == pcbnew.F_SilkS)

    def label(value, anchor, angle=0, radius=4, axis=None):
        text = pcbnew.PCB_TEXT(board)
        text.SetText(value)
        position = place_silk(text, anchor, angle, blockers, radius, axis, pad_boxes)
        if position is not None:
            board.Add(text)
        return position

    for ref, labels in d.CONNECTOR_LABELS.items():
        for number, value in enumerate(labels, 1):
            x, y = pads[f"{ref}.{number}"].point
            if ref in ("J9", "J10"):
                dx = 6.2 if ref == "J9" else -6.2
                label(value, (x + dx, y), radius=2, axis="x")
            elif ref == "J1":
                anchor = (x - 4.5, y + 1.9) if number == 1 else (x - 0.5, y - 4.1)
                label(value, anchor, radius=3)
            elif ref == "J2":
                label(value, (x - 7.3, y), radius=8, axis="x")
            elif ref in ("J7", "J8"):
                label(value, (x, y - 4.8), 90, radius=3, axis="y")
            else:
                label(value, (x, y + 6), 90, radius=3, axis="y")
        x, y = pads[f"{ref}.1"].point
        if ref == "J1":
            anchor = (x - 7.3, y + 1.9)
        elif ref == "J2":
            anchor = (x + 3.3, y)
        elif ref in ("J9", "J10"):
            anchor = (x, y - 2.8)
        elif ref in ("J7", "J8"):
            anchor = (x, y + 2.5)
        else:
            anchor = (x - 3.6, y)
        label("1", anchor, radius=3)

    label("K1: 1=COM 3=NO 4=NC", (82, 14.5), radius=2)
    label("2=COIL+ 5=COIL-", (79, 17), radius=2)
    label("NC - LEAVE EMPTY", (89.2, 17.5), radius=4)
    label("VERIFY AGAINST RELAY DATASHEET", (82, 12.5), radius=4)
    label("+5V", (20.5, 39), radius=3)

    reference_anchors = {"J1": (94.5, 49.2), "J2": (87, 42), "K1": (69, 26),
                         "BZ1": (88.8, 77.9), "F1": (72.5, 65.8)}
    for ref, footprint in footprints.items():
        component = d.COMPONENTS[ref]
        reference = footprint.Reference()
        reference.SetVisible(True)
        ref_pos = reference_anchors.get(ref, local_point(reference.GetPosition()))
        placed = place_silk(reference, ref_pos, 0, blockers, radius=8, pad_boxes=pad_boxes)
        if placed is None:
            reference.SetVisible(False)
            placed = ref_pos
        label(component.silk or component.value, (placed[0], placed[1] - 1.5), radius=7)


def configure_board(board):
    board.SetCopperLayerCount(2)
    settings = board.GetDesignSettings()
    settings.SetBoardThickness(pcbnew.FromMM(d.THICKNESS))
    settings.m_MinClearance = pcbnew.FromMM(d.CLEARANCE)
    settings.m_TrackMinWidth = pcbnew.FromMM(d.MIN_TRACK_WIDTH)
    settings.m_CopperEdgeClearance = pcbnew.FromMM(EDGE_CLEARANCE)
    settings.SetCustomTrackWidth(pcbnew.FromMM(d.SIGNAL_WIDTH))
    origin = location((0, d.SIZE[1]))
    settings.SetAuxOrigin(origin)
    settings.SetGridOrigin(origin)


def main():
    output = d.DIRECTORY / f"{d.PROJECT}.kicad_pcb"
    board = pcbnew.CreateEmptyBoard()
    if board is None:
        raise ValueError("KiCad could not create an empty board")
    board.SetFileName(str(output))
    configure_board(board)
    add_outline(board)
    nets = {}
    for name in d.NETS:
        net = pcbnew.NETINFO_ITEM(board, name)
        board.Add(net)
        nets[name] = net
    footprints, pads = load_footprints(board, nets)
    write_fp_lib_table({d.library_id(c)[0] for c in d.COMPONENTS.values()})
    # J4.2's pad is hemmed in by its own stitch track; a thermal relief there
    # keeps only one spoke (DRC starved_thermal), so connect it solidly.
    footprints["J4"].FindPadByNumber("2").SetLocalZoneConnection(pcbnew.ZONE_CONNECTION_FULL)
    add_silkscreen(board, footprints, pads)

    grid = 0.4
    routes, problems = plan_routes(pads, grid)
    if problems:
        finer_routes, finer_problems = plan_routes(pads, 0.25)
        if len(finer_problems) < len(problems):
            grid, routes, problems = 0.25, finer_routes, finer_problems
    stitch_ground(pads, routes, grid)
    track_count, via_count = push_routes(board, routes, nets, problems)
    add_zones(board, nets["GND"])
    save_filled_board(board, output)
    d.write_bom(d.DIRECTORY / "BOM.csv")
    failed_nets = {name for name, _, target, _ in problems if target != "stitch via"}
    print(f"Board {d.SIZE[0]} mm x {d.SIZE[1]} mm, {len(footprints)} footprints, {len(nets)} nets, "
          f"{track_count} tracks, {via_count} vias")
    print(f"ROUTED {len(nets) - len(failed_nets)}/{len(nets)} nets")
    for net, source, target, reason in problems:
        print(f"ROUTING: {net} {source} -> {target}: {reason}")
    pending = sorted({pin for _, source, target, _ in problems if target != "stitch via" for pin in (source, target)})
    print("Unconnected pins (routing): " + (", ".join(pending) or "none"))
    print("Intentional no-connects: " + ", ".join(d.NO_CONNECT))
    print(f"Wrote {output.name} and BOM.csv")


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, KeyError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
