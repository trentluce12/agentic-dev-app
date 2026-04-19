---
name: lead-missing-agent
description: A lead-tier agent deliberately missing the Agent tool, exercising the tier.lead-missing-agent-tool warning path.
tools:
  - Read
  - Grep
x-tier: lead
---

# lead-missing-agent

Regression fixture for the lead-missing-agent-tool warning. Without the Agent tool, orchestration would silently run flat.
