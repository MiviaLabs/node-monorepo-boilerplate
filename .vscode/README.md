# VSCode Workspace Configuration

This directory contains VSCode workspace settings and recommended extensions for the monorepo.

## Recommended Extensions

Install recommended extensions via the Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`) or run:

```bash
code --install-extension ms-playwright.playwright
code --install-extension esbenp.prettier-vscode
code --install-extension firsttris.vscode-jest-runner
code --install-extension semgrep.semgrep
```

## Semgrep IDE Integration

The Semgrep extension provides real-time code analysis for security and documentation rules.

### Installation

1. **Install the Semgrep CLI** (required for the extension):

   ```bash
   # macOS
   brew install semgrep

   # Linux/WSL
   python3 -m pip install --user semgrep

   # Verify installation
   semgrep --version
   ```

2. **Install the VSCode Extension**:
   - Open Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`)
   - Search for "Semgrep"
   - Install `semgrep.semgrep` by Semgrep

3. **Trust the Workspace**:
   - VSCode may prompt to trust the workspace when opening
   - Click "Yes, I trust the authors" to enable extension functionality

### Configuration

The workspace is pre-configured in `settings.json`:

| Setting                      | Value                                                           | Description                            |
| ---------------------------- | --------------------------------------------------------------- | -------------------------------------- |
| `semgrep.scan.configuration` | `tools/semgrep/security.yml`, `tools/semgrep/documentation.yml` | Security and documentation rule files  |
| `semgrep.scan.autoScan`      | `true`                                                          | Scan files as you type                 |
| `semgrep.scan.onSave`        | `true`                                                          | Scan files on save                     |
| `semgrep.scan.severity`      | `["ERROR", "WARNING"]`                                          | Show both security and docs violations |

### Viewing Violations

1. **Problems Panel**: Open with `Ctrl+Shift+M` / `Cmd+Shift+M`
   - Filter by "Semgrep" to see only Semgrep findings
   - Click on a finding to navigate to the code location

2. **Inline Squiggles**: Violations appear as yellow (WARNING) or red (ERROR) underlines

3. **Hover Information**: Hover over squiggles to see the rule message and fix guidance

### Rule Categories

| Category      | Severity | Description                                 |
| ------------- | -------- | ------------------------------------------- |
| Security      | ERROR    | Critical security issues (blocks pre-push)  |
| Documentation | WARNING  | JSDoc requirements (advisory, non-blocking) |

### Documentation Rules

The following JSDoc documentation rules are enforced:

- `jsdoc-schema-requires-example` - Zod schemas need `@example` tag
- `jsdoc-function-requires-param-returns` - Functions need `@param` or `@returns`
- `jsdoc-module-requires-documentation` - Index files need `@module` or `@packageDocumentation`
- `jsdoc-validator-requires-documentation` - Validators need multi-line JSDoc

### Troubleshooting

#### Extension Not Loading Rules

1. Verify Semgrep CLI is installed: `semgrep --version`
2. Check the rules file exists: `ls tools/semgrep/security.yml`
3. Validate rules syntax: `semgrep --validate --config tools/semgrep/security.yml`
4. Reload VSCode window: `Ctrl+Shift+P` > "Developer: Reload Window"

#### No Findings Appearing

1. Ensure workspace is trusted (check status bar)
2. Check Semgrep output: View > Output > Select "Semgrep" from dropdown
3. Verify file type is supported (TypeScript files for JSDoc rules)
4. Try manual scan: `Ctrl+Shift+P` > "Semgrep: Scan Workspace"

#### Performance Issues

If real-time scanning causes lag:

1. Disable auto-scan temporarily:

   ```json
   "semgrep.scan.autoScan": false
   ```

2. Use on-save scanning only (already configured)
3. Exclude large directories in `.semgrepignore`

#### Extension Crashes or Errors

1. Check Semgrep extension logs: View > Output > "Semgrep"
2. Update extension to latest version
3. Update Semgrep CLI: `brew upgrade semgrep` or `pip install --upgrade semgrep`
4. File an issue: https://github.com/semgrep/semgrep-vscode/issues

### Manual Scanning

Run documentation checks from the terminal:

```bash
# Scan entire codebase for documentation issues
pnpm run lint:docs

# Scan specific file
semgrep scan --config tools/semgrep/documentation.yml path/to/file.ts
```

### Related Files

- `tools/semgrep/security.yml` - Security and architecture rules
- `tools/semgrep/documentation.yml` - Documentation rules only
- `.husky/pre-commit` - Advisory documentation checks on commit
- `.husky/pre-push` - Blocking security checks on push
