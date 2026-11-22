## Caveman

If skill 'caveman' is available, always use it in full mode - command is /caveman full

## Lazy context loading

Read README.md to learn about code structure and data flow.

Do not load all files into context initially, use README.md to figure out parts to read and load the rest lazily - if already loaded part of code references it or you have moderate suspicion that changes you make might influence unloaded parts of the code.

## Product constraints

Follow the intended usage and platform requirements in [README.md](README.md#intended-usage-and-platform-requirements):

- Preserve static export; using the application must not require running an application server or backend.
- Support PC, iOS, and Android. Prioritize phone layouts and touch interaction for everyday workflows.
- Cruise planning must also work well on desktop, where it is often performed, while remaining usable on phones.
- Verify UI changes on phone layouts and cruise-planning changes on desktop as well.

## Comments

If you encounter a comment in code - leave it as-is, unless your change makes it innacurate (in such case - make it accurate) or outdated (remove if cannot fix).

Under no cirsumstance, remove or edit comments in parts of file unrelated to your changes. If you do not make functional change in a file, do not touch comments in it.

If there are magic numbers, especially in tests, use comments to explain briefly where do those numbers come from and, if applicable, how they were calculated.

---

## Language in repository

Use English as the natural language in the repository with exception:

- some domain terms are deliberately in Polish

---

## Documentation for agents - keep updated

In case you add a functionality or make a change to existing one, check if description README.md is still valid and adjust it accordingly. For example:

- when a known bug is fixed, remove it from the file
- when dataflow is changed, reflect it in the graph
- when directory structure changes (e.g file is added, removed), reflect it in the documentation file

When you add or remove file, make sure to update directory structure in README.md

## Polish Domain Glossary

Read [GLOSSARY.md](GLOSSARY.md) for canonical domain terms and their Polish equivalents. Use those meanings in domain discussions, documentation, and new names. Do not duplicate definitions here.

When terminology needs clarification or an agreed definition changes, use the repository's [domain-glossary skill](.agents/skills/domain-glossary/SKILL.md). Reading definitions alone does not require invoking the skill.

Polish appears in string literals and route paths, not in variable/function names (which are English + intentional `recipie` spelling).
