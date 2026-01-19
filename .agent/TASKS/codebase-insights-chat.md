## Task: Codebase Insights Chat

**ID:** task-codebase-insights
**Label:** Codebase Insights Chat
**Description:** Chat interface for exploring and understanding the codebase with natural language queries and contextual answers.
**Type:** Feature
**Status:** To Do
**Priority:** Medium
**Created:** 2026-01-15
**Updated:** 2026-01-15
**PRD:** [Link](../PRDS/codebase-insights-chat.md)
**Order:** 7

---

## Details

### Scope

1. **Chat Interface**: VS Code sidebar/webview panel
2. **Codebase Indexing**: Semantic search over code
3. **Query Types**: What, where, how questions
4. **References**: Clickable file/line links

### Key Deliverables

- [ ] Code indexing service
- [ ] Chat panel UI
- [ ] Query processing logic
- [ ] File reference linking
- [ ] CLI `kai ask` command

### Query Examples

- "How does authentication work?"
- "Where is the user service defined?"
- "What files use the TaskParser?"
- "What's the architecture of this project?"

### Technical Notes

- Index on extension activation
- Incremental re-indexing on file changes
- Use embeddings for semantic search (optional)

### Success Criteria

- Chat interface available
- Questions answered with file references
- References clickable to open editor
- Response time < 5 seconds
