# YTM

<div align="center">

**A lightweight, enhanced YouTube Music desktop client with ad-blocking, refined controls, and native desktop integration.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub release (latest by date)](https://img.shields.io/github/v/release/MosesCommitsFraud/YTM)](https://github.com/MosesCommitsFraud/YTM/releases)
[![GitHub all releases](https://img.shields.io/github/downloads/MosesCommitsFraud/YTM/total)](https://github.com/MosesCommitsFraud/YTM/releases)
[![GitHub issues](https://img.shields.io/github/issues/MosesCommitsFraud/YTM)](https://github.com/MosesCommitsFraud/YTM/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/MosesCommitsFraud/YTM)](https://github.com/MosesCommitsFraud/YTM/pulls)
[![GitHub stars](https://img.shields.io/github/stars/MosesCommitsFraud/YTM)](https://github.com/MosesCommitsFraud/YTM/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/MosesCommitsFraud/YTM)](https://github.com/MosesCommitsFraud/YTM/network)

[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-0078D6?logo=windows)](https://github.com/MosesCommitsFraud/YTM/releases)
[![Platform: macOS](https://img.shields.io/badge/Platform-macOS-000000?logo=apple)](https://github.com/MosesCommitsFraud/YTM/releases)
[![Platform: Linux](https://img.shields.io/badge/Platform-Linux-FCC624?logo=linux&logoColor=black)](https://github.com/MosesCommitsFraud/YTM/releases)

[![Built with Electron](https://img.shields.io/badge/Built_with-Electron-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Made with pnpm](https://img.shields.io/badge/Made_with-pnpm-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![GitHub commit activity](https://img.shields.io/github/commit-activity/m/MosesCommitsFraud/YTM)](https://github.com/MosesCommitsFraud/YTM/commits)
[![GitHub last commit](https://img.shields.io/github/last-commit/MosesCommitsFraud/YTM)](https://github.com/MosesCommitsFraud/YTM/commits)

[Download Latest Release](https://github.com/MosesCommitsFraud/YTM/releases/latest) • [View All Releases](https://github.com/MosesCommitsFraud/YTM/releases) • [Report Issue](https://github.com/MosesCommitsFraud/YTM/issues/new) • [Request Feature](https://github.com/MosesCommitsFraud/YTM/issues/new)

</div>

---

## Overview

YTM is a custom YouTube Music desktop client designed to provide an enhanced listening experience with built-in ad-blocking, streamlined controls, and a clean native interface. Built with modern web technologies, YTM delivers a lightweight alternative to browser-based YouTube Music playback.

### Core Features

**Ad-Free Listening**
- Built-in ad blocker eliminates interruptions
- Privacy-focused with no tracking

**Custom Desktop Interface**
- Tailored design optimized for desktop music listening
- Native window controls and system integration
- Cleaner, more focused UI compared to web player

**Enhanced Music Controls**
- More responsive and intuitive playback controls
- Improved keyboard shortcuts
- Better queue management

**Lightweight Performance**
- Minimal resource footprint
- Fast startup times
- Efficient memory usage

---

## Installation

### Pre-built Binaries

Download the latest version for your platform from the [Releases page](https://github.com/MosesCommitsFraud/YTM/releases).

#### Windows
- Download the `.exe` installer or portable `.zip` package
- Run the installer or extract and run the portable version
- Windows 10/11 recommended

#### macOS
- Download the `.dmg` disk image
- Drag YTM to your Applications folder
- macOS 10.13 (High Sierra) or later

#### Linux
- Download `.AppImage`, `.deb`, or `.rpm` package
- AppImage: Make executable and run
- Debian/Ubuntu: `sudo dpkg -i ytm_*.deb`
- Fedora/RHEL: `sudo rpm -i ytm_*.rpm`

---

## Plugins & Extensibility

YTM supports a plugin architecture for extending functionality and customization.

### Available Plugins

Plugin documentation and available extensions will be listed here as they become available.

### Plugin Development

Interested in developing plugins for YTM? Check the plugin development documentation for:
- Plugin API reference
- Development guidelines
- Example plugins
- Contribution process

---

## Platform Support

| Platform | Status | Architecture | Package Format |
|----------|--------|--------------|----------------|
| Windows 10/11 | ✅ Supported | x64, ARM64 | `.exe`, `.zip` |
| Linux (Ubuntu/Debian) | ✅ Supported | x64, ARM64 | `.deb`, `.AppImage` |
| Linux (Fedora/RHEL) | ✅ Supported | x64, ARM64 | `.rpm`, `.AppImage` |

---

## Building from Source

For developers wanting to build from source or contribute to development:

```bash
# Clone repository
git clone https://github.com/MosesCommitsFraud/YTM.git
cd YTM

# Install dependencies
pnpm install

# Development mode
pnpm dev

# Production build
pnpm build
pnpm start
```

**Requirements:**
- Node.js 16+ 
- pnpm package manager

---

## Contributing

Contributions are welcome and encouraged. Please follow these guidelines:

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/feature-name`
3. Commit changes with clear messages
4. Push to your fork: `git push origin feat/feature-name`
5. Open a Pull Request with detailed description

### Commit Convention

Follow conventional commits for consistency:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation updates
- `style:` Code style changes
- `refactor:` Code refactoring
- `test:` Test additions/updates
- `chore:` Maintenance tasks

### Code Style

- Follow existing code patterns
- Write clear, self-documenting code
- Add comments for complex logic
- Test thoroughly before submitting

---

## Roadmap

**In Development**
- [ ] Better Searchbar
- [ ] Additional platform package formats
- [ ] Expanded plugin API
- [ ] Advanced playback features

**Planned Features**
- [ ] Custom Media Controls
- [ ] Custom keyboard shortcuts
- [ ] Discord Rich Presence integration
- [ ] Downloading Songs

---

## Support & Feedback

### Bug Reports

Found a bug? Please create a detailed issue:
- Operating system and version
- Application version
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

### Feature Requests

Have an idea? Open a feature request with:
- Clear description of proposed feature
- Use cases and benefits
- Implementation suggestions (optional)

### Community

- **Issues:** [GitHub Issues](https://github.com/MosesCommitsFraud/YTM/issues)
- **Discussions:** Use GitHub Discussions for questions and community interaction

---

## Technical Stack

- **Framework:** Electron
- **Language:** JavaScript/TypeScript
- **Package Manager:** pnpm
- **Build Tool:** electron-builder
- **Testing:** [Framework TBD]

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

### Third-Party Licenses

YTM incorporates several open-source libraries and components. Full attribution and licenses can be found in the application's About section.

---

## Disclaimer

YTM is an unofficial, third-party desktop client for YouTube Music. This project is not affiliated with, endorsed by, sponsored by, or in any way associated with YouTube, Google LLC, or Alphabet Inc.

- YouTube and YouTube Music are trademarks of Google LLC
- This application uses the publicly available YouTube Music web interface
- All trademarks belong to their respective owners

**Users are responsible for ensuring their use complies with YouTube's Terms of Service.**

---

<div align="center">

**[Download](https://github.com/MosesCommitsFraud/YTM/releases) • [Documentation](https://github.com/MosesCommitsFraud/YTM/wiki) • [Issues](https://github.com/MosesCommitsFraud/YTM/issues)**

Made with ❤️ (i literally just wanted a desktop app)

</div>
