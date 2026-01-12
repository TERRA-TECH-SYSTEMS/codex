# The Ageixtic Project: CodeEX Fork Plan
## VS Code Fork with Ageixtic Integration
### Version 1.0.0 - 2026-01-10

---

## Executive Summary

CodeEX is TerraTech's customized VS Code fork with built-in Ageixtic AI protections, local LLM support, and memory hierarchy integration. This document outlines the fork strategy, technical requirements, and implementation plan.

---

## VS Code Open Source Landscape

### Three Variants

| Variant | License | Telemetry | Marketplace | Source |
|---------|---------|-----------|-------------|--------|
| **Code-OSS** | MIT | None | None | github.com/microsoft/vscode |
| **VS Code** | Microsoft Proprietary | Enabled | Microsoft Marketplace | code.visualstudio.com |
| **VSCodium** | MIT | Disabled | Open VSX | github.com/VSCodium/vscodium |

### What Microsoft Adds (Proprietary)

- Custom `product.json` with telemetry endpoints
- Microsoft branding and logos
- Access to Microsoft Visual Studio Marketplace
- Telemetry and crash reporting
- Proprietary extensions (C/C++, C# Dev Kit, Live Share, Remote Dev)

---

## Licensing Analysis

### What We CAN Do

| Action | Status |
|--------|--------|
| Fork the source code | Allowed (MIT) |
| Create commercial product | Allowed |
| Redistribute binaries | Allowed |
| Modify any source code | Allowed |
| Add custom features | Allowed |
| Bundle custom extensions | Allowed |

### What We CANNOT Do

| Restriction | Reason |
|-------------|--------|
| Use "VS Code" or "Visual Studio Code" name | Trademark |
| Use Microsoft's logos/icons | Trademark |
| Access Microsoft Marketplace | Terms prohibit non-Microsoft products |
| Use proprietary extensions (C/C++, Live Share) | License restricts to Microsoft products |
| Claim Microsoft affiliation | Trademark/legal |

### April 2025 Enforcement Note

Microsoft began actively enforcing licensing on C/C++ extension (v1.24.5+), blocking it from forks like VSCodium and Cursor. This affects any fork - must use community alternatives.

---

## Fork Strategy Options

### Option A: VSCodium-Style Build Scripts (RECOMMENDED for Phase 1)

**Approach:** Scripts that build Microsoft's source without proprietary additions

```
microsoft/vscode (upstream)
        │
        ▼
  CodeEX Build Scripts
        │
        ├── Remove telemetry
        ├── Apply CodeEX branding
        ├── Configure Open VSX
        └── Bundle Ageixtic extensions
        │
        ▼
   CodeEX Binary
```

| Pros | Cons |
|------|------|
| Low maintenance | Cannot modify core architecture |
| Tracks upstream automatically | Limited deep AI integration |
| Community-tested approach | Still dependent on Microsoft's pace |
| Faster time to market | Extensions-based customization only |

### Option B: Full Fork (Phase 2)

**Approach:** Fork microsoft/vscode, modify core for deep AI integration

| Pros | Cons |
|------|------|
| Full control over core | High maintenance burden |
| Deep AI integration possible | Must track upstream manually |
| Unique features possible | Risk of breaking changes |
| Complete independence | Requires dedicated team |

### Option C: Eclipse Theia (Alternative)

**Approach:** Build on Theia platform instead of VS Code

| Pros | Cons |
|------|------|
| True independence | Less familiar UX |
| Modular architecture | Smaller ecosystem |
| Already has Claude Code integration | Different extension format |
| Vendor-neutral | Learning curve |

**Recommendation:** Start with Option A, evaluate Option B after 6 months.

---

## Technical Requirements

### Build System

| Requirement | Specification |
|-------------|---------------|
| Node.js | >= 20.x (x64 or ARM64) |
| Python | Required for node-gyp |
| RAM | 8 GB minimum |
| CPU | 4+ cores recommended |
| Disk | 10 GB free minimum |
| Path | NO spaces in path |

### macOS Specific

```bash
xcode-select --install
brew install node python
```

### Linux Specific

```bash
apt install build-essential g++ libx11-dev libxkbfile-dev libsecret-1-dev
```

---

## CodeEX Architecture

### Branding Requirements

| Element | CodeEX Value |
|---------|--------------|
| Product Name | CodeEX |
| Full Name | CodeEX - Ageixtic IDE |
| Organization | TerraTech Systems |
| Application ID | ai.terratech.codex |
| Icon | Custom (must be original) |
| Marketplace | Open VSX + Self-hosted |

### Custom product.json

```json
{
  "nameShort": "CodeEX",
  "nameLong": "CodeEX - Ageixtic IDE",
  "applicationName": "codex",
  "dataFolderName": ".codex",
  "win32MutexName": "codex",
  "licenseName": "MIT",
  "licenseUrl": "https://github.com/TERRA-TECH-SYSTEMS/codex/blob/main/LICENSE",
  "serverApplicationName": "codex-server",
  "serverDataFolderName": ".codex-server",
  "tunnelApplicationName": "codex-tunnel",
  "urlProtocol": "codex",
  "webviewContentExternalBaseUrlTemplate": "https://{{uuid}}.codex-webview.net/",
  "extensionsGallery": {
    "serviceUrl": "https://open-vsx.org/vscode/gallery",
    "itemUrl": "https://open-vsx.org/vscode/item",
    "resourceUrlTemplate": "https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}",
    "controlUrl": "",
    "nlsBaseUrl": "",
    "publisherUrl": ""
  },
  "linkProtectionTrustedDomains": [
    "https://open-vsx.org",
    "https://*.terratech.systems"
  ],
  "reportIssueUrl": "https://github.com/TERRA-TECH-SYSTEMS/codex/issues",
  "quality": "stable",
  "enableTelemetry": false
}
```

---

## Built-in Ageixtic Features

### Status Bar Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CodeEX                                                                   │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│  [Editor Pane]                              [AMH Memory Panel]          │
│                                              ├── Recent Facts           │
│                                              ├── Session History        │
│                                              └── Search Memories        │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│ Status: RPM 32/50 │ TPM 45K/100K │ Cache 18% │ Local: ● │ AMH: ●       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Bundled Extensions

| Extension | Purpose | Source |
|-----------|---------|--------|
| **Ageixtic Core** | AMH integration, triggers | Custom (bundled) |
| **Local LLM Panel** | Ollama model management | Custom (bundled) |
| **Quota Manager** | RPM/TPM tracking | Custom (bundled) |
| **Session Protector** | Incremental saves | Custom (bundled) |
| **Response Cache** | Semantic caching | Custom (bundled) |

### Default Settings

```json
{
  "codex.ageixtic.enabled": true,
  "codex.ageixtic.apiUrl": "http://162.250.127.70:8100",
  "codex.localLlm.enabled": true,
  "codex.localLlm.ollamaUrl": "http://localhost:11434",
  "codex.quotaManager.enabled": true,
  "codex.quotaManager.rpmWarning": 40,
  "codex.quotaManager.tpmWarning": 80000,
  "codex.sessionProtector.enabled": true,
  "codex.sessionProtector.idleThreshold": 30,
  "codex.responseCache.enabled": true,
  "codex.responseCache.similarityThreshold": 0.92,
  "telemetry.telemetryLevel": "off"
}
```

---

## Extension Marketplace Strategy

### Primary: Open VSX

- Free, open, vendor-neutral
- Most VS Code extensions available
- No Microsoft proprietary extensions

### Secondary: Self-Hosted (Coder code-marketplace)

For internal/proprietary extensions:

```yaml
# docker-compose.yml for self-hosted marketplace
services:
  codex-marketplace:
    image: ghcr.io/coder/code-marketplace:latest
    ports:
      - "8080:8080"
    volumes:
      - ./extensions:/extensions
    environment:
      - EXTENSIONS_DIR=/extensions
```

### Extension Compatibility

| Category | Status | Alternative |
|----------|--------|-------------|
| Community extensions | Compatible | Open VSX |
| Language servers | Compatible | Open VSX |
| Microsoft C/C++ | NOT compatible | clangd (llvm-vs-code-extensions.vscode-clangd) |
| Microsoft C# | NOT compatible | OmniSharp or C# Dev Kit alternatives |
| Microsoft Live Share | NOT compatible | No direct alternative |
| Microsoft Remote Dev | NOT compatible | Open Remote - SSH |

---

## Implementation Phases

### Phase 1: Build Scripts (Weeks 1-2)

| Task | Description |
|------|-------------|
| 1.1 | Fork VSCodium build scripts |
| 1.2 | Create CodeEX product.json |
| 1.3 | Design custom icons/branding |
| 1.4 | Configure Open VSX marketplace |
| 1.5 | Set up GitHub Actions CI/CD |
| 1.6 | Build first binary (macOS) |

### Phase 2: Core Extensions (Weeks 3-4)

| Task | Description |
|------|-------------|
| 2.1 | Build Ageixtic Core extension |
| 2.2 | Build Local LLM Panel extension |
| 2.3 | Build Quota Manager extension |
| 2.4 | Build Session Protector extension |
| 2.5 | Bundle extensions in build |
| 2.6 | Test end-to-end workflow |

### Phase 3: Integration (Weeks 5-6)

| Task | Description |
|------|-------------|
| 3.1 | Status bar integration |
| 3.2 | Notification system |
| 3.3 | Settings UI panels |
| 3.4 | AMH sidebar panel |
| 3.5 | Cross-platform builds (Win, Linux) |
| 3.6 | Auto-update system |

### Phase 4: Deep Fork (Future)

| Task | Description |
|------|-------------|
| 4.1 | Fork vscode source directly |
| 4.2 | Modify editor core for AI |
| 4.3 | Add native AMH support |
| 4.4 | Custom model routing in core |
| 4.5 | Offline-first architecture |

---

## Repository Structure

```
TERRA-TECH-SYSTEMS/codex/
├── build/                    # Build scripts (forked from VSCodium)
│   ├── build.sh
│   ├── check_tags.sh
│   └── linux/
│       └── build.sh
├── branding/                 # Custom branding assets
│   ├── icons/
│   │   ├── codex.icns       # macOS
│   │   ├── codex.ico        # Windows
│   │   └── codex.png        # Linux
│   └── logos/
│       └── codex-logo.svg
├── patches/                  # Patches applied to upstream
│   ├── product.json.patch
│   └── telemetry-disable.patch
├── extensions/               # Bundled Ageixtic extensions
│   ├── ageixtic-core/
│   ├── local-llm-panel/
│   ├── quota-manager/
│   └── session-protector/
├── docs/
│   └── BUILDING.md
├── .github/
│   └── workflows/
│       └── build.yml
├── product.json              # CodeEX product configuration
├── LICENSE                   # MIT
└── README.md
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Build time | < 30 min | CI/CD |
| Binary size | < 200 MB | Release |
| Startup time | < 3 sec | Benchmark |
| Extension compatibility | > 95% | Testing |
| Throttle events | 0 | User reports |
| Memory usage | < 500 MB idle | Monitoring |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Microsoft changes licensing | High | Legal review, Theia backup plan |
| Upstream breaking changes | Medium | Pin versions, test before merge |
| Extension incompatibility | Medium | Test matrix, fallback extensions |
| Build system changes | Low | Monitor VSCodium for solutions |
| Community adoption | Low | Internal use first, then public |

---

## Competitive Analysis

### Cursor

- $9.9B valuation (2025)
- Full fork with deep AI integration
- Hit by Microsoft extension blocking
- Multi-LLM support (GPT-4, Claude, Gemini)

**Learn from:** AI integration patterns, multi-model support

### Windsurf (Codeium)

- "Cascade" multi-step AI workflow
- Deep contextual awareness
- Also offers VS Code plugin

**Learn from:** Cascade's agentic workflow design

### VSCodium

- Community-maintained
- Build scripts approach
- Open VSX marketplace

**Learn from:** Build automation, telemetry removal

---

## Timeline

```
Week 1-2:  Build Scripts & Branding
           ├── Fork VSCodium scripts
           ├── Create product.json
           └── First macOS build

Week 3-4:  Core Extensions
           ├── Ageixtic Core
           ├── Local LLM Panel
           └── Quota Manager

Week 5-6:  Integration & Polish
           ├── Status bar
           ├── Notifications
           └── Cross-platform builds

Week 7+:   Release & Iterate
           ├── Internal release
           ├── Gather feedback
           └── Plan Phase 4 (deep fork)
```

---

## Next Steps

1. **Create GitHub repo:** TERRA-TECH-SYSTEMS/codex
2. **Fork VSCodium build scripts**
3. **Design CodeEX icons/branding**
4. **Write Ageixtic Core extension**
5. **Set up CI/CD pipeline**

---

## References

- [microsoft/vscode](https://github.com/microsoft/vscode) - Source repository
- [VSCodium/vscodium](https://github.com/VSCodium/vscodium) - Build scripts
- [Open VSX](https://open-vsx.org) - Extension marketplace
- [Coder code-marketplace](https://github.com/coder/code-marketplace) - Self-hosted marketplace
- [VS Code Brand Guidelines](https://code.visualstudio.com/brand) - Trademark info

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-10 | Claude | Initial fork plan |

