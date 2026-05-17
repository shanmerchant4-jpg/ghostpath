Output demo.gif

Set Theme "Catppuccin Mocha"
Set Width 1200
Set Height 600
Set FontSize 14
Set Shell "bash"
Set TypingSpeed 40ms
Set Padding 20

Type "cd /tmp/ghostpath-demo"
Enter
Sleep 500ms

# ── Help ──────────────────────────────────────────────────────────────────────
Type "node dist/cli.js --help"
Enter
Sleep 2.5s

# ── Add a project ─────────────────────────────────────────────────────────────
Type "node dist/cli.js add ./examples/nextjs-project"
Enter
Sleep 2s

# ── List (before open) ────────────────────────────────────────────────────────
Type "node dist/cli.js list"
Enter
Sleep 1.5s

# ── Open ──────────────────────────────────────────────────────────────────────
Type "node dist/cli.js open portfolio"
Enter
Sleep 4s

# ── Status ────────────────────────────────────────────────────────────────────
Type "node dist/cli.js status"
Enter
Sleep 3.5s

# ── Stop (5-second countdown runs to completion in non-TTY) ──────────────────
Type "node dist/cli.js stop portfolio"
Enter
Sleep 8s

# ── List (after stop) ─────────────────────────────────────────────────────────
Type "node dist/cli.js list"
Enter
Sleep 2s
