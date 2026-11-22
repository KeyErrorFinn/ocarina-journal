# Do's and don'ts

The reasons pull requests most often come back for changes. This page grows from real reviews: when a pull
request is sent back for something that isn't here yet, a line is added with a link to it. It doesn't replace
[CONTRIBUTING](../CONTRIBUTING.md) or the [project rules](RULES.md).

## Before you start

| Do | Don't |
|---|---|
| Search open and closed issues and pull requests first, and build on what is there | Add a second version of something the app already does |
| Open an issue for a new screen or a bigger feature and agree on it first | Send a large pull request that mixes a feature, a refactor and a restyle |
| Keep one topic per pull request | Bundle unrelated fixes because they were found together |

## Game data and research

| Do | Don't |
|---|---|
| Read names, maps and sounds from the player's install at runtime | Commit anything extracted from the game, even small or "just for a test" |
| Mark every new fact [V], [I] or [U] and say how a [V] was checked | Present a guess as fact, or invent a flag name or offset |
| Run the game tests with `OJ_TEST_GAME` and say which Longshot version you used | Rely on a green CI run for code that reads game files: those tests skip there |
| Read flags by name through `flag_hash` when they are struct members (`HavePlayedEvent.*`) | Assume `GameData::find` sees every flag: it finds top-level ones only |

## Interface

| Do | Don't |
|---|---|
| Attach screenshots at a narrow (about 450 px) and a wide window | Test only at one window size |
| Use the existing colours, fonts and components (`components/chrome.tsx`) | Add a new UI library or a one-off style system |
| Make new art original, and say where it came from | Use Nintendo art or screenshots, even as a placeholder |
| Keep screens working with no game, no bridge and no saves | Assume the live bridge is always on |

## Code

| Do | Don't |
|---|---|
| Run `cargo fmt`, `cargo clippy` and `pnpm check` before pushing | Leave formatting for the reviewer |
| Keep game access read-only | Write to saves or game files, or add a command that can |
| Discuss a new dependency in an issue first | Add one for something a few lines would do |
| Leave CI and workflow changes to a separate pull request | Edit `.github/workflows/` along with a feature |
