# IDesign Detailed Design Checklist — verbatim

**Source, and how to cite it.** `knowledge/sources/clinics/DDC/Materials/Detailed Design
Checklist.{pdf,txt}` in `theagent-unchained` — the IDesign Detailed Design Clinic handout,
© 2017 IDesign Inc., www.idesign.net. Quoted verbatim by the licence holder's ruling of
2026-09-09 (relay R-104, letter «A»). **Proprietary — see the SKILL.md warning.**

Cite a line of it as:

> *Detailed Design Checklist*, Service Contract Smells: «Multiple contexts in same Manager
> contract»

Section names below are the document's own. The wording is the document's own. Where the source
uses a sub-bullet (`o` in the text extraction) it is nested here; nothing else is changed, and
nothing is added.

---

## Overview

- Just like architecture, detailed design is a process
  - Highly iterative
  - Process begins during architecture validation
  - Sketch detailed design in code
- While architecture does not, detailed design emerges
  - Comes late
  - Can never have all details upfront
- Problems in detailed design indicate problems with architecture
- Must always keep HOP in mind

## Goals

- Balance size and count of contracts with integration and maintenance cost
- Both service contracts and DTOs
- Too few couples system aspects together
- Too many becomes maintenance nightmare

## Guiding Principles

- All good detailed design is SOLID
- Look for SRP, ISP and SoC
- High cohesion
- SO != OO
- Must provide interface-based programming model

## Service Contract Smells

- Naming prefixes and suffixes
- Contracts with low cohesion
- Too few/many operations
- Dull facet
- Overly generalized operations
  - Too many parameters
  - Canonical DTO
  - Exception is Workflow Manager
- Property operations
- Non-use case named operations in Manager
- Multiple contexts in same Manager contract
- Operation names that do not imply action
- Hierarchical contracts
- Strict adherence to DTO pattern

## DTO Smells

- Canonical DTOs
- Overly generalized DTOs
- Logic in DTO
- Table schema DTOs
- DTOs that are business objects
- DTOs that are not aggregates
- Naming prefixes and suffixes
- Too few/many properties
- Strict adherence to DTO pattern

## Guidelines

- Always use namespace guidelines
  - Leverage subsystem segment
  - Look for new subsystems/volatilities
- Look for smells
- Look for SOLID compliance
- Look for cohesion
  - Concepts should only have single reason to change
- Look for DTOs that are not cohesive with facet
- Look for Strategy Pattern opportunities
- Always apply same factoring technique to both contract and DTO
- Prefer compositional, not hierarchical contracts
- Prefer chunk, not chatty interactions
- Refactor naming smells into separate facets
- Collapse too few operations into existing contract
- Refactor too many operations into separate facets
- No more than 20 operations/contract
  - Prefer less
- DTOs must always align with use cases, not resource schema
- Consider performing operation factoring
  - Scoping DTOs to operation
  - In line with DTO Pattern
- Never pass data entities out
- Never pass public DTOs in or an internal DTO out

---

## Reading notes for a reviewer (this toolchain's words, NOT the source's)

Everything above this line is quotable as the source. Everything below is theagent2's reading and
must never be cited as IDesign's.

- **"Strict adherence to DTO pattern" appears in both smell lists.** It is a smell in *both*
  directions: mechanically minting a request and a result type for every operation regardless of
  need is as much a defect as sharing one bag across many. The Guidelines' *"Consider performing
  operation factoring — Scoping DTOs to operation — In line with DTO Pattern"* is the balance.
  Do not read the two as contradicting each other, and do not write a finding that quotes one
  against the other.
- **"Dull facet"** is a facet with nothing of its own — one operation, or a set with no cohesive
  reason to be together. It is the counterweight to *"Refactor too many operations into separate
  facets"*: both directions of the same cost/count judgement (*Goals*).
- **"Must always keep HOP in mind"** — HOP is the Hand-Off Point, the team that will build against
  this contract. A design correct for a senior team and unbuildable by the actual one is a real
  finding, but it needs evidence about the team, which a gate reviewer usually does not have.
  Prefer silence to speculation.
- **"Non-use case named operations in Manager"** is the sharpest line on this page for a Method
  model: a Manager's public surface *is* its use-case list, so an operation there that no use case
  names is either a missing use case or an internal step that has leaked onto the contract.
