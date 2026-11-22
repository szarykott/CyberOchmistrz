---
name: domain-glossary
description: Clarify CyberOchmistrz domain terminology and maintain GLOSSARY.md when discussing ambiguous concepts, resolving naming conflicts, or documenting agreed definitions. Reading existing definitions alone does not require this workflow.
---

# Domain Glossary

Maintain the repository-root [GLOSSARY.md](../../../GLOSSARY.md) as the shared domain vocabulary. This skill covers terminology only, without ADRs or code changes.

## Resolve meaning

Read relevant definitions and repository instructions first. Inspect only the code, tests, or documentation needed to understand the concepts under discussion.

When a term has conflicting meanings, state the conflict and propose a precise term. Use a concrete scenario to distinguish concepts, such as a catalog recipe versus its assignment to a cruise day with a portion count and meal slot. Ask focused questions only where meaning remains unresolved; continue independent investigation while waiting.

Separate current implementation behavior from intended domain meaning. If code, documentation, and the user's explanation disagree, show the discrepancy and ask which meaning is intended. Do not treat code as the authority or silently turn a bug into a domain rule.

## Capture the agreement

When meaning is settled, update the relevant glossary entry during the task if documentation edits are authorized. Reuse definitions already agreed in the conversation; do not request confirmation again. For analysis-only requests, present proposed entries without editing files. Leave unresolved meanings as explicit questions rather than accepted definitions.

Use this entry format:

```markdown
**Canonical English term** (Polish: corresponding domain term)
A definition of one or two sentences distinguishing this concept from related concepts.
_Avoid_: misleading synonyms, only when an actual naming conflict needs documenting.
```

Keep definitions about the domain. Technical identifiers, storage formats, React, immutability, and implementation decisions belong in code or engineering documentation. Preserve the intentional `recipie` spelling in existing identifiers; a glossary update does not authorize renaming code.

Write repository prose in English and retain established Polish domain terms. Keep definitions in GLOSSARY.md rather than duplicating them in README.md or AGENTS.md. Add relationship notes or open questions only when needed to explain a real distinction.

Finish by reporting resolved meanings, changed entries, and remaining questions. Stop when requested terminology is clarified and authorized glossary updates are complete. Do not expand into refactoring or architecture documentation.

Inspired by Matt Pocock's [domain-modeling](https://github.com/mattpocock/skills/tree/main/skills/engineering/domain-modeling), adapted to this repository's vocabulary and scope.
