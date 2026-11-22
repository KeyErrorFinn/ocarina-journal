# Contributing

Thanks for helping. Ocarina Journal is a small fan project, and most of what it needs is careful, small changes:
a screen that looks wrong, a stat that counts the wrong thing, a flag in the save that nobody has named yet.

Working with a coding agent? Point it at [`AGENTS.md`](AGENTS.md): the same rules, written for agents.

Before anything else, read the [project rules](docs/RULES.md). They are short, and a pull request that breaks one
can't be merged however good it is. The reasons pull requests most often come back are in
[`docs/DOS-AND-DONTS.md`](docs/DOS-AND-DONTS.md).

## Where does my idea go?

Pick the smallest home that fits:

| Your idea | Where it goes |
|---|---|
| A bug fix, a layout fix, wording, a translation | A pull request |
| Something counted or named wrongly (a stat, a medal, a map item) | An issue with the **Research finding** form, or a pull request with the evidence |
| A new save flag, file format detail or game fact you worked out | [`docs/research/`](docs/research), with every claim marked (see below), plus the code that uses it |
| A new quiz question, medal, map marker kind or Rumor Hunt landmark | A pull request following the guide in [`docs/workflows/`](docs/workflows) |
| A new screen or a bigger feature | An issue first, so we can agree on it before you build it |
| Your own fork, theme, tool or port built on this | Your own repository, plus one row in [`SHOWCASE.md`](SHOWCASE.md) |
| A question, or "does this work with my setup?" | [Discussions](https://github.com/KeyErrorFinn/ocarina-journal/discussions) |

## Setting up

You need Windows 10 or 11, [Rust](https://rustup.rs) (stable), [Node.js](https://nodejs.org) 20 or newer,
[pnpm](https://pnpm.io) and the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) (WebView2 and the
MSVC build tools). A Longshot install with your own game files is needed to see real data, but not to build or to
run most tests.

```powershell
git clone https://github.com/KeyErrorFinn/ocarina-journal.git
cd ocarina-journal/app
pnpm install
pnpm tauri dev        # the app, with hot reload for the interface
```

The app finds the game in the usual Longshot folders and picks up the folder of a running `longshot.exe`. Without
a game it still opens, with the screens that need game data showing what is missing.

## Checking your change

Run what CI runs before you open a pull request:

```powershell
# from the repository root
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace

# from app/
pnpm check            # type check, ESLint and Prettier
pnpm build
```

`pnpm format` and `cargo fmt --all` fix formatting for you. Rust is formatted at 120 columns (`rustfmt.toml`),
TypeScript with Prettier (`app/.prettierrc.json`); CSS is kept as one rule per line by hand.

### Tests that need the game

Some tests read a real game install and **skip silently** without one, so a green run on a machine without the
game hasn't checked them. If your change touches game data (`crates/oj-gamedata`, `crates/oj-savefile`), run them
against your own install too:

```powershell
$env:OJ_TEST_GAME = "C:\path\to\Longshot\<version>"     # the folder that holds romfs
cargo test -p oj-gamedata
```

`crates/oj-gamedata/tests/golden.rs` also takes `OJ_TEST_SAVE` and `OJ_TEST_GOLDEN`; its header explains them.
Say in your pull request which of these you ran and with which Longshot version.

## Marking claims

Facts about the game, its files and the original companion app are marked where they are written:

- **[V]** verified: checked against real files or a real save, and how.
- **[I]** inferred: follows from evidence but wasn't checked directly.
- **[U]** unknown: a guess or an open question.

Never invent an offset, a flag name or a file structure. "Unknown" is a fine answer.

## Pull requests

- One topic per pull request. Small is good.
- Fill in the template: what changed, what you tested it with (Longshot version, game revision, bridge on or
  off, or no game), and a screenshot for anything visible. Use the no-game state or synthetic data so shared
  screenshots contain no game-derived artwork, text or personal paths.
- For interface changes, check a narrow window (about 450 px wide) and a wide one: the app resizes freely.
- No new dependency without an issue first.
- Don't edit `.github/workflows/` in a feature pull request; open a separate one if CI needs changing.
- Be kind in reviews.

A maintainer may push a small fix to your branch to get it merged rather than ask for another round. How pull
requests are judged is written down in [`.github/maintainer/MAINTAINER.md`](.github/maintainer/MAINTAINER.md).

## Licence

Ocarina Journal is released under the [GNU General Public License v3.0 or later](LICENSE). By contributing you
agree that your contribution is released under the same licence, and that you have the right to release it
(it's your own work, and contains nothing you copied from Nintendo, the game or the original app).
