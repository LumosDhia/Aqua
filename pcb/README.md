# AquaFarm irrigation controller PCB

## Rebuild

Run from the project directory on Debian with KiCad 9.0.2, its standard libraries under `/usr/share/kicad`, and the Python interpreter that provides `pcbnew`.

```sh
/usr/bin/python3 -B build_sch.py
/usr/bin/python3 -B build_pcb.py
kicad-cli sch erc --exit-code-violations -o /tmp/aquafarm-erc.rpt AquaFarm-PCB.kicad_sch
kicad-cli pcb drc --exit-code-violations -o /tmp/aquafarm-drc.rpt AquaFarm-PCB.kicad_pcb
```

The builders overwrite `AquaFarm-PCB.kicad_sch`, `AquaFarm-PCB.kicad_pcb` and `BOM.csv`. `design.py` defines the parts, board placement and electrical assignments. A successful routing run should report `ROUTED 33/33 nets` and an empty routing unconnected list. The four `M3` BOM entries describe mounting locations. Order the screws and other hardware for the enclosure separately.

## Build assumptions

- Fabrication stack is 100 × 80 mm with R3 corners, two layers of 1 oz copper and 1.6 mm FR-4. The fabrication and placement-grid origins are at the lower-left corner of the nominal outline. Use a 1 mm placement grid. The ESP32 row pitch and the 3.5 mm mounting offsets use their specified dimensions.
- The socket is for the 30-pin DOIT DEVKIT V1, with 22.86 mm between rows. Fit the module with its antenna toward the top edge. Verify the antenna overhang and USB access with the actual module on a 1:1 print. The two-layer keepout covers the inboard antenna region between the sockets.
- J3 through J6 use keyed JST-XH housings at 2.50 mm pitch. Confirm the order printed on the GC9A01 against J7. The firmware assignments in the report assume CS on GPIO15 and DC on GPIO19. The `SDA` and `SCL` markings on the display connector carry SPI data and clock.
- F1 uses the indexed `Fuse:Fuse_BelFuse_0ZRE0016FF_L9.9mm_W3.8mm` footprint as the closest radial geometry. Specify a 1.5 A hold-current PTC for assembly and verify its staggered lead positions against the footprint, at `(0, 0)` and `(5.10, 1.60)` mm in library coordinates.
- D6 (1N5819) is a series Schottky diode that provides reverse-polarity protection for the board's `+5V` rail. The input at J1.1 connects to F1.1 on `+5V_IN`. The fuse output at F1.2 connects to D6.2 (anode) on `+5V_FUSED`, and D6.1 (cathode) feeds the board's `+5V` rail.
- The bottom-layer pump and relay returns join the logic return at J1.2. The gap in both ground pours preserves that junction. Use a C6 rated at least 10 V and confirm that the pump’s running and startup current fits the 5 V supply budget from the wiring report.

## K1 relay pad map

**Verify against relay datasheet** for the exact SRD-05VDC-SL-C part being fitted. The board uses the KiCad SANYOU SRD Form C pad numbering.

| K1 pad | Function | Board connection |
| --- | --- | --- |
| 1 | COM | +5V |
| 2 | Coil+ | +5V |
| 3 | NO | PUMP_SW |
| 4 | NC | Leave empty |
| 5 | Coil− | Q1_COLL |

## Connector pin map

Each row lists the pins starting at the marked pin 1.

| Ref | Connector | Pins in order |
| --- | --- | --- |
| J1 | 5 V input | +5V_IN, GND |
| J2 | Pump | PUMP_SW (pump+), GND (pump−) |
| J3 | Soil | +3V3, GND, AOUT |
| J4 | Rain | +3V3, GND, S (analog) |
| J5 | HC-SR04 | +5V, TRIG, ECHO (5 V), GND |
| J6 | DHT11 | +3V3, DATA, GND |
| J7 | Display | RST, CS, DC, SDA, SCL, GND, +3V3 |
| J8 | Spare | GPIO13, GPIO14, GPIO16, GPIO17, +3V3, GND |

### ESP32 sockets

Read both rows from the antenna end toward the bottom edge. NC denotes a deliberately open socket pad.

| Pad | J9 left pin | Board net | J10 right pin | Board net |
| --- | --- | --- | --- | --- |
| 1 | EN | NC | 3V3 | +3V3 |
| 2 | GPIO36 | NC | GND | GND |
| 3 | GPIO39 | NC | GPIO15 | LCD_CS |
| 4 | GPIO34 | SOIL_AOUT | GPIO2 | NC |
| 5 | GPIO35 | RAIN_A | GPIO4 | DHT_DATA |
| 6 | GPIO32 | LED_R | GPIO16 | SPARE_16 |
| 7 | GPIO33 | LED_B | GPIO17 | SPARE_17 |
| 8 | GPIO25 | LED_G | GPIO5 | LCD_SCL |
| 9 | GPIO26 | RELAY_DRV | GPIO18 | US_ECHO_3V3 |
| 10 | GPIO27 | US_TRIG | GPIO19 | LCD_DC |
| 11 | GPIO14 | SPARE_14 | GPIO21 | LCD_SDA |
| 12 | GPIO12 | NC | GPIO3/RX | NC |
| 13 | GPIO13 | SPARE_13 | GPIO1/TX | NC |
| 14 | GND | GND | GPIO22 | LCD_RST |
| 15 | VIN | +5V | GPIO23 | BUZZ_DRV |
