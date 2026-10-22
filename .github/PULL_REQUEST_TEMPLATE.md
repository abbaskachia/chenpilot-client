## Summary of Changes
Provide a brief summary of what this PR changes and why.

## Linked Issues
Closes #

## Type of Change
- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 🧹 Refactoring / Code Quality Improvement
- [ ] 📚 Documentation / ADR update

## Verification & Testing
Describe the tests and manual verification performed to ensure changes work as expected:
- [ ] Ran linting checks: `pnpm lint`
- [ ] Ran unit/integration tests: `pnpm test`
- [ ] Ran build verification: `pnpm build`

## Screenshots / Visual Demonstrations
*If this PR modifies UI components or layouts, please attach relevant screenshots or screen recordings below.*

## For User-Impacting Changes
- [ ] **Transaction Safety**: Changes to async operations or state updates handle errors gracefully and prevent data loss.
- [ ] **Data Persistence**: Any persisted data changes are tested and backward-compatible with existing storage.
- [ ] **API Compatibility**: Backend API contract requirements are documented (see `docs/API_CONTRACT.md`). Include secret handling notes if applicable.
- [ ] **Accessibility**: UI changes follow WCAG guidelines and are tested with keyboard navigation / screen readers where applicable.

## Checklist
- [ ] My code follows the code style and guidelines of this project.
- [ ] I have performed a self-review of my own code.
- [ ] I have commented my code, particularly in hard-to-understand areas, adding TSDoc where appropriate.
- [ ] Tests added or updated for the changed behavior (not required for documentation-only changes).
- [ ] If this PR introduces cross-cutting architectural changes, I have included a new ADR in `docs/adr/`.
