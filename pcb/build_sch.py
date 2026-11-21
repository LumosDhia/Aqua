"""Generate the AquaFarm schematic using the installed KiCad symbol libraries."""

from functools import cache
import json
from pathlib import Path
import re
import subprocess
import sys
from uuid import uuid5

sys.dont_write_bytecode = True
from design import (COMPONENTS, DIRECTORY, NO_CONNECT, PIN_NETS, PROJECT,
                    SCHEMATIC_BLOCKS, SHEET_UUID, component_uuid, library_id)


LIBRARIES = Path("/usr/share/kicad/symbols")
TOKEN = re.compile(r'"(?:\\.|[^"\\])*"|[()]|[^\s()"]+')
SYMBOL_START = re.compile(r'^\t\(symbol ("(?:\\.|[^"\\])*")(?=\s|\))', re.M)
GRID = 1.27
STUB = 2.54
# Indexed by KiCad pin angle, from a pin's connection point toward its body.
PIN_INWARD = {0: (1, 0), 90: (0, -1), 180: (-1, 0), 270: (0, 1)}


def quote(value):
    return json.dumps(value, ensure_ascii=False)


def children(node, keyword):
    return [item for item in node if isinstance(item, list) and item[0] == keyword]


def field(node, keyword):
    return next(iter(children(node, keyword)), None)


def parse_block(source, offset):
    stack = []
    for match in TOKEN.finditer(source, offset):
        token = match[0]
        if token == "(":
            stack.append([])
        elif token == ")":
            node = stack.pop()
            if not stack:
                return node
            stack[-1].append(node)
        else:
            stack[-1].append(token)
    raise ValueError("unterminated library S-expression")


@cache
def read_library(library):
    path = LIBRARIES / f"{library}.kicad_sym"
    source = path.read_text(encoding="utf-8")
    offsets = {json.loads(match[1]): match.start() for match in SYMBOL_START.finditer(source)}
    return path, source, offsets


@cache
def symbol_definition(library, name):
    path, source, offsets = read_library(library)
    lookup = subprocess.run(["grep", "-qF", f'\t(symbol {quote(name)}', str(path)], check=False)
    if lookup.returncode or name not in offsets:
        raise ValueError(f"symbol {library}:{name} not found in {path}")
    base = parse_block(source, offsets[name])
    ancestor = field(base, "extends")
    if ancestor is None:
        return base

    # KiCad library aliases such as BC337 and 1N4007 inherit their drawings and
    # pin locations. Inline the real ancestor units with the alias's properties.
    parent_name = json.loads(ancestor[1])
    parent = symbol_definition(library, parent_name)
    overrides = {item[1]: item for item in children(base, "property")}
    result = ["symbol", quote(name)]
    for item in parent[2:]:
        if item[0] == "property":
            result.append(overrides.pop(item[1], item))
        elif item[0] == "symbol":
            unit_name = json.loads(item[1]).removeprefix(parent_name)
            result.append(["symbol", quote(name + unit_name), *item[2:]])
        else:
            result.append(item)
    result.extend(overrides.values())
    return result


def inline_symbol(symbol_id):
    definition = symbol_definition(*symbol_id.split(":", 1))
    return ["symbol", quote(symbol_id), *definition[2:]]


def sexpr(node):
    return "(" + " ".join(sexpr(item) if isinstance(item, list) else item for item in node) + ")"


def symbol_pins(definition):
    pins = {}
    for unit in children(definition, "symbol"):
        for pin in children(unit, "pin"):
            number = json.loads(field(pin, "number")[1])
            x, y, angle = field(pin, "at")[1:]
            if number in pins:
                raise ValueError(f"duplicate pin {number} in {definition[1]}")
            pins[number] = (float(x), float(y), int(angle))
    return pins


def uid(key):
    return f'(uuid "{uuid5(SHEET_UUID, key)}")'


def xy(x, y):
    return f"{x:.4f} {y:.4f}"


def property_line(name, value, x, y, extra=""):
    return (f'(property {quote(name)} {quote(value)} (at {xy(x, y)} 0)'
            f' (effects (font (size 1.27 1.27)) {extra}))')


def instance(ref, component, pins):
    x_grid, y_grid, orientation = component.schematic
    x, y = x_grid * GRID, y_grid * GRID
    output = [f'(symbol (lib_id {quote(component.symbol)}) (at {xy(x, y)} {orientation}) (unit 1)',
              '(exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)',
              f'(uuid "{component_uuid(ref)}")']
    text_offset = {"J": 4, "Q": 7, "K": 12, "BZ": 6}.get(ref.rstrip("0123456789"), 0)
    align = "(justify left)" if text_offset else ""
    if ref.startswith("H"):
        ref_y, value_y = y - 5.08, y - 3.175
    else:
        ref_y, value_y = y - 3.25, y + 3.25
    output.extend((property_line("Reference", ref, x + text_offset, ref_y, align),
                   property_line("Value", component.value, x + text_offset, value_y, align),
                   property_line("Footprint", ":".join(library_id(component)), x, y, "(hide yes)")))
    for number in pins:
        output.append(f'(pin {quote(number)} {uid(f"{ref}.{number}:pin")})')
    output.extend((f'(instances (project {quote(PROJECT)}',
                   f'  (path "/{SHEET_UUID}" (reference {quote(ref)}) (unit 1))))', ')'))
    return "\n    ".join(output)


def pin_connections(ref, location, pins):
    x_grid, y_grid, rotation = location
    x, y = x_grid * GRID, y_grid * GRID
    for number, (px, py, angle) in pins.items():
        pin = f"{ref}.{number}"
        # Library coordinates are Y-up. Rotate there first, then project onto
        # the sheet's Y-down coordinate system.
        sx, sy = {0: (px, -py), 90: (-py, -px), 180: (-px, py), 270: (py, px)}[rotation]
        start = (x + sx, y + sy)
        if pin in NO_CONNECT:
            yield f'(no_connect (at {xy(*start)}) {uid(f"{pin}:nc")})'
            continue
        pin_angle = (angle + rotation) % 360
        dx, dy = PIN_INWARD[pin_angle]
        end = (start[0] - STUB * dx, start[1] - STUB * dy)
        yield (f'(wire (pts (xy {xy(*start)}) (xy {xy(*end)}))'
               f' (stroke (width 0) (type default)) {uid(f"{pin}:wire")})')
        # KiCad global label orientations are opposite the pin's inward direction.
        align = "left" if pin_angle in (180, 270) else "right"
        yield (f'(global_label {quote(PIN_NETS[pin])} (shape passive) (at {xy(*end)} {(pin_angle + 180) % 360})'
               f' (effects (font (size 1.05 1.05)) (justify {align})) {uid(f"{pin}:label")})')


def make_schematic():
    library = {name: inline_symbol(name) for name in dict.fromkeys(c.symbol for c in COMPONENTS.values())}
    pins = {name: symbol_pins(definition) for name, definition in library.items()}
    actual = {f"{ref}.{number}" for ref, component in COMPONENTS.items() for number in pins[component.symbol]}
    expected = set(PIN_NETS) | set(NO_CONNECT)
    if actual != expected:
        raise ValueError(f"symbol pin mismatch, missing {sorted(expected - actual)}, unexpected {sorted(actual - expected)}")

    parts = ['(kicad_sch (version 20250114) (generator "aquafarm") (generator_version "9.0")',
             f'  (uuid "{SHEET_UUID}") (paper "A3")',
             '  (title_block (title "AquaFarm irrigation controller") (rev "1.0"))',
             '  (lib_symbols']
    for definition in library.values():
        parts.append(f'    (symbol {definition[1]}\n      ' + '\n      '.join(map(sexpr, definition[2:])) + ')')
    parts.append('  )')
    for x, y, heading in SCHEMATIC_BLOCKS:
        parts.append(f'  (text {quote(heading)} (at {xy(x * GRID, y * GRID)} 0)'
                     f' (effects (font (size 1.65 1.65) (bold yes)) (justify left)) {uid(heading)})')
    for ref, component in COMPONENTS.items():
        package_pins = pins[component.symbol]
        parts.append("  " + instance(ref, component, package_pins))
        parts.extend("  " + item for item in pin_connections(ref, component.schematic, package_pins))
    parts.extend(('  (sheet_instances (path "/" (page "1")))', '  (embedded_fonts no)', ')', ''))
    return "\n".join(parts)


def main():
    output = DIRECTORY / f"{PROJECT}.kicad_sch"
    output.write_text(make_schematic(), encoding="utf-8")
    # Project-local sym-lib-table so kicad-cli resolves symbol libraries headless.
    libs = sorted({c.symbol.split(":")[0] for c in COMPONENTS.values()})
    rows = "".join(f'  (lib (name "{n}")(type "KiCad")(uri "${{KICAD9_SYMBOL_DIR}}/{n}.kicad_sym")'
                   f'(options "")(descr ""))\n' for n in libs)
    (DIRECTORY / "sym-lib-table").write_text(f"(sym_lib_table\n  (version 7)\n{rows})\n", encoding="utf-8")
    print(f"Wrote {output.name} with {len(COMPONENTS)} symbols and {len(PIN_NETS)} net labels")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
