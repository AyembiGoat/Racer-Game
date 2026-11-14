# Skills

Playbooks for specific kinds of work. Each is a folder in `.agents/skills/` containing
a `SKILL.md`. `.claude/skills` is a link to the same folder, so Claude Code and tools
that read `.agents/skills` load the same set. Read [`AGENTS.md`](AGENTS.md) first.

## Project skills

| Skill                                                                  | Use it when                                                 |
| ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| [no-slop](.agents/skills/no-slop/SKILL.md)                             | Before finishing any change; reviewing a change             |
| [verify-work](.agents/skills/verify-work/SKILL.md)                     | A check fails; deciding what to test                        |
| [gameplay-systems](.agents/skills/gameplay-systems/SKILL.md)           | Handling, braking, collision, checkpoints, lap rules, AI    |
| [track-design](.agents/skills/track-design/SKILL.md)                   | Building or changing circuits, barriers, checkpoints, grids |
| [reference-images](.agents/skills/reference-images/SKILL.md)           | Before making anything the player will see                  |
| [models-and-assets](.agents/skills/models-and-assets/SKILL.md)         | Adding or changing 3D models, textures, animation, audio    |
| [textures](.agents/skills/textures/SKILL.md)                           | Giving anything a colour, material or texture               |
| [cars](.agents/skills/cars/SKILL.md)                                   | Adding a car; wheel, light and camera anchors               |
| [cameras](.agents/skills/cameras/SKILL.md)                             | Changing chase, bonnet or cockpit cameras and field of view |
| [sound](.agents/skills/sound/SKILL.md)                                 | Adding or changing engine, tyre, impact or UI sound         |
| [rendering-performance](.agents/skills/rendering-performance/SKILL.md) | Lighting, materials, effects, frame rate, load time         |

## Vendored skills

Copied unmodified from their sources. Update by copying the folder again; put
project-specific adjustments in `AGENTS.md`, not in these files.

| Skill                                                              | Use it when                                         | Source                                                                 | Licence    |
| ------------------------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| [frontend-design](.agents/skills/frontend-design/SKILL.md)         | Choosing the art direction; designing menus and HUD | [anthropics/skills](https://github.com/anthropics/skills) at `2c5958e` | Apache-2.0 |
| [webapp-testing](.agents/skills/webapp-testing/SKILL.md)           | Running the game in a real browser to look at it    | [anthropics/skills](https://github.com/anthropics/skills) at `2c5958e` | Apache-2.0 |
| [file-pr](.agents/skills/file-pr/SKILL.md)                         | The owner asks for a pull request                   | [t3dotgg/tstack](https://github.com/t3dotgg/tstack) at `11e37a7`       | MIT        |
| [babysit-pr](.agents/skills/babysit-pr/SKILL.md)                   | Watching a pull request through CI                  | [t3dotgg/tstack](https://github.com/t3dotgg/tstack) at `11e37a7`       | MIT        |
| [leaving-pr-comments](.agents/skills/leaving-pr-comments/SKILL.md) | Posting any comment on GitHub                       | [t3dotgg/tstack](https://github.com/t3dotgg/tstack) at `11e37a7`       | MIT        |

`webapp-testing` needs Python with Playwright and a browser installed
(`pip install playwright && playwright install chromium`). `babysit-pr` needs the
GitHub CLI and `python3`.

`frontend-design` is written for web pages. Where it conflicts with the art direction
section of `AGENTS.md` or with `no-slop`, those win.

## Adding a skill

Create `.agents/skills/<name>/SKILL.md` with `name` and `description` front matter and
add a row above. Write a skill when the same guidance has been needed more than once.
Keep it to what an agent would get wrong without it.
