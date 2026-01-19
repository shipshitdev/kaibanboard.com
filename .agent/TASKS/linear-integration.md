## Task: Linear Integration

**ID:** task-linear-integration
**Label:** Linear Integration
**Description:** Sync tasks with Linear for teams using Linear as their project management tool.
**Type:** Feature
**Status:** To Do
**Priority:** Medium
**Created:** 2026-01-15
**Updated:** 2026-01-15
**PRD:** [Link](../PRDS/linear-integration.md)
**Order:** 9

---

## Details

### Scope

1. **Issue Import**: Linear issues to Kaiban tasks
2. **Status Sync**: Bidirectional status updates
3. **Issue Creation**: Create Linear issues from tasks
4. **Configuration**: API key, status mapping

### Key Deliverables

- [ ] Linear API integration (@linear/sdk)
- [ ] Import command
- [ ] Status sync logic
- [ ] Push to Linear command
- [ ] Secure API key storage

### Status Mapping

```typescript
const statusMapping = {
  'To Do': 'unstarted',
  'Doing': 'started',
  'Done': 'completed'
};
```

### Task Metadata

```markdown
**Linear:** https://linear.app/team/issue/ENG-123
**LinearID:** ENG-123
```

### Success Criteria

- Import issues from Linear
- Status changes sync to Linear
- Create Linear issue from task
- Works offline (sync on demand)
