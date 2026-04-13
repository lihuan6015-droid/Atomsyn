// Atomsyn V1.5 · Tauri backend
//
// Exposes a small command surface for the frontend to resolve the data
// directory (B3 strategy: env var → user config → platform default) and
// to seed bundled read-only content into the user data dir on first run.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
struct AtomsynConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    data_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    skill_paths: Option<Vec<String>>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct DataDirInfo {
    path: String,
    source: String, // "env" | "config" | "default"
    exists: bool,
    created: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct InitStepResult {
    step: String,   // "data-dir" | "frameworks" | "methodology-atoms" | "skill-check"
    status: String, // "ok" | "skipped" | "error"
    detail: String,
    counts: Option<serde_json::Value>,
}

fn config_file_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .home_dir()
        .ok()
        .map(|h| h.join(".atomsyn-config.json"))
}

fn read_config(app: &AppHandle) -> Option<AtomsynConfig> {
    let path = config_file_path(app)?;
    let content = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

fn ensure_dir(path: &PathBuf) -> Result<bool, String> {
    if path.exists() {
        Ok(false)
    } else {
        fs::create_dir_all(path)
            .map_err(|e| format!("mkdir failed for {}: {}", path.display(), e))?;
        Ok(true)
    }
}

/// Shared resolution of the data directory. Returns (path, source) where
/// source is one of "env" | "config" | "default". Ensures the directory
/// exists for the config/default branches.
///
/// IMPORTANT · V1.5 path unification: this MUST match the resolver in
/// `vite.config.ts` and `scripts/atomsyn-cli.mjs` exactly, or the GUI will
/// read from a different directory than the CLI writes to. Tauri's
/// `app.path().app_data_dir()` auto-prepends the bundle identifier
/// (`com.atomsyn.app`), which would produce
/// `~/Library/Application Support/com.atomsyn.app/atomsyn`.
/// Vite and atomsyn-cli use the raw platform Application Support directory
/// and join `atomsyn` directly, so we do the same here.
fn resolve_data_dir(app: &AppHandle) -> Result<(PathBuf, String), String> {
    // 1. Env var override (dev mode)
    if let Ok(env_path) = std::env::var("ATOMSYN_DEV_DATA_DIR") {
        return Ok((PathBuf::from(env_path), "env".into()));
    }

    // 2. User config
    if let Some(cfg) = read_config(app) {
        if let Some(dir) = cfg.data_dir {
            let pb = PathBuf::from(&dir);
            ensure_dir(&pb)?;
            return Ok((pb, "config".into()));
        }
    }

    // 3. Platform default — constructed manually to match vite/atomsyn-cli.
    let home = app
        .path()
        .home_dir()
        .map_err(|e| format!("home_dir unavailable: {}", e))?;
    let dir = if cfg!(target_os = "macos") {
        home.join("Library").join("Application Support").join("atomsyn")
    } else if cfg!(target_os = "windows") {
        // %APPDATA% = C:\Users\<name>\AppData\Roaming
        match std::env::var("APPDATA") {
            Ok(v) => PathBuf::from(v).join("atomsyn"),
            Err(_) => home.join("AppData").join("Roaming").join("atomsyn"),
        }
    } else {
        // Linux / BSD — XDG data dir
        home.join(".local").join("share").join("atomsyn")
    };
    ensure_dir(&dir)?;
    Ok((dir, "default".into()))
}

/// Resolve the Atomsyn data directory.
///
/// Resolution order:
/// 1. `ATOMSYN_DEV_DATA_DIR` environment variable (dev override)
/// 2. `~/.atomsyn-config.json` → `dataDir` field
/// 3. Platform `app_data_dir()/atomsyn/`
#[tauri::command]
fn get_data_dir(app: AppHandle) -> Result<DataDirInfo, String> {
    // Preserve the original behavior: env-var mode must NOT auto-create
    // (the directory is assumed to already exist as the project source tree)
    // and must report `exists` based on a live fs check.
    if let Ok(env_path) = std::env::var("ATOMSYN_DEV_DATA_DIR") {
        let pb = PathBuf::from(&env_path);
        return Ok(DataDirInfo {
            path: env_path,
            source: "env".into(),
            exists: pb.is_dir(),
            created: false,
        });
    }

    // Config branch: we need to know whether the directory was freshly created.
    if let Some(cfg) = read_config(&app) {
        if let Some(dir) = cfg.data_dir {
            let pb = PathBuf::from(&dir);
            let created = ensure_dir(&pb)?;
            return Ok(DataDirInfo {
                path: dir,
                source: "config".into(),
                exists: true,
                created,
            });
        }
    }

    // Use the same unified resolver as the rest of the app so GUI and CLI
    // never drift. See resolve_data_dir for why we avoid app_data_dir().
    let home = app
        .path()
        .home_dir()
        .map_err(|e| format!("home_dir unavailable: {}", e))?;
    let dir = if cfg!(target_os = "macos") {
        home.join("Library").join("Application Support").join("atomsyn")
    } else if cfg!(target_os = "windows") {
        match std::env::var("APPDATA") {
            Ok(v) => PathBuf::from(v).join("atomsyn"),
            Err(_) => home.join("AppData").join("Roaming").join("atomsyn"),
        }
    } else {
        home.join(".local").join("share").join("atomsyn")
    };
    let created = ensure_dir(&dir)?;
    Ok(DataDirInfo {
        path: dir.to_string_lossy().to_string(),
        source: "default".into(),
        exists: true,
        created,
    })
}

/// Return the expected user config file path (may or may not exist).
#[tauri::command]
fn get_config_path(app: AppHandle) -> Result<String, String> {
    config_file_path(&app)
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "home_dir not available".into())
}

// ───────────────────────── First-run seeding ─────────────────────────

/// Locate the bundled `data/` directory inside the app's resource dir.
/// Returns None if the resource dir or subfolder does not exist (e.g. when
/// running `cargo check` outside a packaged app).
fn bundled_data_subdir(app: &AppHandle, sub: &str) -> Option<PathBuf> {
    let resource_root = app.path().resource_dir().ok()?;
    // Tauri v2 converts "../" in resource paths to "_up_/" in the bundle.
    // Try multiple possible layouts:
    let candidates = [
        resource_root.join("_up_").join("data").join(sub),  // Tauri v2 bundle: _up_/data/sub
        resource_root.join("data").join(sub),                // direct: data/sub
        resource_root.join(sub),                             // flat: sub
    ];
    for c in &candidates {
        if c.exists() { return Some(c.clone()); }
    }
    None
}

/// Count .json files recursively under a directory. Returns 0 if missing.
fn count_json_files(dir: &Path) -> usize {
    if !dir.exists() {
        return 0;
    }
    let mut n = 0usize;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(cur) = stack.pop() {
        let entries = match fs::read_dir(&cur) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
            } else if p.extension().and_then(|s| s.to_str()) == Some("json") {
                n += 1;
            }
        }
    }
    n
}

/// Recursively copy `src` into `dst`, creating destination directories as
/// needed. NEVER overwrites existing files (preserves any user edits).
/// Returns the number of files actually copied.
fn copy_dir_recursive_no_overwrite(src: &Path, dst: &Path) -> Result<usize, String> {
    if !src.exists() {
        return Ok(0);
    }
    ensure_dir(&dst.to_path_buf())?;
    let mut copied = 0usize;
    let entries = fs::read_dir(src)
        .map_err(|e| format!("read_dir failed for {}: {}", src.display(), e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("read_dir entry error: {}", e))?;
        let path = entry.path();
        let name = entry.file_name();
        let target = dst.join(&name);
        if path.is_dir() {
            copied += copy_dir_recursive_no_overwrite(&path, &target)?;
        } else if path.is_file() {
            if !target.exists() {
                if let Some(parent) = target.parent() {
                    ensure_dir(&parent.to_path_buf())?;
                }
                fs::copy(&path, &target)
                    .map_err(|e| format!("copy failed {} → {}: {}", path.display(), target.display(), e))?;
                copied += 1;
            }
        }
    }
    Ok(copied)
}

#[tauri::command]
fn init_ensure_data_dir(app: AppHandle) -> Result<InitStepResult, String> {
    let (root, source) = resolve_data_dir(&app)?;

    let subdirs = [
        "frameworks",
        "atoms",
        "atoms/experience",
        "atoms/skill-inventory",
        "atoms/product-innovation-24",
        "projects",
        "growth",
        "index",
    ];
    let mut created: Vec<String> = Vec::new();
    for sub in subdirs {
        let p = root.join(sub);
        if ensure_dir(&p)? {
            created.push(sub.to_string());
        }
    }

    Ok(InitStepResult {
        step: "data-dir".into(),
        status: "ok".into(),
        detail: format!("数据目录就绪 ({}): {}", source, root.display()),
        counts: Some(serde_json::json!({
            "createdSubdirs": created,
            "path": root.to_string_lossy(),
            "source": source,
        })),
    })
}

#[tauri::command]
fn init_seed_frameworks(app: AppHandle) -> Result<InitStepResult, String> {
    let (root, _) = resolve_data_dir(&app)?;
    let dst = root.join("frameworks");
    ensure_dir(&dst)?;

    let existing = count_json_files(&dst);
    if existing > 0 {
        return Ok(InitStepResult {
            step: "frameworks".into(),
            status: "skipped".into(),
            detail: format!("已存在 {} 个框架,跳过种子注入", existing),
            counts: Some(serde_json::json!({ "existing": existing })),
        });
    }

    let src = match bundled_data_subdir(&app, "frameworks") {
        Some(p) => p,
        None => {
            return Ok(InitStepResult {
                step: "frameworks".into(),
                status: "skipped".into(),
                detail: "开发模式 · 由 Vite 数据插件接管种子注入".into(),
                counts: None,
            });
        }
    };

    let seeded = copy_dir_recursive_no_overwrite(&src, &dst)?;
    Ok(InitStepResult {
        step: "frameworks".into(),
        status: "ok".into(),
        detail: format!("已注入 {} 个框架定义", seeded),
        counts: Some(serde_json::json!({ "seeded": seeded })),
    })
}

#[tauri::command]
fn init_seed_methodology(app: AppHandle) -> Result<InitStepResult, String> {
    let (root, _) = resolve_data_dir(&app)?;
    let dst = root.join("atoms").join("product-innovation-24");
    ensure_dir(&dst)?;

    let existing = count_json_files(&dst);
    if existing > 0 {
        return Ok(InitStepResult {
            step: "methodology-atoms".into(),
            status: "skipped".into(),
            detail: format!("已存在 {} 个方法论原子,跳过种子注入", existing),
            counts: Some(serde_json::json!({ "existing": existing })),
        });
    }

    let src = match bundled_data_subdir(&app, "atoms/product-innovation-24") {
        Some(p) => p,
        None => {
            return Ok(InitStepResult {
                step: "methodology-atoms".into(),
                status: "skipped".into(),
                detail: "开发模式 · 由 Vite 数据插件接管种子注入".into(),
                counts: None,
            });
        }
    };

    let seeded = copy_dir_recursive_no_overwrite(&src, &dst)?;
    Ok(InitStepResult {
        step: "methodology-atoms".into(),
        status: "ok".into(),
        detail: format!("已注入 {} 个方法论原子", seeded),
        counts: Some(serde_json::json!({ "seeded": seeded })),
    })
}

// ───────────────────────── Skill scanner (Tauri native) ─────────────────────────

/// Scan ~/.claude/skills, ~/.cursor/skills, etc. for SKILL.md files,
/// parse frontmatter, and write JSON inventory items to the data dir.
/// This is the Tauri-native equivalent of scripts/scan-skills.mjs.
#[tauri::command]
fn scan_skills(app: AppHandle) -> Result<serde_json::Value, String> {
    let home = app.path().home_dir()
        .map_err(|e| format!("home_dir unavailable: {}", e))?;
    let (data_root, _) = resolve_data_dir(&app)?;
    let out_root = data_root.join("atoms").join("skill-inventory");

    // Directories to scan (tool_name, path)
    let scan_dirs: Vec<(&str, PathBuf)> = vec![
        ("claude", home.join(".claude").join("skills")),
        ("cursor", home.join(".cursor").join("skills")),
        ("codex", home.join(".codex").join("skills")),
        ("trae", home.join(".trae").join("skills")),
        ("openclaw", home.join(".openclaw").join("skills")),
        ("opencode", home.join(".opencode").join("skills")),
    ];

    // Also check user config for custom paths
    let extra_paths = read_config(&app)
        .and_then(|c| c.skill_paths)
        .unwrap_or_default();

    let mut added = 0usize;
    let unchanged = 0usize;

    for (tool_name, dir) in &scan_dirs {
        if !dir.exists() { continue; }
        added += scan_skill_dir(tool_name, dir, &out_root)?;
    }
    for custom in &extra_paths {
        let p = PathBuf::from(custom);
        if p.exists() {
            added += scan_skill_dir("custom", &p, &out_root)?;
        }
    }

    Ok(serde_json::json!({
        "ok": true,
        "added": added,
        "unchanged": unchanged,
    }))
}

/// Scan a single skill directory for SKILL.md files and emit JSON inventory.
fn scan_skill_dir(tool_name: &str, dir: &Path, out_root: &Path) -> Result<usize, String> {
    let mut count = 0usize;
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(0),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        // Follow symlinks
        let meta = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        if meta.is_dir() {
            let skill_md = path.join("SKILL.md");
            if skill_md.exists() {
                if let Ok(true) = process_skill_file(tool_name, &skill_md, &path, out_root) {
                    count += 1;
                }
            }
            // Also recurse one level for nested skills
            if let Ok(sub_entries) = fs::read_dir(&path) {
                for sub in sub_entries.flatten() {
                    let sub_path = sub.path();
                    if sub_path.is_dir() {
                        let sub_skill = sub_path.join("SKILL.md");
                        if sub_skill.exists() {
                            if let Ok(true) = process_skill_file(tool_name, &sub_skill, &sub_path, out_root) {
                                count += 1;
                            }
                        }
                    }
                }
            }
        } else if meta.is_file() && path.file_name().map(|n| n == "SKILL.md").unwrap_or(false) {
            // SKILL.md directly in the skills directory
            if let Ok(true) = process_skill_file(tool_name, &path, dir, out_root) {
                count += 1;
            }
        }
    }
    Ok(count)
}

/// Parse a SKILL.md file and write a JSON inventory item.
/// Returns Ok(true) if a file was written, Ok(false) if unchanged.
fn process_skill_file(
    tool_name: &str,
    skill_md_path: &Path,
    skill_dir: &Path,
    out_root: &Path,
) -> Result<bool, String> {
    let raw = fs::read_to_string(skill_md_path)
        .map_err(|e| format!("read failed {}: {}", skill_md_path.display(), e))?;

    let (frontmatter, body) = parse_frontmatter(&raw);

    let dir_name = skill_dir.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    let fm_name = frontmatter.get("name")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());

    let display_name = fm_name.unwrap_or(dir_name);
    let slug = slugify(display_name);
    if slug.is_empty() { return Ok(false); }

    let id = format!("skill_{}_{}", tool_name, slug);

    let description = frontmatter.get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let raw_description = if description.is_empty() {
        first_paragraph(&body)
    } else {
        description.to_string()
    };

    let out_dir = out_root.join(tool_name);
    ensure_dir(&out_dir.to_path_buf())?;
    let out_path = out_dir.join(format!("{}.json", slug));

    // Check if unchanged by comparing file content hash
    let file_hash = format!("{:x}", md5_simple(raw.as_bytes()));
    if out_path.exists() {
        if let Ok(existing_raw) = fs::read_to_string(&out_path) {
            // Skip rewrite only if hash matches AND fileMtime field exists
            // (force rewrite for legacy files missing fileMtime or using @timestamp format)
            if existing_raw.contains(&file_hash)
                && existing_raw.contains("\"fileMtime\"")
                && !existing_raw.contains("\"createdAt\": \"@")
            {
                return Ok(false); // truly unchanged
            }
        }
    }

    let now = chrono_now_iso();
    // Get actual SKILL.md file modification time for fileMtime field
    let file_mtime = fs::metadata(skill_md_path)
        .and_then(|m| m.modified())
        .map(|t| {
            let secs = t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            let (year, month, day) = days_to_ymd((secs / 86400) as i64);
            let tod = secs % 86400;
            format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.000Z", year, month, day, tod / 3600, (tod % 3600) / 60, tod % 60)
        })
        .unwrap_or_else(|_| now.clone());
    // Preserve original createdAt from existing file if available
    let created_at = if out_path.exists() {
        fs::read_to_string(&out_path).ok()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
            .and_then(|v| v.get("createdAt")?.as_str().map(|s| s.to_string()))
            // Skip legacy @timestamp format
            .filter(|s| !s.starts_with('@'))
            .unwrap_or_else(|| file_mtime.clone())
    } else {
        file_mtime.clone()
    };
    let tags: Vec<String> = vec![tool_name.to_string()];

    let item = serde_json::json!({
        "id": id,
        "schemaVersion": 1,
        "kind": "skill-inventory",
        "name": display_name,
        "tags": tags,
        "localPath": skill_md_path.to_string_lossy(),
        "toolName": tool_name,
        "frontmatter": frontmatter,
        "rawDescription": raw_description,
        "fileHash": file_hash,
        "fileMtime": file_mtime,
        "stats": {
            "usedInProjects": [],
            "useCount": 0,
            "aiInvokeCount": 0,
            "humanViewCount": 0,
        },
        "createdAt": created_at,
        "updatedAt": now,
    });

    let json_str = serde_json::to_string_pretty(&item)
        .map_err(|e| format!("json serialize: {}", e))?;
    fs::write(&out_path, json_str)
        .map_err(|e| format!("write failed {}: {}", out_path.display(), e))?;

    Ok(true)
}

/// Minimal YAML frontmatter parser (--- delimited).
fn parse_frontmatter(text: &str) -> (serde_json::Map<String, serde_json::Value>, String) {
    let empty = (serde_json::Map::new(), text.to_string());
    if !text.starts_with("---") { return empty; }

    let lines: Vec<&str> = text.lines().collect();
    if lines.is_empty() || lines[0].trim() != "---" { return empty; }

    let mut end_idx = None;
    for (i, line) in lines.iter().enumerate().skip(1) {
        if line.trim() == "---" {
            end_idx = Some(i);
            break;
        }
    }
    let end_idx = match end_idx {
        Some(i) => i,
        None => return empty,
    };

    let mut fm = serde_json::Map::new();
    for line in &lines[1..end_idx] {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') { continue; }
        if let Some(colon_pos) = trimmed.find(':') {
            let key = trimmed[..colon_pos].trim().to_string();
            let val = trimmed[colon_pos + 1..].trim();

            if val.starts_with('[') && val.ends_with(']') {
                // Inline array
                let inner = &val[1..val.len()-1];
                let items: Vec<serde_json::Value> = inner.split(',')
                    .map(|s| serde_json::Value::String(
                        s.trim().trim_matches(|c| c == '"' || c == '\'').to_string()
                    ))
                    .filter(|v| !v.as_str().unwrap_or("").is_empty())
                    .collect();
                fm.insert(key, serde_json::Value::Array(items));
            } else {
                // Strip quotes
                let cleaned = val.trim_matches(|c| c == '"' || c == '\'');
                fm.insert(key, serde_json::Value::String(cleaned.to_string()));
            }
        }
    }

    let body = lines[end_idx + 1..].join("\n");
    (fm, body)
}

fn slugify(s: &str) -> String {
    let lower = s.to_lowercase();
    let slug: String = lower.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let trimmed = slug.trim_matches('-').to_string();
    // Collapse consecutive dashes
    let mut result = String::new();
    let mut prev_dash = false;
    for c in trimmed.chars() {
        if c == '-' {
            if !prev_dash { result.push(c); }
            prev_dash = true;
        } else {
            result.push(c);
            prev_dash = false;
        }
    }
    if result.len() > 80 { result.truncate(80); }
    result
}

fn first_paragraph(body: &str) -> String {
    for para in body.split("\n\n") {
        let t = para.trim();
        if t.is_empty() || t.starts_with('#') { continue; }
        let oneline = t.split_whitespace().collect::<Vec<_>>().join(" ");
        return if oneline.len() > 800 { oneline[..800].to_string() } else { oneline };
    }
    String::new()
}

/// Simple hash for change detection (not crypto).
fn md5_simple(data: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for &b in data {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

// ───────────────────────── Agent skill installation ─────────────────────────

/// Recursively copy `src` into `dst`, **overwriting** existing files.
/// Used for skill installation where we want the latest version.
fn copy_dir_recursive_overwrite(src: &Path, dst: &Path) -> Result<usize, String> {
    if !src.exists() {
        return Ok(0);
    }
    ensure_dir(&dst.to_path_buf())?;
    let mut copied = 0usize;
    let entries = fs::read_dir(src)
        .map_err(|e| format!("read_dir failed for {}: {}", src.display(), e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("read_dir entry error: {}", e))?;
        let path = entry.path();
        let name = entry.file_name();
        let target = dst.join(&name);
        if path.is_dir() {
            copied += copy_dir_recursive_overwrite(&path, &target)?;
        } else if path.is_file() {
            if let Some(parent) = target.parent() {
                ensure_dir(&parent.to_path_buf())?;
            }
            fs::copy(&path, &target)
                .map_err(|e| format!("copy failed {} -> {}: {}", path.display(), target.display(), e))?;
            copied += 1;
        }
    }
    Ok(copied)
}

/// Locate a bundled resource subdirectory (skills/ or scripts/).
fn bundled_resource_subdir(app: &AppHandle, sub: &str) -> Option<PathBuf> {
    let resource_root = app.path().resource_dir().ok()?;
    // Tauri v2 converts "../" in resource paths to "_up_/" in the bundle.
    let candidates = [
        resource_root.join("_up_").join(sub),  // Tauri v2 bundle: _up_/skills/...
        resource_root.join(sub),               // direct: skills/...
    ];
    for c in &candidates {
        if c.exists() { return Some(c.clone()); }
    }
    None
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct SkillInstallResult {
    claude_installed: bool,
    cursor_installed: bool,
    cli_installed: bool,
    node_available: bool,
    node_version: Option<String>,
    files_copied: usize,
    detail: String,
}

/// Check if Node.js is available on the system PATH.
fn detect_node() -> (bool, Option<String>) {
    use std::process::Command;
    match Command::new("node").arg("--version").output() {
        Ok(output) if output.status.success() => {
            let ver = String::from_utf8_lossy(&output.stdout).trim().to_string();
            (true, Some(ver))
        }
        _ => (false, None),
    }
}

#[tauri::command]
fn install_agent_skills(app: AppHandle) -> Result<SkillInstallResult, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|e| format!("home_dir unavailable: {}", e))?;

    let skill_names = ["atomsyn-write", "atomsyn-read", "atomsyn-mentor"];
    let mut total_copied = 0usize;
    let mut claude_ok = false;
    let mut cursor_ok = false;
    let mut details: Vec<String> = Vec::new();

    // 1. Copy skills to Claude and Cursor directories
    let targets: Vec<(&str, PathBuf)> = vec![
        ("Claude", home.join(".claude").join("skills")),
        ("Cursor", home.join(".cursor").join("skills")),
    ];

    for (name, skills_dir) in &targets {
        // Only install if the parent tool directory exists (e.g. ~/.claude/)
        let tool_dir = skills_dir.parent().unwrap_or(skills_dir);
        if !tool_dir.exists() {
            details.push(format!("{}: skipped (directory not found)", name));
            continue;
        }

        let mut tool_copied = 0usize;
        for skill_name in &skill_names {
            if let Some(src) = bundled_resource_subdir(&app, &format!("skills/{}", skill_name)) {
                let dst = skills_dir.join(skill_name);
                tool_copied += copy_dir_recursive_overwrite(&src, &dst)?;
            }
        }
        total_copied += tool_copied;
        if *name == "Claude" { claude_ok = true; }
        if *name == "Cursor" { cursor_ok = true; }
        details.push(format!("{}: {} files installed", name, tool_copied));
    }

    // 2. Install CLI script and shim
    let cli_ok = install_cli_shim(&app, &home, &mut total_copied, &mut details);

    // 3. Check Node.js availability
    let (node_available, node_version) = detect_node();
    if !node_available {
        details.push("Node.js: NOT FOUND — atomsyn-cli requires Node.js to run".to_string());
    } else if let Some(ref v) = node_version {
        details.push(format!("Node.js: {} ✓", v));
    }

    Ok(SkillInstallResult {
        claude_installed: claude_ok,
        cursor_installed: cursor_ok,
        cli_installed: cli_ok,
        node_available,
        node_version,
        files_copied: total_copied,
        detail: details.join("; "),
    })
}

/// Install the CLI shim script to ~/.atomsyn/bin/
fn install_cli_shim(
    app: &AppHandle,
    home: &Path,
    total_copied: &mut usize,
    details: &mut Vec<String>,
) -> bool {
    let bin_dir = home.join(".atomsyn").join("bin");
    if let Err(e) = ensure_dir(&bin_dir.to_path_buf()) {
        details.push(format!("CLI: failed to create bin dir: {}", e));
        return false;
    }

    // Copy atomsyn-cli.mjs to ~/.atomsyn/bin/
    // Try multiple path patterns: Tauri v2 maps "../" to "_up_/" in bundles,
    // and may or may not flatten the scripts/ directory prefix.
    let cli_src = bundled_resource_subdir(app, "scripts/atomsyn-cli.mjs")
        .or_else(|| {
            let res = app.path().resource_dir().ok()?;
            // Try flattened: resource_dir/atomsyn-cli.mjs
            let flat = res.join("atomsyn-cli.mjs");
            if flat.exists() { return Some(flat); }
            // Try _up_/scripts/ variant
            let up_scripts = res.join("_up_").join("scripts").join("atomsyn-cli.mjs");
            if up_scripts.exists() { return Some(up_scripts); }
            // Try direct scripts/ under resource dir
            let direct = res.join("scripts").join("atomsyn-cli.mjs");
            if direct.exists() { return Some(direct); }
            None
        });

    let cli_dst = bin_dir.join("atomsyn-cli.mjs");
    match &cli_src {
        Some(src) => {
            if let Err(e) = fs::copy(src, &cli_dst) {
                details.push(format!("CLI: copy from {} failed: {}", src.display(), e));
                return false;
            }
            *total_copied += 1;
        }
        None => {
            // Source not found in bundle — cannot create a working shim
            let res_dir = app.path().resource_dir().unwrap_or_default();
            details.push(format!(
                "CLI: atomsyn-cli.mjs not found in bundle (resource_dir={})",
                res_dir.display()
            ));
            return false;
        }
    }

    // Copy lib/ dependencies (analysis.mjs, findRelatedFragments.mjs)
    let lib_dir = bin_dir.join("lib");
    let _ = ensure_dir(&lib_dir);
    let lib_files = ["analysis.mjs", "findRelatedFragments.mjs"];
    for lib_file in &lib_files {
        let lib_src_path = format!("scripts/lib/{}", lib_file);
        let src = bundled_resource_subdir(app, &lib_src_path)
            .or_else(|| {
                let res = app.path().resource_dir().ok()?;
                // Try multiple candidate paths for bundled lib files
                for candidate in &[
                    res.join("_up_").join("scripts").join("lib").join(lib_file),
                    res.join("scripts").join("lib").join(lib_file),
                    res.join("_up_").join("lib").join(lib_file),
                    res.join("lib").join(lib_file),
                    res.join(lib_file),
                ] {
                    if candidate.exists() { return Some(candidate.clone()); }
                }
                None
            });
        if let Some(s) = src {
            if let Err(e) = fs::copy(&s, lib_dir.join(lib_file)) {
                details.push(format!("CLI lib: copy {} failed: {}", lib_file, e));
            } else {
                *total_copied += 1;
            }
        } else {
            details.push(format!("CLI lib: {} not found in bundle", lib_file));
        }
    }

    // Create platform-specific shim with Node.js detection
    #[cfg(unix)]
    {
        let shim_path = bin_dir.join("atomsyn-cli");
        let shim_content = format!(
            r#"#!/bin/sh
# Atomsyn CLI shim — generated by Atomsyn desktop app
CLI_SCRIPT="{cli_path}"

# Check if the CLI script exists
if [ ! -f "$CLI_SCRIPT" ]; then
  echo "Error: atomsyn-cli.mjs not found at $CLI_SCRIPT" >&2
  echo "Please open Atomsyn app → Settings → Install Agent Skills to fix." >&2
  exit 1
fi

# Check if Node.js is available
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required but not installed." >&2
  echo "" >&2
  echo "atomsyn-cli is used by AI agents (Claude Code, Cursor) to read/write" >&2
  echo "your knowledge vault. These tools require Node.js." >&2
  echo "" >&2
  echo "Install Node.js: https://nodejs.org/ (LTS recommended)" >&2
  echo "  macOS:   brew install node" >&2
  echo "  Windows: winget install OpenJS.NodeJS.LTS" >&2
  exit 1
fi

exec node "$CLI_SCRIPT" "$@"
"#,
            cli_path = cli_dst.display()
        );
        if let Err(e) = fs::write(&shim_path, &shim_content) {
            details.push(format!("CLI shim: write failed: {}", e));
            return false;
        }
        // chmod +x
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&shim_path, fs::Permissions::from_mode(0o755));
        *total_copied += 1;

        // Append to shell rc if not already present
        append_to_shell_rc(home, &bin_dir);
    }

    #[cfg(windows)]
    {
        let shim_path = bin_dir.join("atomsyn-cli.cmd");
        let shim_content = format!(
            "@echo off\r\nREM Atomsyn CLI shim — generated by Atomsyn desktop app\r\nif not exist \"{cli_path}\" (\r\n  echo Error: atomsyn-cli.mjs not found. Open Atomsyn app Settings to reinstall. >&2\r\n  exit /b 1\r\n)\r\nwhere node >nul 2>&1 || (\r\n  echo Error: Node.js is required. Install from https://nodejs.org/ >&2\r\n  exit /b 1\r\n)\r\nnode \"{cli_path}\" %*\r\n",
            cli_path = cli_dst.display()
        );
        if let Err(e) = fs::write(&shim_path, &shim_content) {
            details.push(format!("CLI shim: write failed: {}", e));
            return false;
        }
        *total_copied += 1;
    }

    details.push("CLI: installed".to_string());
    true
}

/// Append PATH export to ~/.zshrc or ~/.bashrc (idempotent).
#[cfg(unix)]
fn append_to_shell_rc(home: &Path, bin_dir: &Path) {
    let marker = "# Atomsyn CLI (atomsyn-cli install-skill)";
    let export_line = format!("export PATH=\"{}:$PATH\"", bin_dir.display());
    let block = format!("\n{}\n{}\n", marker, export_line);

    // Try zshrc first, then bashrc
    let candidates = [home.join(".zshrc"), home.join(".bashrc")];
    for rc in &candidates {
        if rc.exists() {
            if let Ok(content) = fs::read_to_string(rc) {
                if content.contains(marker) {
                    return; // Already installed
                }
            }
            let _ = fs::OpenOptions::new()
                .append(true)
                .open(rc)
                .and_then(|mut f| {
                    use std::io::Write;
                    f.write_all(block.as_bytes())
                });
            return;
        }
    }
}

#[tauri::command]
fn init_check_skill_installation(app: AppHandle) -> Result<InitStepResult, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|e| format!("home_dir unavailable: {}", e))?;

    let claude_skill = home.join(".claude/skills/atomsyn-write/SKILL.md");
    let cursor_skill = home.join(".cursor/skills/atomsyn-write/SKILL.md");
    let cli_shim_unix = home.join(".atomsyn/bin/atomsyn-cli");
    let cli_shim_win = home.join(".atomsyn/bin/atomsyn-cli.cmd");

    let claude_ok = claude_skill.exists();
    let cursor_ok = cursor_skill.exists();
    // CLI is "ok" only if both the shim AND the .mjs file exist
    let cli_mjs = home.join(".atomsyn/bin/atomsyn-cli.mjs");
    let shim_exists = cli_shim_unix.exists() || cli_shim_win.exists();
    let cli_ok = shim_exists && cli_mjs.exists();

    let (status, detail) = if claude_ok && cli_ok {
        (
            "ok".to_string(),
            "Claude Skill 与 atomsyn-cli shim 均已安装".to_string(),
        )
    } else {
        let mut missing: Vec<&str> = Vec::new();
        if !claude_ok {
            missing.push("~/.claude/skills/atomsyn-write");
        }
        if !cli_ok {
            missing.push("~/.atomsyn/bin/atomsyn-cli");
        }
        (
            "skipped".to_string(),
            format!("未检测到: {} (可在设置中运行 atomsyn-cli install-skill)", missing.join(", ")),
        )
    };

    Ok(InitStepResult {
        step: "skill-check".into(),
        status,
        detail,
        counts: Some(serde_json::json!({
            "claudeSkillInstalled": claude_ok,
            "cursorSkillInstalled": cursor_ok,
            "cliShimInstalled": cli_ok,
        })),
    })
}

// ───────────────────────── V1.5 · seed methodology version updates ─────────────────────────
//
// NOTE on hashing: we deliberately do NOT add the `sha2` crate to keep the
// Cargo.toml dependency surface unchanged. Instead we compare files by full
// byte-equality (size + content bytes). For our scale (~150 atom JSONs each
// a few KB) this is plenty fast and avoids a new dependency. The Vite plugin
// in dev mode uses sha256 (Node stdlib `crypto`) so its `manifest` strings
// look like "sha256:..."; the Rust side uses an opaque "size:N|crc:..." form
// derived from std-only primitives. Both sides are internally consistent —
// `.seed-state.json` is rewritten on each sync, so cross-side compatibility
// is not required (a user who switches between dev mode and the packaged
// app will simply trigger one extra "user-modified-kept" classification on
// the first switch, then the manifest realigns).

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct SeedChangelogEntry {
    version: String,
    date: String,
    notes: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct SeedManifestContents {
    frameworks: Vec<String>,
    methodology_atom_count: u32,
    root_paths: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct SeedManifest {
    version: String,
    release_date: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    changelog: Option<Vec<SeedChangelogEntry>>,
    contents: SeedManifestContents,
}

#[derive(Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
struct SeedState {
    installed_version: String,
    #[serde(default)]
    dismissed_versions: Vec<String>,
    #[serde(default)]
    last_synced_at: String,
    #[serde(default)]
    manifest: std::collections::BTreeMap<String, String>,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
struct SeedDiff {
    added: Vec<String>,
    updated: Vec<String>,
    user_modified_kept: Vec<String>,
    removed_from_seed: Vec<String>,
    unchanged: u32,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct SeedCheckResult {
    seed_version: String,
    installed_version: Option<String>,
    has_update: bool,
    dismissed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    diff: Option<SeedDiff>,
    #[serde(skip_serializing_if = "Option::is_none")]
    changelog: Option<Vec<SeedChangelogEntry>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_synced_at: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct SeedSyncResult {
    ok: bool,
    synced: u32,
    skipped: u32,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct AppVersionResult {
    current: String,
    latest: Option<String>,
    has_update: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    release_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    changelog_url: Option<String>,
}

/// Find the bundled seed root (resource_dir/data, or resource_dir flat).
fn bundled_seed_root(app: &AppHandle) -> Option<PathBuf> {
    let resource_root = app.path().resource_dir().ok()?;
    // Tauri v2 converts "../" to "_up_/" in the bundle
    let candidates = [
        resource_root.join("_up_").join("data"),
        resource_root.join("data"),
        resource_root.clone(),
    ];
    for c in &candidates {
        if c.join("SEED_VERSION.json").exists() {
            return Some(c.clone());
        }
    }
    None
}

fn read_seed_manifest(seed_root: &Path) -> Option<SeedManifest> {
    let p = seed_root.join("SEED_VERSION.json");
    let raw = fs::read_to_string(&p).ok()?;
    serde_json::from_str(&raw).ok()
}

fn seed_state_path(data_dir: &Path) -> PathBuf {
    data_dir.join(".seed-state.json")
}

fn read_seed_state(data_dir: &Path) -> Option<SeedState> {
    let p = seed_state_path(data_dir);
    let raw = fs::read_to_string(&p).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_seed_state(data_dir: &Path, state: &SeedState) -> Result<(), String> {
    let p = seed_state_path(data_dir);
    if let Some(parent) = p.parent() {
        ensure_dir(&parent.to_path_buf())?;
    }
    let s = serde_json::to_string_pretty(state)
        .map_err(|e| format!("serialize seed-state failed: {}", e))?;
    fs::write(&p, s + "\n").map_err(|e| format!("write seed-state failed: {}", e))
}

/// std-only file fingerprint: "size:N|first8:..." plus a wrapping check on
/// length. Two files with identical content always produce the same string;
/// distinct content almost always produces a different one (collisions are
/// possible in theory but vanishingly unlikely for our JSON corpus, and any
/// false-equal would only mean we skip a redundant copy — never data loss).
fn fingerprint_file(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("read {} failed: {}", path.display(), e))?;
    let len = bytes.len();
    // Simple FNV-1a 64-bit over the full content (std-only).
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in &bytes {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    Ok(format!("fnv1a:{}|len:{}", hash, len))
}

fn files_equal(a: &Path, b: &Path) -> Result<bool, String> {
    let am = fs::metadata(a).map_err(|e| format!("metadata {} failed: {}", a.display(), e))?;
    let bm = fs::metadata(b).map_err(|e| format!("metadata {} failed: {}", b.display(), e))?;
    if am.len() != bm.len() {
        return Ok(false);
    }
    let ab = fs::read(a).map_err(|e| format!("read {} failed: {}", a.display(), e))?;
    let bb = fs::read(b).map_err(|e| format!("read {} failed: {}", b.display(), e))?;
    Ok(ab == bb)
}

/// Walk all files under `root/sub` and return their paths relative to `root`.
fn walk_relative_to(root: &Path, sub: &Path) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if !sub.exists() {
        return out;
    }
    let mut stack = vec![sub.to_path_buf()];
    while let Some(cur) = stack.pop() {
        let entries = match fs::read_dir(&cur) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
            } else if p.is_file() {
                if let Ok(rel) = p.strip_prefix(root) {
                    out.push(rel.to_string_lossy().replace('\\', "/"));
                }
            }
        }
    }
    out
}

fn collect_seed_files(root: &Path, root_paths: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for rp in root_paths {
        let stripped = rp.trim_start_matches("data/").trim_end_matches('/');
        let abs = root.join(stripped);
        if !abs.exists() {
            continue;
        }
        let mut files = walk_relative_to(root, &abs);
        out.append(&mut files);
    }
    out
}

fn compute_seed_diff(
    seed_root: &Path,
    data_dir: &Path,
    root_paths: &[String],
    prev_manifest: &std::collections::BTreeMap<String, String>,
) -> Result<SeedDiff, String> {
    let seed_files = collect_seed_files(seed_root, root_paths);
    let seed_set: std::collections::HashSet<&String> = seed_files.iter().collect();

    let mut diff = SeedDiff::default();

    for rel in &seed_files {
        let seed_abs = seed_root.join(rel);
        let user_abs = data_dir.join(rel);
        if !user_abs.exists() {
            diff.added.push(rel.clone());
            continue;
        }
        if files_equal(&seed_abs, &user_abs)? {
            diff.unchanged += 1;
            continue;
        }
        let user_fp = fingerprint_file(&user_abs)?;
        let pristine = prev_manifest
            .get(rel)
            .map(|saved| saved == &user_fp)
            .unwrap_or(false);
        if pristine {
            diff.updated.push(rel.clone());
        } else {
            diff.user_modified_kept.push(rel.clone());
        }
    }

    let user_files = collect_seed_files(data_dir, root_paths);
    for rel in user_files {
        if !seed_set.contains(&rel) {
            diff.removed_from_seed.push(rel);
        }
    }

    Ok(diff)
}

fn apply_seed_sync(
    seed_root: &Path,
    data_dir: &Path,
    manifest: &SeedManifest,
    diff: &SeedDiff,
) -> Result<SeedSyncResult, String> {
    let mut synced = 0u32;
    for rel in diff.added.iter().chain(diff.updated.iter()) {
        let src = seed_root.join(rel);
        let dst = data_dir.join(rel);
        if let Some(parent) = dst.parent() {
            ensure_dir(&parent.to_path_buf())?;
        }
        fs::copy(&src, &dst)
            .map_err(|e| format!("copy {} → {} failed: {}", src.display(), dst.display(), e))?;
        synced += 1;
    }

    // Rebuild manifest from post-sync user state
    let post_files = collect_seed_files(seed_root, &manifest.contents.root_paths);
    let mut new_manifest: std::collections::BTreeMap<String, String> =
        std::collections::BTreeMap::new();
    for rel in post_files {
        let user_abs = data_dir.join(&rel);
        if user_abs.exists() {
            new_manifest.insert(rel, fingerprint_file(&user_abs)?);
        }
    }

    let prev_dismissed = read_seed_state(data_dir)
        .map(|s| s.dismissed_versions)
        .unwrap_or_default();

    let state = SeedState {
        installed_version: manifest.version.clone(),
        dismissed_versions: prev_dismissed,
        last_synced_at: chrono_now_iso(),
        manifest: new_manifest,
    };
    write_seed_state(data_dir, &state)?;

    Ok(SeedSyncResult {
        ok: true,
        synced,
        skipped: diff.user_modified_kept.len() as u32,
    })
}

/// Std-only ISO-8601 timestamp using SystemTime. We don't pull `chrono`.
/// Returns format like "2026-04-13T12:00:00.000Z" so JavaScript's `new Date()`
/// can parse it correctly. The old `@{unix_secs}` format caused NaN in the UI.
fn chrono_now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Convert UNIX seconds to a basic ISO-8601 UTC timestamp
    // 86400 = seconds per day, manual calendar math (no chrono crate)
    let days_since_epoch = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Convert days since 1970-01-01 to Y-M-D
    let (year, month, day) = days_to_ymd(days_since_epoch as i64);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.000Z",
        year, month, day, hours, minutes, seconds
    )
}

/// Convert days since Unix epoch (1970-01-01) to (year, month, day).
fn days_to_ymd(mut days: i64) -> (i64, u32, u32) {
    // Shift epoch to 0000-03-01 for easier leap year handling
    days += 719468; // days from 0000-03-01 to 1970-01-01
    let era = if days >= 0 { days } else { days - 146096 } / 146097;
    let doe = (days - era * 146097) as u32; // day of era [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

#[tauri::command]
fn seed_check(app: AppHandle) -> Result<SeedCheckResult, String> {
    let seed_root = match bundled_seed_root(&app) {
        Some(p) => p,
        None => {
            return Ok(SeedCheckResult {
                seed_version: "unknown".into(),
                installed_version: None,
                has_update: false,
                dismissed: false,
                diff: None,
                changelog: None,
                reason: Some("no-bundled-seed".into()),
                last_synced_at: None,
            });
        }
    };
    let manifest = match read_seed_manifest(&seed_root) {
        Some(m) => m,
        None => {
            return Ok(SeedCheckResult {
                seed_version: "unknown".into(),
                installed_version: None,
                has_update: false,
                dismissed: false,
                diff: None,
                changelog: None,
                reason: Some("no-seed-manifest".into()),
                last_synced_at: None,
            });
        }
    };
    let (data_dir, _) = resolve_data_dir(&app)?;
    if seed_root == data_dir {
        return Ok(SeedCheckResult {
            seed_version: manifest.version.clone(),
            installed_version: Some(manifest.version.clone()),
            has_update: false,
            dismissed: false,
            diff: None,
            changelog: manifest.changelog,
            reason: Some("dogfood-same-dir".into()),
            last_synced_at: None,
        });
    }
    let state = read_seed_state(&data_dir);
    let installed = state.as_ref().map(|s| s.installed_version.clone());
    let dismissed = state
        .as_ref()
        .map(|s| s.dismissed_versions.contains(&manifest.version))
        .unwrap_or(false);
    if installed.is_none() {
        return Ok(SeedCheckResult {
            seed_version: manifest.version.clone(),
            installed_version: None,
            has_update: false,
            dismissed: false,
            diff: None,
            changelog: manifest.changelog,
            reason: Some("first-install".into()),
            last_synced_at: None,
        });
    }
    let is_newer = installed.as_deref() != Some(manifest.version.as_str());
    let diff = if is_newer {
        Some(compute_seed_diff(
            &seed_root,
            &data_dir,
            &manifest.contents.root_paths,
            &state.as_ref().map(|s| s.manifest.clone()).unwrap_or_default(),
        )?)
    } else {
        None
    };
    Ok(SeedCheckResult {
        seed_version: manifest.version.clone(),
        installed_version: installed,
        has_update: is_newer,
        dismissed,
        diff,
        changelog: manifest.changelog,
        reason: None,
        last_synced_at: state.as_ref().map(|s| s.last_synced_at.clone()),
    })
}

#[tauri::command]
fn seed_sync(app: AppHandle) -> Result<SeedSyncResult, String> {
    let seed_root = bundled_seed_root(&app).ok_or_else(|| "no-bundled-seed".to_string())?;
    let manifest = read_seed_manifest(&seed_root).ok_or_else(|| "no-seed-manifest".to_string())?;
    let (data_dir, _) = resolve_data_dir(&app)?;
    if seed_root == data_dir {
        return Ok(SeedSyncResult {
            ok: true,
            synced: 0,
            skipped: 0,
        });
    }
    let state = read_seed_state(&data_dir);
    let prev = state.map(|s| s.manifest).unwrap_or_default();
    let diff = compute_seed_diff(&seed_root, &data_dir, &manifest.contents.root_paths, &prev)?;
    apply_seed_sync(&seed_root, &data_dir, &manifest, &diff)
}

#[tauri::command]
fn seed_dismiss(app: AppHandle, version: String) -> Result<(), String> {
    let (data_dir, _) = resolve_data_dir(&app)?;
    let mut state = read_seed_state(&data_dir).unwrap_or_default();
    if !state.dismissed_versions.contains(&version) {
        state.dismissed_versions.push(version);
    }
    write_seed_state(&data_dir, &state)
}

#[tauri::command]
fn seed_reset_dismiss(app: AppHandle) -> Result<(), String> {
    let (data_dir, _) = resolve_data_dir(&app)?;
    if let Some(mut state) = read_seed_state(&data_dir) {
        state.dismissed_versions.clear();
        write_seed_state(&data_dir, &state)?;
    }
    Ok(())
}

#[tauri::command]
fn app_version_check() -> Result<AppVersionResult, String> {
    // TODO(V1.6): once the repo is published, fetch
    //   https://api.github.com/repos/circlelee/atomsyn/releases/latest
    // via reqwest (add as dep), parse `tag_name`, compare with semver, and
    // populate { latest, hasUpdate, releaseUrl, changelogUrl }.
    Ok(AppVersionResult {
        current: env!("CARGO_PKG_VERSION").to_string(),
        latest: None,
        has_update: false,
        reason: Some("v1.5-not-published".into()),
        release_url: None,
        changelog_url: None,
    })
}

// ───────────────────────── V2.0 · ccl-atlas → Atomsyn legacy migration ─────────────────────────

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct LegacyCheckResult {
    found: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    entry_count: u32,
    config_found: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    config_path: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct MigrationResult {
    ok: bool,
    migrated_files: u32,
    skipped_files: u32,
    backup_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    config_backup_path: Option<String>,
}

fn legacy_data_dir_path(app: &AppHandle) -> Result<PathBuf, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|e| format!("home_dir unavailable: {}", e))?;
    let dir = if cfg!(target_os = "macos") {
        home.join("Library").join("Application Support").join("ccl-atlas")
    } else if cfg!(target_os = "windows") {
        match std::env::var("APPDATA") {
            Ok(v) => PathBuf::from(v).join("ccl-atlas"),
            Err(_) => home.join("AppData").join("Roaming").join("ccl-atlas"),
        }
    } else {
        home.join(".local").join("share").join("ccl-atlas")
    };
    Ok(dir)
}

fn legacy_config_file_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .home_dir()
        .ok()
        .map(|h| h.join(".ccl-atlas-config.json"))
}

/// V2.0 M0 · Detect if the legacy `ccl-atlas` user data directory (or config
/// file) exists at the platform-default location. Dev mode (with
/// `ATOMSYN_DEV_DATA_DIR` env var set) short-circuits to "not found" so
/// running `tauri:dev` against the project /data never triggers migration.
#[tauri::command]
fn legacy_data_dir_check(app: AppHandle) -> Result<LegacyCheckResult, String> {
    // Dev-mode guard: never migrate when the user is dogfooding via env var.
    if std::env::var("ATOMSYN_DEV_DATA_DIR").is_ok() {
        return Ok(LegacyCheckResult {
            found: false,
            path: None,
            entry_count: 0,
            config_found: false,
            config_path: None,
        });
    }

    let legacy = legacy_data_dir_path(&app)?;
    let found = legacy.is_dir();
    let entry_count = if found {
        count_json_files(&legacy) as u32
    } else {
        0
    };
    let cfg = legacy_config_file_path(&app);
    let config_found = cfg.as_ref().map(|p| p.is_file()).unwrap_or(false);
    Ok(LegacyCheckResult {
        found,
        path: if found {
            Some(legacy.to_string_lossy().to_string())
        } else {
            None
        },
        entry_count,
        config_found,
        config_path: if config_found {
            cfg.map(|p| p.to_string_lossy().to_string())
        } else {
            None
        },
    })
}

/// V2.0 M0 · Move legacy `ccl-atlas` data into the new `atomsyn` directory
/// and rename the old folder to `.ccl-atlas.deprecated.<unix>` as a backup
/// (NEVER deleted). Per `docs/plans/v2.0-m0-migration-copy.md` the user
/// always has a path back. Also migrates `~/.ccl-atlas-config.json` →
/// `~/.atomsyn-config.json` if present.
#[tauri::command]
fn legacy_data_dir_migrate(app: AppHandle) -> Result<MigrationResult, String> {
    let legacy = legacy_data_dir_path(&app)?;
    if !legacy.is_dir() {
        return Err("旧数据目录不存在,无需迁移".into());
    }

    // Resolve (and create) the new atomsyn data dir.
    let (new_dir, _) = resolve_data_dir(&app)?;

    // Abort if new == legacy (shouldn't happen after rename but be defensive).
    if new_dir == legacy {
        return Err("新旧数据目录相同,无需迁移".into());
    }

    let total_before = count_json_files(&legacy) as u32;
    let migrated = copy_dir_recursive_no_overwrite(&legacy, &new_dir)? as u32;
    let skipped = total_before.saturating_sub(migrated);

    // Build a unix timestamp suffix for the backup folder name.
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // Rename legacy dir → .ccl-atlas.deprecated.<ts>
    let backup = legacy.with_file_name(format!(".ccl-atlas.deprecated.{}", ts));
    fs::rename(&legacy, &backup)
        .map_err(|e| format!("rename legacy dir failed: {}", e))?;

    // Also migrate ~/.ccl-atlas-config.json → ~/.atomsyn-config.json if present.
    let mut config_backup: Option<String> = None;
    if let Some(legacy_cfg) = legacy_config_file_path(&app) {
        if legacy_cfg.is_file() {
            if let Ok(home) = app.path().home_dir() {
                let new_cfg = home.join(".atomsyn-config.json");
                if !new_cfg.exists() {
                    fs::copy(&legacy_cfg, &new_cfg)
                        .map_err(|e| format!("config copy failed: {}", e))?;
                }
                let cfg_backup = legacy_cfg
                    .with_file_name(format!(".ccl-atlas-config.json.deprecated.{}", ts));
                fs::rename(&legacy_cfg, &cfg_backup)
                    .map_err(|e| format!("config rename failed: {}", e))?;
                config_backup = Some(cfg_backup.to_string_lossy().to_string());
            }
        }
    }

    // Append a migration event to the usage log (best-effort, non-fatal).
    let log_path = new_dir.join("growth").join("usage-log.jsonl");
    if let Some(parent) = log_path.parent() {
        let _ = ensure_dir(&parent.to_path_buf());
    }
    let log_line = format!(
        "{{\"ts\":\"@{}\",\"action\":\"migration\",\"from\":\"ccl-atlas\",\"to\":\"atomsyn\",\"backup\":\"{}\",\"migrated\":{},\"skipped\":{}}}\n",
        ts,
        backup.display().to_string().replace('\\', "/"),
        migrated,
        skipped
    );
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        use std::io::Write;
        let _ = f.write_all(log_line.as_bytes());
    }

    Ok(MigrationResult {
        ok: true,
        migrated_files: migrated,
        skipped_files: skipped,
        backup_path: backup.to_string_lossy().to_string(),
        config_backup_path: config_backup,
    })
}

/// Open an arbitrary filesystem path in the user's system file manager
/// (macOS Finder / Windows Explorer / Linux xdg-open). V1.5 bypasses the
/// shell plugin's scope system — which by default blocks user-provided
/// paths — by shelling out to the platform's native open command directly.
/// The frontend is trusted to only pass paths it has just read back from
/// our own data APIs.
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    use std::process::Command;
    let pb = PathBuf::from(&path);
    if !pb.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    let result = if cfg!(target_os = "macos") {
        Command::new("open").arg(&path).spawn()
    } else if cfg!(target_os = "windows") {
        Command::new("explorer").arg(&path).spawn()
    } else {
        Command::new("xdg-open").arg(&path).spawn()
    };
    result.map(|_| ()).map_err(|e| format!("打开失败: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_data_dir,
            get_config_path,
            init_ensure_data_dir,
            init_seed_frameworks,
            init_seed_methodology,
            init_check_skill_installation,
            install_agent_skills,
            scan_skills,
            seed_check,
            seed_sync,
            seed_dismiss,
            seed_reset_dismiss,
            app_version_check,
            open_path,
            legacy_data_dir_check,
            legacy_data_dir_migrate,
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running Atomsyn");
}
