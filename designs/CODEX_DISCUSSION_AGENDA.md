# CodeEX Fork Discussion Agenda

**Document:** Discussion Agenda for CodeEX Development
**Owner:** Tanen Andrews, Founder/CEO - TerraTech Systems
**Created:** 2026-01-10
**Status:** SCHEDULED FOR REVIEW

---

## Purpose

This document outlines the key decisions and discussion points needed before beginning CodeEX development. CodeEX is TerraTech's custom VS Code fork with integrated AGEIXTIC capabilities.

---

## 1. Branding Design

### Decisions Needed

| Item | Options | Notes |
|------|---------|-------|
| **Name Confirmation** | ~~CodeEX, CodeX, other?~~ **CodeEX CONFIRMED** | Trademark search still needed |
| **Logo Style** | Minimal, tech, futuristic? | Consistent with TerraTech brand |
| **Color Scheme** | Dark-first? Match AGEIXTIC? | Primary/secondary/accent |
| **Icon Variations** | How many sizes? | 16x16 to 512x512 standard |

### Questions

1. Should CodeEX branding match TerraTech corporate identity or be distinct?
2. Do we need a mascot or character (like Octocat, Gopher)?
3. Light mode variant needed immediately or can wait?

### Deliverables

- [ ] Logo (SVG, PNG at multiple sizes)
- [ ] Icon set (app icon, file icons, status bar icons)
- [ ] Color palette document
- [ ] Splash screen design
- [ ] Marketing assets (optional, for later)

---

## 2. Build Infrastructure

### Decisions Needed

| Item | Options | Recommendation |
|------|---------|----------------|
| **Build System** | VSCodium scripts, custom, Electron Forge | VSCodium (proven) |
| **CI/CD** | GitHub Actions, Jenkins, GitLab CI | GitHub Actions |
| **Code Signing** | Apple Developer ($99/yr), self-signed | Apple Developer |
| **Windows Signing** | EV cert ($200+/yr), self-signed | Defer to later |
| **Auto-Update** | Electron autoUpdater, custom | Electron native |

### Questions

1. What platforms are priority? (macOS first, then Windows/Linux?)
2. Internal distribution only initially, or public from start?
3. Budget for code signing certificates?

### Deliverables

- [ ] GitHub Actions workflow for builds
- [ ] Release signing process documented
- [ ] Auto-update server configuration
- [ ] Distribution channels defined (GitHub Releases, custom CDN?)

---

## 3. Extension Architecture

### Decisions Needed

| Item | Options | Recommendation |
|------|---------|----------------|
| **AMH Integration** | Extension API, native patch | Extension first |
| **Settings Storage** | VS Code settings, separate config | VS Code settings |
| **Status Bar** | Single widget, multiple | Single expandable |
| **Notifications** | VS Code native, custom panel | Native + panel |

### Core Extensions to Bundle

| Extension | Purpose | Priority |
|-----------|---------|----------|
| **Ageixtic Core** | AMH integration, context injection | P0 |
| **Local LLM Panel** | Ollama interface, model selection | P1 |
| **Quota Manager** | RPM/TPM tracking, warnings | P1 |
| **Session Protector** | Incremental saves, recovery | P2 |
| **Search Integration** | Ageixtic-Search in command palette | P2 |

### Questions

1. Should extensions be open-source or proprietary?
2. Publish to Open VSX for general availability?
3. Extension settings schema - JSON or UI builder?

### Deliverables

- [ ] Extension API specification
- [ ] Settings schema design
- [ ] Status bar widget mockup
- [ ] Inter-extension communication protocol

---

## 4. Testing Strategy

### Decisions Needed

| Item | Options | Recommendation |
|------|---------|----------------|
| **Test Framework** | Jest, Mocha, Vitest | Vitest (fast) |
| **E2E Testing** | Playwright, Spectron | Playwright |
| **Coverage Target** | 50%, 70%, 80%? | 70% for core |
| **Manual Testing** | Internal only, beta group | Internal first |

### Test Matrix

| Platform | Version | Priority |
|----------|---------|----------|
| macOS | 13+ (Ventura+) | P0 |
| macOS | Apple Silicon | P0 |
| macOS | Intel | P1 |
| Windows | 10/11 | P2 |
| Linux | Ubuntu 22.04+ | P2 |

### Questions

1. Automated regression suite needed before v1.0?
2. Performance benchmarks (startup time, memory)?
3. Extension compatibility testing scope?

### Deliverables

- [ ] Test plan document
- [ ] CI integration for tests
- [ ] Performance baseline metrics
- [ ] Bug tracking workflow

---

## 5. Legal Review

### Decisions Needed

| Item | Status | Action |
|------|--------|--------|
| **Trademark "CodeEX"** | Unknown | Search needed |
| **VS Code License** | MIT | Compliant |
| **Marketplace Terms** | Can't use MS Marketplace | Use Open VSX |
| **Extension Licenses** | Varies | Audit needed |
| **Privacy Policy** | Not created | Draft needed |

### Questions

1. Do we need formal legal review or self-assessment sufficient?
2. GDPR/privacy implications for AMH data?
3. Open source license for CodeEX itself? (MIT, Apache, proprietary?)

### Deliverables

- [ ] Trademark clearance confirmation
- [ ] License compliance checklist
- [ ] Privacy policy draft
- [ ] Terms of service (if distributing publicly)
- [ ] Third-party attribution file

---

## 6. Release Planning

### Decisions Needed

| Phase | Audience | Timeline | Features |
|-------|----------|----------|----------|
| **Alpha** | TerraTech only | ? | Core build, basic extensions |
| **Beta** | Invited testers | ? | Full extension suite |
| **v1.0** | Public | ? | Stable, documented |

### Questions

1. What's the MVP feature set for internal alpha?
2. Beta program - how many external testers?
3. Support model - community, paid, hybrid?
4. Update cadence - weekly, monthly, with VS Code releases?

### Deliverables

- [ ] Release criteria document
- [ ] Versioning scheme (semver?)
- [ ] Changelog format
- [ ] Support/maintenance plan
- [ ] Deprecation policy

---

## 7. Resource Allocation

### Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1: Build Scripts | 8-16 hours | VSCodium reference |
| Phase 2: Branding | 4-8 hours | Design decisions |
| Phase 3: Core Extensions | 24-40 hours | API design |
| Phase 4: Testing | 16-24 hours | Extensions complete |
| Phase 5: Documentation | 8-16 hours | All features stable |

### Questions

1. Who is responsible for each phase?
2. External contractors for design/branding?
3. Timeline expectations - weeks or months?

---

## Summary: Key Decisions Needed

### Immediate (Before Starting)

1. ~~**Name confirmation** - CodeEX approved?~~ **CONFIRMED**
2. ~~**Platform priority** - macOS first?~~ **macOS FIRST (HIGH PRIORITY)**
3. ~~**Distribution model** - Internal only initially?~~ **BOTH INTERNAL AND EXTERNAL**
4. ~~**License choice** - Open source or proprietary?~~ **OPEN SOURCE (PER SOP)**

### Before Alpha

5. **Branding assets** - Logo, icons, colors
6. **Build pipeline** - CI/CD working
7. **Core extension** - AMH integration functional

### Before Beta

8. **Test coverage** - 70% target met
9. **Legal clearance** - Trademark, licenses verified
10. **Documentation** - User guide draft

---

## Next Steps

1. [ ] Review this agenda
2. [ ] Schedule dedicated discussion session
3. [ ] Make key decisions (name, license, platform priority)
4. [ ] Begin Phase 1 (build scripts) after decisions made

---

*This document was generated by GIXSIS as part of the AGEIXTIC Project planning process.*
