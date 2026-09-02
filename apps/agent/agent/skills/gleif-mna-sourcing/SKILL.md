---
description: Use when asked to source M&A targets, list a group's subsidiaries by country, build a cross-border target list, or find the executives of those targets — the GLEIF register plus web research, under the legal rules that keep the list usable.
---

# GLEIF M&A sourcing

The GLEIF register is the public list of legal entities that hold a Legal
Entity Identifier, with the parent–subsidiary relationships they report. It
is the deterministic half of sourcing: who owns what, where. The other half,
who runs each target, is web research and it is where the rules below apply.

## 1. Fix the scenario before searching

A scenario is a parent place and a child place: "US parents with subsidiaries
in Asia", "EU groups with a Mexican entity". Ask for both when the request
gives only one. `UE` and `ASIE` are known regions; anything else is ISO codes
separated by commas.

## 2. Find the parents

- A named group: `gleif_search_entities` with the name and its country, then
  keep the ACTIVE entity that is the group head. `gleif_get_entity` on a
  candidate shows its direct parent; a group head has none.
- A whole scenario with no names: ask the rep for a list of parents, or take
  the companies already in the CRM (`search_crm`) that sit in the parent
  place. GLEIF search is by name, not by country alone.

## 3. List the targets

For each parent, `gleif_list_subsidiaries` with `childCountries` set to the
child place. Every row returned is a target: LEI, legal name, country, city.
A local-language legal name usually comes with `alternativeNames`; use the
Latin one when you search the web for the entity, and show both in the list.

- Rank parents by how many matching subsidiaries they have. More entities in
  the child place means more to buy, and more to talk to.
- GLEIF relationships are self-reported. A group with zero children in the
  register is not proof it has none. Say so rather than dropping it silently.
- `totalDirectChildren` is the parent's whole footprint; `matched` is the
  slice in the child place. Report both.

## 4. Find who runs each target

This is not deterministic and it is where a list becomes unusable if you cut
corners. The rules:

- **Never fetch linkedin.com.** A profile URL comes from a search engine
  snippet, which is public. Use `research_person`, `find_contact_socials` and
  `resolve_linkedin_profile`; they already respect this.
- **Never invent a LinkedIn URL.** If no snippet shows it, the answer is
  "not found". A plausible namesake is worse than a blank.
- **One source per line.** Every executive you name carries the domain you
  saw it on and the date. `record_fact` with `web.cited-claim` or
  `search.cites-profile` is how that lands on a contact.
- **Subsidiaries rarely have a CEO.** Look for the local title: managing
  director, country head, general manager, president director. Several
  people per entity is normal. When the entity has no leader of its own,
  give the group leader and say it is the group's.
- **Expect blanks.** Ten to twenty percent of group leaders and far more
  local ones have no public profile. Do not fill the gap.

Contact details (email, phone) come only from a provider that carries the
compliance of the source, never from a page you read. If none is configured,
stop at name, title and public profile.

## 5. Deliver

Write the list as a table: parent, LEI, target legal name, country, city,
leader, title, profile URL, source. Then the counts: parents scanned,
targets found, leaders found, leaders without a public profile. A target
already in the CRM (`search_crm` by name) is marked as such rather than
duplicated.

## Quality checks before handing over

- Every LEI has 20 characters and appears once.
- Every target belongs to the child place asked for.
- Every profile URL was seen in a snippet and matches the named person.
- Every blank is reported as a blank, not as a guess.
