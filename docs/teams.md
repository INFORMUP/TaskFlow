# Teams

Teams represent distinct groups of people who interact with TaskFlow at different levels of engagement and permission. Each team has a defined scope of responsibility and a corresponding set of capabilities within the system.

---

## Engineer

**Alternative names:** Developer, Builder, Implementer

Engineers are the hands-on builders who develop solutions alongside AI agents. They work directly in code, manage technical decisions, and are responsible for the quality and correctness of implementations. In TaskFlow, engineers are the primary actors during implementation, investigation, and validation phases of task flows.

**Key responsibilities:**
- Investigate and resolve bugs (with agent assistance)
- Implement features via red-green TDD with agent collaboration
- Approve or reject technical approaches surfaced by agents
- Validate that solutions meet technical requirements
- Manage code reviews and merges

---

## Product

**Alternative names:** Product Manager, Stakeholder, Designer

The Product team designs features, sets priorities, and reviews deliverables. They define *what* gets built and *why*, while engineers and agents determine *how*. Product members are the primary actors during discussion, design, and final review phases.

**Key responsibilities:**
- Define and prioritize feature requests
- Review and approve feature designs and prototypes
- Perform final review of completed features
- Triage and prioritize incoming bug reports
- Set acceptance criteria for tasks

---

## User

**Alternative names:** End User, Reporter, Customer

Users are downstream consumers of the product. They interact with TaskFlow primarily as reporters — surfacing bug reports and feature requests based on their real-world experience. Their permissions are intentionally limited to prevent scope creep, but their input is critical for grounding development in actual needs.

**Key responsibilities:**
- Submit bug reports with reproduction steps
- Submit feature requests with use-case descriptions
- Confirm or deny that reported bugs have been resolved (when asked)
- Provide feedback on prototypes or released features (when solicited)

---

## Proposals

### Additional Teams to Consider

#### Agent

**Recommendation: Include**

AI agents (e.g., Claude) are first-class participants in TaskFlow's workflows — they investigate bugs, co-implement solutions, and validate fixes. Modeling them as a distinct team (rather than treating them as extensions of engineers) has several benefits:

- **Auditability:** Actions taken by agents vs. humans are distinguishable in logs and history.
- **Permissions:** Agent capabilities can be scoped independently (e.g., an agent can investigate but not approve).
- **Accountability:** When an agent performs validation or analysis, the system can track which agent instance did it and under what parameters.

Agents wouldn't "log in" like humans — they'd authenticate via API tokens with team-level permissions.

#### QA / Test

**Recommendation: Do not include (yet)**

A dedicated QA team is common in larger organizations, but TaskFlow's design already distributes QA responsibilities across existing roles:
- Engineers validate fixes via TDD
- Agents perform automated validation
- Product performs final review

Adding a QA team now would add permission complexity without clear benefit. If the organization scales or if manual testing becomes a bottleneck, this team can be introduced later without restructuring — it would slot in between Engineer and Product in review flows.

#### Admin / Operations

**Recommendation: Do not include (yet)**

An Admin team would manage system configuration, user accounts, integrations, and permissions. For an early-stage product, these responsibilities can be handled by engineers or a designated product lead. As TaskFlow grows and self-service administration becomes necessary, this team should be introduced. The permissions system (see `permissions.md`) is designed to accommodate additional teams without restructuring.

#### Leadership / Executive

**Recommendation: Do not include**

Read-only dashboards and reporting can be handled through permissions on existing teams rather than creating a separate team. An executive who needs visibility can be granted a Product role with restricted write permissions. Creating a team solely for observation adds unnecessary abstraction.
