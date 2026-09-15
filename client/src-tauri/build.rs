fn main() {
    // Local desktop OAuth credentials are intentionally kept out of the tracked
    // Next.js env file. Desktop OAuth client secrets are embedded identifiers
    // (not confidential once shipped), but they still must never be committed.
    const DRIVE_ENV: &str = "../.env.drive.local";
    println!("cargo:rerun-if-changed={DRIVE_ENV}");
    if let Ok(contents) = std::fs::read_to_string(DRIVE_ENV) {
        for line in contents.lines() {
            let Some((key, raw_value)) = line.trim().split_once('=') else {
                continue;
            };
            let key = key.trim();
            if !matches!(key, "GOOGLE_DRIVE_CLIENT_ID" | "GOOGLE_DRIVE_CLIENT_SECRET")
                || std::env::var_os(key).is_some()
            {
                continue;
            }
            let value = raw_value.trim().trim_matches(['\'', '"']);
            println!("cargo:rustc-env={key}={value}");
        }
    }
    tauri_build::build()
}
