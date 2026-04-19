---
name: no-tier-orchestrator
description: An orchestrator-tier agent with the Agent tool, covering the permissive branch of validateTierConsistency.
tools:
  - Agent
  - Read
  - Write
x-tier: orchestrator
---

# no-tier-orchestrator

Regression fixture for the orchestrator branch of `validateTierConsistency`. Orchestrators are neither required to omit nor required to include the Agent tool; either shape must produce zero tier-consistency warnings.
