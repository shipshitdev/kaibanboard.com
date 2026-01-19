## Task: Dynamic Command Allowlist

**ID:** task-command-allowlist
**Label:** Dynamic Command Allowlist
**Description:** Security layer that generates permitted commands based on detected project stack, reducing attack surface for AI agent execution.
**Type:** Feature
**Status:** To Do
**Priority:** Low
**Created:** 2026-01-15
**Updated:** 2026-01-15
**PRD:** [Link](../PRDS/dynamic-command-allowlist.md)
**Order:** 11

---

## Details

### Scope

1. **Stack Detection**: Node.js, Python, Go, Rust, etc.
2. **Allowlist Generation**: Stack-specific commands
3. **Command Validation**: Block unauthorized commands
4. **Override System**: User approval for blocked commands
5. **Audit Logging**: Track all command execution

### Key Deliverables

- [ ] Stack detection service
- [ ] Command allowlist structure
- [ ] Validation middleware
- [ ] Override UI/flow
- [ ] Audit log export

### Stack Detection

```typescript
const stackIndicators = {
  nodejs: ['package.json'],
  python: ['requirements.txt'],
  go: ['go.mod'],
  rust: ['Cargo.toml']
};
```

### Allowlist Example

```typescript
const nodejsAllowlist = [
  'npm', 'npx', 'yarn', 'pnpm', 'bun', 'node', 'tsc'
];

const denylist = [
  'rm -rf /', 'sudo', 'chmod 777'
];
```

### Success Criteria

- Detect project stacks
- Allow stack-specific commands
- Block dangerous commands
- User can override with approval
