"""AquaFarm pin assignments and physical layout, in millimetres."""

from dataclasses import dataclass
from pathlib import Path
import csv
from uuid import UUID, uuid5


PROJECT = "AquaFarm-PCB"
SHEET_UUID = UUID("24353c46-67f7-42f1-8168-af2daa3f86e8")
DIRECTORY = Path(__file__).resolve().parent

# Layout coordinates are measured right and down from the top-left tangent box.
# The KiCad builders offset the box and set the fabrication origin at bottom left.
SIZE = (100, 80)
OFFSET = (10, 10)
CORNER_RADIUS = 3
THICKNESS = 1.6
PLACEMENT_GRID = 1.0
ANTENNA = (19.5, 0, 51.5, 3.5)
# A continuous gap in the pours keeps the two ground systems from bypassing J1.2.
POWER_GROUND_EDGE = 68
LOGIC_GROUND_EDGE = 66
POWER_GROUND_BOTTOM = 52.5
LOGIC_GROUND_TOP = 57.5
STAR_GROUND = "J1.2"
POWER_RETURNS = ("J2.2", "Q1.3", "D5.2", "C1.2", "C6.2", "R2.2")
CLEARANCE = 0.2
MIN_TRACK_WIDTH = 0.2
SIGNAL_WIDTH = 0.25
POWER_WIDTH = 0.8
POWER_NETS = {"+5V", "GND", "PUMP_SW", "+5V_IN", "+5V_FUSED"}
POWER_CORRIDOR_NETS = {"PUMP_SW", "+5V_IN", "+5V_FUSED", "Q1_BASE", "Q1_COLL"}
VIA_DIAMETER = 0.8
VIA_DRILL = 0.4

TERMINAL = "TerminalBlock.pretty/TerminalBlock_bornier-2_P5.08mm"
JST3 = "Connector_JST.pretty/JST_XH_B3B-XH-A_1x03_P2.50mm_Vertical"
JST4 = "Connector_JST.pretty/JST_XH_B4B-XH-A_1x04_P2.50mm_Vertical"
SOCKET = "Connector_PinSocket_2.54mm.pretty/PinSocket_1x15_P2.54mm_Vertical"
RESISTOR = "Resistor_THT.pretty/R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal"
TRANSISTOR = "Package_TO_SOT_THT.pretty/TO-92_Inline"
LED = "LED_THT.pretty/LED_D5.0mm"
DIODE = "Diode_THT.pretty/D_DO-41_SOD81_P10.16mm_Horizontal"
DISC = "Capacitor_THT.pretty/C_Disc_D5.0mm_W2.5mm_P5.00mm"
HOLE = "MountingHole.pretty/MountingHole_3.2mm_M3"


@dataclass(frozen=True)
class Component:
    value: str
    footprint: str
    symbol: str
    placement: tuple
    schematic: tuple
    silk: str = ""


# Placement and schematic tuples are (x, y, counterclockwise degrees). Schematic
# x/y are in 1.27 mm grid units. Silk defaults to the component value.
COMPONENTS = {
    "J1": Component("5V IN", TERMINAL, "Connector_Generic:Conn_01x02", (95, 60, 90), (34, 32, 0)),
    "J2": Component("PUMP", TERMINAL, "Connector_Generic:Conn_01x02", (95, 43, 90), (270, 31, 0)),
    "J3": Component("SOIL", JST3, "Connector_Generic:Conn_01x03", (6, 69, 0), (34, 147, 0)),
    "J4": Component("RAIN", JST3, "Connector_Generic:Conn_01x03", (17, 69, 0), (84, 147, 0)),
    "J5": Component("HC-SR04", JST4, "Connector_Generic:Conn_01x04", (28, 69, 0), (34, 176, 0)),
    "J6": Component("DHT11", JST3, "Connector_Generic:Conn_01x03", (42, 69, 0), (34, 204, 0)),
    "J7": Component("DISPLAY", "Connector_PinHeader_2.54mm.pretty/PinHeader_1x07_P2.54mm_Vertical",
                    "Connector_Generic:Conn_01x07", (50, 76, 90), (171, 155, 0)),
    "J8": Component("SPARE", "Connector_PinHeader_2.54mm.pretty/PinHeader_1x06_P2.54mm_Vertical",
                    "Connector_Generic:Conn_01x06", (36, 53, 90), (171, 187, 0)),
    "J9": Component("ESP32_L", SOCKET, "Connector:Conn_01x15_Socket", (24, 6, 0), (226, 165, 0), "ESP32 L"),
    "J10": Component("ESP32_R", SOCKET, "Connector:Conn_01x15_Socket", (46.86, 6, 0), (278, 165, 0), "ESP32 R"),
    "K1": Component("SRD-05VDC-SL-C", "Relay_THT.pretty/Relay_SPDT_SANYOU_SRD_Series_Form_C",
                    "Relay:SANYOU_SRD_Form_C", (75, 27, 0), (224, 32, 0), "5V RELAY"),
    "Q1": Component("BC337", TRANSISTOR, "Transistor_BJT:BC337", (78, 43, 0), (218, 71, 0)),
    "Q2": Component("BC337", TRANSISTOR, "Transistor_BJT:BC337", (78, 67, 0), (224, 108, 0)),
    "D1": Component("GREEN", LED, "Device:LED", (8, 59, 0), (102, 78, 0)),
    "D2": Component("BLUE", LED, "Device:LED", (19, 59, 0), (102, 95, 0)),
    "D3": Component("RED", LED, "Device:LED", (30, 59, 0), (102, 112, 0)),
    "D4": Component("1N4007", DIODE, "Diode:1N4007", (75, 37, 0), (184, 32, 0)),
    "D5": Component("1N4007", DIODE, "Diode:1N4007", (90, 48, 180), (268, 51, 0)),
    "D6": Component("1N5819", DIODE, "Diode:1N5819", (78, 10, 0), (111, 33, 0)),
    "R1": Component("1k", RESISTOR, "Device:R", (68, 40, 270), (156, 69, 90)),
    "R2": Component("10k", RESISTOR, "Device:R", (69, 55, 0), (186, 69, 90)),
    "R3": Component("1k", RESISTOR, "Device:R", (60, 24, 180), (82, 176, 90)),
    "R4": Component("2k", RESISTOR, "Device:R", (52, 29, 0), (122, 176, 90)),
    "R5": Component("10k", RESISTOR, "Device:R", (50, 62, 0), (85, 204, 90)),
    "R6": Component("1k", RESISTOR, "Device:R", (67, 67, 90), (156, 107, 90)),
    "R7": Component("10k", RESISTOR, "Device:R", (81, 73, 180), (190, 107, 90)),
    "R8": Component("330R", RESISTOR, "Device:R", (6, 52, 0), (52, 78, 90)),
    "R9": Component("330R", RESISTOR, "Device:R", (19, 52, 0), (52, 95, 90)),
    "R10": Component("330R", RESISTOR, "Device:R", (27, 47, 0), (52, 112, 90)),
    "C1": Component("100n", DISC, "Device:C", (76, 47, 270), (303, 34, 90)),
    "C2": Component("100n", DISC, "Device:C", (18, 13, 180), (56, 157, 90)),
    "C3": Component("100n", DISC, "Device:C", (18, 17, 180), (110, 157, 90)),
    "C4": Component("100n", DISC, "Device:C", (18, 40, 180), (45, 51, 90)),
    "C5": Component("10u", "Capacitor_THT.pretty/CP_Radial_D5.0mm_P2.00mm",
                    "Device:C_Polarized", (19, 45, 180), (80, 51, 90)),
    "C6": Component("470u", "Capacitor_THT.pretty/CP_Radial_D10.0mm_P5.00mm",
                    "Device:C_Polarized", (88, 55, 180), (113, 51, 90)),
    "BZ1": Component("5V active buzzer", "Buzzer_Beeper.pretty/Buzzer_12x9.5RM7.6",
                     "Device:Buzzer", (85, 69, 0), (266, 106, 0), "5V BUZZER"),
    "F1": Component("Polyfuse 1.5A", "Fuse.pretty/Fuse_BelFuse_0ZRE0016FF_L9.9mm_W3.8mm",
                    "Device:Polyfuse", (72, 60, 0), (73, 33, 90), "1.5A PTC"),
    "H1": Component("M3", HOLE, "Mechanical:MountingHole", (3.5, 3.5, 0), (36, 220, 0)),
    "H2": Component("M3", HOLE, "Mechanical:MountingHole", (96.5, 3.5, 0), (59, 220, 0)),
    "H3": Component("M3", HOLE, "Mechanical:MountingHole", (96.5, 76.5, 0), (82, 220, 0)),
    "H4": Component("M3", HOLE, "Mechanical:MountingHole", (3.5, 76.5, 0), (105, 220, 0)),
}

NETS = {
    "+5V": ("D6.1", "K1.1", "K1.2", "D4.1", "J5.1", "BZ1.1",
            "J9.15", "C4.1", "C5.1", "C6.1"),
    "GND": ("J1.2", "J9.14", "J10.2", "Q1.3", "Q2.3", "R2.2", "R4.2", "R7.2", "C1.2",
            "C2.2", "C3.2", "C4.2", "C5.2", "C6.2", "D1.1", "D2.1", "D3.1", "D5.2",
            "J2.2", "J3.2", "J4.2", "J5.4", "J6.3", "J7.6", "J8.6"),
    "+3V3": ("J10.1", "J3.1", "J4.1", "J6.1", "J7.7", "R5.2", "J8.5"),
    "+5V_IN": ("J1.1", "F1.1"),
    "+5V_FUSED": ("F1.2", "D6.2"),
    "PUMP_SW": ("K1.3", "J2.1", "D5.1", "C1.1"),
    "SOIL_AOUT": ("J9.4", "J3.3", "C2.1"),
    "RAIN_A": ("J9.5", "J4.3", "C3.1"),
    "DHT_DATA": ("J10.5", "J6.2", "R5.1"),
    "US_TRIG": ("J9.10", "J5.2"),
    "US_ECHO_5V": ("J5.3", "R3.1"),
    "US_ECHO_3V3": ("R3.2", "R4.1", "J10.9"),
    "RELAY_DRV": ("J9.9", "R1.1"),
    "Q1_BASE": ("R1.2", "Q1.2", "R2.1"),
    "Q1_COLL": ("Q1.1", "K1.5", "D4.2"),
    "LED_G": ("J9.8", "R8.1"),
    "LED_G_K": ("R8.2", "D1.2"),
    "LED_B": ("J9.7", "R9.1"),
    "LED_B_K": ("R9.2", "D2.2"),
    "LED_R": ("J9.6", "R10.1"),
    "LED_R_K": ("R10.2", "D3.2"),
    "BUZZ_DRV": ("J10.15", "R6.1"),
    "Q2_BASE": ("R6.2", "Q2.2", "R7.1"),
    "BUZZ_NEG": ("Q2.1", "BZ1.2"),
    "LCD_RST": ("J10.14", "J7.1"),
    "LCD_CS": ("J10.3", "J7.2"),
    "LCD_DC": ("J10.10", "J7.3"),
    "LCD_SDA": ("J10.11", "J7.4"),
    "LCD_SCL": ("J10.8", "J7.5"),
    "SPARE_13": ("J9.13", "J8.1"),
    "SPARE_14": ("J9.11", "J8.2"),
    "SPARE_16": ("J10.6", "J8.3"),
    "SPARE_17": ("J10.7", "J8.4"),
}

PIN_NETS = {pin: net for net, pins in NETS.items() for pin in pins}
NO_CONNECT = ("J9.1", "J9.2", "J9.3", "J9.12", "J10.4", "J10.12", "J10.13", "K1.4")

CONNECTOR_LABELS = {
    "J1": ("+5V IN", "GND"),
    "J2": ("PUMP+", "PUMP-"),
    "J3": ("+3V3", "GND", "AOUT"),
    "J4": ("+3V3", "GND", "S"),
    "J5": ("+5V", "TRIG", "ECHO", "GND"),
    "J6": ("+3V3", "DATA", "GND"),
    "J7": ("RST", "CS", "DC", "SDA", "SCL", "GND", "+3V3"),
    "J8": ("GPIO13", "GPIO14", "GPIO16", "GPIO17", "+3V3", "GND"),
    "J9": ("EN", "GPIO36", "GPIO39", "GPIO34", "GPIO35", "GPIO32", "GPIO33", "GPIO25",
           "GPIO26", "GPIO27", "GPIO14", "GPIO12", "GPIO13", "GND", "VIN"),
    "J10": ("+3V3", "GND", "GPIO15", "GPIO2", "GPIO4", "GPIO16", "GPIO17", "GPIO5",
            "GPIO18", "GPIO19", "GPIO21", "GPIO3/RX", "GPIO1/TX", "GPIO22", "GPIO23"),
}

SCHEMATIC_BLOCKS = (
    (25, 20, "POWER INPUT AND DECOUPLING"),
    (147, 20, "PUMP AND RELAY DRIVER"),
    (25, 66, "STATUS LEDS"),
    (147, 93, "ACTIVE BUZZER DRIVER"),
    (25, 133, "SENSORS AND ECHO LEVEL DIVIDER"),
    (146, 133, "DISPLAY AND SPARE"),
    (205, 133, "ESP32 DOIT DEVKIT V1"),
    (25, 213, "MOUNTING"),
)


def component_uuid(ref):
    return uuid5(SHEET_UUID, ref)


def library_id(component):
    library, name = component.footprint.split("/")
    return library.removesuffix(".pretty"), name


def write_bom(path):
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output, lineterminator="\n")
        writer.writerow(("Reference", "Quantity", "Value", "Footprint"))
        for ref, component in COMPONENTS.items():
            writer.writerow((ref, 1, component.value, ":".join(library_id(component))))
