# Permissions

Permissions in TaskFlow control which teams can perform which actions on which task flows. The model is **role-based** (tied to team membership) with **per-flow granularity**.

---

## Permission Actions

Each permission grants the ability to perform a specific type of action:

| Action | Description |
|--------|-------------|
| **Create** | Initiate a new task in a given flow |
| **View** | Read task details, history, and comments |
| **Comment** | Add comments or notes to a task |
| **Transition** | Move a task from one status to another |
| **Edit** | Modify task metadata (title, description, priority, assignee, etc.) |
| **Assign** | Assign or reassign a task to a team member or agent |
| **Delete** | Remove a task (soft delete — archived, not destroyed) |
| **Admin** | Manage flow configuration, custom fields, and integration settings |

---

## Permission Matrix by Team and Flow

### Bug Flow

| Action | Engineer | Product | User | Agent |
|--------|----------|---------|------|-------|
| **Create** | Yes | Yes | Yes | Yes |
| **View** | All | All | Own + Public | Assigned |
| **Comment** | Yes | Yes | Own | Assigned |
| **Transition** | Yes (all) | Triage only | No | Triage, Investigate, Validate |
| **Edit** | Yes | Priority + Severity | No | Investigation fields |
| **Assign** | Yes | Yes | No | No |
| **Delete** | Yes | Yes | No | No |

### Feature Flow

| Action | Engineer | Product | User | Agent |
|--------|----------|---------|------|-------|
| **Create** | Yes | Yes | Yes (as request) | No |
| **View** | All | All | Own + Public | Assigned |
| **Comment** | Yes | Yes | Own | Assigned |
| **Transition** | Implement, Validate | Discuss, Design, Review, Closed | No | Prototype, Implement, Validate |
| **Edit** | Technical fields | All | Description only | Implementation fields |
| **Assign** | Yes | Yes | No | No |
| **Delete** | No | Yes | No | No |

### Improvement Flow

| Action | Engineer | Product | User | Agent |
|--------|----------|---------|------|-------|
| **Create** | Yes | No | No | Yes |
| **View** | All | All | No | Assigned |
| **Comment** | Yes | Yes | No | Assigned |
| **Transition** | Yes (all) | No | No | Implement, Validate |
| **Edit** | Yes | No | No | Implementation fields |
| **Assign** | Yes | No | No | No |
| **Delete** | Yes | No | No | No |

---

## Transition Permissions (Detail)

Not all team members can trigger all transitions. This table specifies which teams can move tasks into each status.

### Bug Flow Transitions

| Transition | Allowed By |
|------------|------------|
| → Triage | Engineer, Product, User (on create), Agent |
| → Investigate | Engineer, Agent |
| → Approve | Agent (surfaces to Engineer) |
| → Resolve | Engineer |
| → Validate | Engineer, Agent |
| → Closed (from any status) | Engineer, Product (with required `resolution` and status change note) |

### Feature Flow Transitions

| Transition | Allowed By |
|------------|------------|
| → Discuss | Product, User (on create as request) |
| → Design | Product |
| → Prototype | Engineer, Agent |
| → Implement | Engineer |
| → Validate | Engineer, Agent |
| → Review | Engineer (surfaces to Product) |
| → Closed (from any status) | Product, Engineer (with required `resolution` and status change note) |

### Improvement Flow Transitions

| Transition | Allowed By |
|------------|------------|
| → Propose | Engineer, Agent |
| → Approve | Engineer |
| → Implement | Engineer |
| → Validate | Engineer, Agent |
| → Closed (from any status) | Engineer (with required `resolution` and status change note) |

**Note:** All transitions require a status change note. Closing transitions additionally require a `resolution` value. See [taskflows.md](taskflows.md#status-change-notes) for details.

---

## Scope Rules

Permissions operate within a **scope** that determines which tasks a team member can access:

- **All**: Can view/act on any task in the flow.
- **Assigned**: Can only view/act on tasks explicitly assigned to them.
- **Own**: Can only view/act on tasks they created.
- **Public**: Can view tasks marked as publicly visible.

Scope is indicated in the matrices above where relevant (e.g., User View = "Own + Public").

---

## API Permissions

API access follows the same permission model. API tokens are issued per-user and inherit the user's team-level permissions. Agent API tokens are scoped to the Agent team.

See [api.md](api.md) for endpoint-level permission requirements.

---

## Future Considerations

- **Per-project permissions**: If TaskFlow supports multiple projects, permissions may need project-level scoping.
- **Custom roles**: If teams need finer-grained distinctions (e.g., Senior Engineer vs. Junior Engineer), a role layer within teams may be warranted.
- **Admin team**: If introduced (see [teams.md](teams.md)), Admin would have full permissions across all flows plus system configuration access.
