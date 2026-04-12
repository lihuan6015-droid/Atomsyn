# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email **atomsyn@proton.me** with details
3. Include steps to reproduce if possible
4. We will respond within 72 hours

## Scope

Atomsyn is a local-first desktop application. Security concerns include:

- Local file access beyond the data directory
- Potential code injection via malicious JSON data files
- CLI command injection vulnerabilities
- Dependencies with known vulnerabilities

## Data Privacy

Atomsyn stores all data locally. No telemetry, no cloud sync, no external API calls
(except optional user-configured LLM providers). API keys are stored only in
browser localStorage and never written to disk files.
