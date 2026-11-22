# Device decisions (agreed with the farm owner)

These are product decisions, not suggestions. Any work on the AquaFarm controller integration must follow them.

1. **Auto is the default mode.** The board boots in Auto and Auto is the normal state. Manual is an option the user can select, not the default. Do not change the boot mode to Manual.
2. **Keep it simple - do not design for edge cases.** No elaborate link-loss fallbacks, no multi-state recovery logic, no speculative failure handling. Implement the straightforward path and say what is left out.
3. **Maximum continuous pump run: 2 minutes (120 s).** This is the hard cap everywhere: the board (`MANUAL_HARD_CAP_SEC`), "Until Stop", and the server-side limit. A timed manual run stays 3/5/10/15/30 s; anything open-ended stops at 120 s.
4. **Only the owner and managers may switch the mode** (Auto <-> Manual). Viewers and technicians cannot. Watering and Stop stay available to whoever can already control devices.

Consequences to keep in mind while implementing:

- The board's manual-watering gate: `on` is refused while Auto is active, `off` (Stop) always works. The website must mirror exactly that, including the message.
- The 120 s cap must be enforced on the server too, because the board cannot be trusted to be the only guard.
- Do not add "auto-stop when the website loses the link" behaviour or similar; the board keeps running its own logic.
